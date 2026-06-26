import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile } from '../core/diff.js';

// Mocka simple-git e fs: o serviço é testado sem repo git real e sem fs real.
// `add` é incluído só para PROVAR que nunca é chamado (index não é tocado).
const { status, gitDiff, add } = vi.hoisted(() => ({
  status: vi.fn(),
  gitDiff: vi.fn(),
  add: vi.fn(),
}));
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({ status, diff: gitDiff, add })),
}));
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('node:fs', () => ({ promises: { readFile } }));

import { diff } from './local.js';

/** StatusResult mínimo: só os campos que o serviço lê. */
const statusResult = (
  files: { path: string; index: string; working_dir: string }[],
  renamed: { from: string; to: string }[] = [],
) => ({ files, renamed });

beforeEach(() => {
  status.mockReset();
  gitDiff.mockReset();
  add.mockReset();
  readFile.mockReset();
});

describe('local.diff — change-set não-commitado (staged+unstaged+untracked)', () => {
  it('untracked aparece via bloco de adição sintetizado, lendo o conteúdo do fs', async () => {
    status.mockResolvedValue(
      statusResult([{ path: 'database/migrations/2026_create_x_table.php', index: '?', working_dir: '?' }]),
    );
    readFile.mockResolvedValue('<?php\nreturn 1;\n');

    const files = await diff('/repo');

    expect(files).toEqual<DiffFile[]>([
      {
        path: 'database/migrations/2026_create_x_table.php',
        status: { kind: 'added' },
        body: { kind: 'patch', patch: '@@ -0,0 +1,2 @@\n+<?php\n+return 1;' },
        url: null,
      },
    ]);
    // leu o arquivo (caminho absoluto sob o repo), não o git diff dele.
    expect(readFile).toHaveBeenCalledWith('/repo/database/migrations/2026_create_x_table.php', 'utf8');
    expect(gitDiff).not.toHaveBeenCalled();
  });

  it('o index NÃO é tocado: nunca chama add/add -N (read-only, AC)', async () => {
    status.mockResolvedValue(
      statusResult([{ path: 'novo.ts', index: '?', working_dir: '?' }]),
    );
    readFile.mockResolvedValue('x\n');

    await diff('/repo');

    expect(add).not.toHaveBeenCalled();
  });

  it('rastreado modificado: patch de git diff HEAD (staged+unstaged), classificado pelo núcleo', async () => {
    status.mockResolvedValue(statusResult([{ path: 'app/Models/Plan.php', index: 'M', working_dir: 'M' }]));
    gitDiff.mockResolvedValue('diff --git a/app/Models/Plan.php b/app/Models/Plan.php\n--- a/app/Models/Plan.php\n+++ b/app/Models/Plan.php\n@@ -1 +1 @@\n-old\n+new\n');

    const files = await diff('/repo');

    expect(gitDiff).toHaveBeenCalledWith(['HEAD', '--', 'app/Models/Plan.php']);
    expect(files[0]).toEqual<DiffFile>({
      path: 'app/Models/Plan.php',
      status: { kind: 'modified' },
      body: { kind: 'patch', patch: '@@ -1 +1 @@\n-old\n+new' },
      url: null,
    });
  });

  it('renomeado puro: passa AMBOS os caminhos ao git diff, vira renamed + body none', async () => {
    status.mockResolvedValue(
      statusResult(
        [{ path: 'app/Services/New.php', index: 'R', working_dir: ' ' }],
        [{ from: 'app/Services/Old.php', to: 'app/Services/New.php' }],
      ),
    );
    // Saída REAL de `git diff HEAD -- <antigo> <novo>` para rename puro (100%).
    gitDiff.mockResolvedValue('diff --git a/app/Services/Old.php b/app/Services/New.php\nsimilarity index 100%\nrename from app/Services/Old.php\nrename to app/Services/New.php\n');

    const files = await diff('/repo');

    // Sem ambos os caminhos, o git daria "new file" com o arquivo todo em verde.
    expect(gitDiff).toHaveBeenCalledWith(['HEAD', '--', 'app/Services/Old.php', 'app/Services/New.php']);
    expect(files[0].status).toEqual({ kind: 'renamed', from: 'app/Services/Old.php' });
    expect(files[0].body).toEqual({ kind: 'none' });
  });

  it('renomeado COM edição: corpo é o delta do hunk, não o arquivo inteiro como adições', async () => {
    status.mockResolvedValue(
      statusResult(
        [{ path: 'new.txt', index: 'R', working_dir: 'M' }],
        [{ from: 'old.txt', to: 'new.txt' }],
      ),
    );
    // Saída REAL de `git diff HEAD -- old.txt new.txt` para rename+edição (60%).
    gitDiff.mockResolvedValue(
      'diff --git a/old.txt b/new.txt\nsimilarity index 60%\nrename from old.txt\nrename to new.txt\nindex f9d9a01..617a11f 100644\n--- a/old.txt\n+++ b/new.txt\n@@ -1,7 +1,7 @@\n a\n b\n c\n-d\n+CHANGED\n e\n f\n g\n',
    );

    const files = await diff('/repo');

    expect(gitDiff).toHaveBeenCalledWith(['HEAD', '--', 'old.txt', 'new.txt']);
    expect(files[0].status).toEqual({ kind: 'renamed', from: 'old.txt' });
    expect(files[0].body).toEqual({
      kind: 'patch',
      patch: '@@ -1,7 +1,7 @@\n a\n b\n c\n-d\n+CHANGED\n e\n f\n g',
    });
  });

  it('deletado vira DiffFile removed com o patch só de remoções', async () => {
    status.mockResolvedValue(statusResult([{ path: 'velho.ts', index: ' ', working_dir: 'D' }]));
    gitDiff.mockResolvedValue('diff --git a/velho.ts b/velho.ts\ndeleted file mode 100644\n--- a/velho.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n-b\n');

    const files = await diff('/repo');

    expect(files[0].status).toEqual({ kind: 'removed' });
    expect(files[0].body).toEqual({ kind: 'patch', patch: '@@ -1,2 +0,0 @@\n-a\n-b' });
  });

  it('binário vira DiffFile binary (sem hunk no git diff)', async () => {
    status.mockResolvedValue(statusResult([{ path: 'logo.png', index: ' ', working_dir: 'M' }]));
    gitDiff.mockResolvedValue('diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n');

    const files = await diff('/repo');

    expect(files[0].body).toEqual({ kind: 'binary' });
  });

  it('change-set vazio: lista vazia, sem ler fs nem git diff', async () => {
    status.mockResolvedValue(statusResult([]));

    expect(await diff('/repo')).toEqual([]);
    expect(readFile).not.toHaveBeenCalled();
    expect(gitDiff).not.toHaveBeenCalled();
  });

  it('mistura untracked + rastreado: todos aparecem, untracked inclusive (AC)', async () => {
    status.mockResolvedValue(
      statusResult([
        { path: 'database/migrations/2026_create_x_table.php', index: '?', working_dir: '?' },
        { path: 'app/Models/X.php', index: ' ', working_dir: 'M' },
      ]),
    );
    readFile.mockResolvedValue('novo\n');
    gitDiff.mockResolvedValue('@@ -1 +1 @@\n+y\n');

    const files = await diff('/repo');

    expect(files.map((f) => f.path)).toEqual([
      'database/migrations/2026_create_x_table.php',
      'app/Models/X.php',
    ]);
    expect(files[0].status).toEqual({ kind: 'added' });
    expect(add).not.toHaveBeenCalled();
  });
});
