import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile } from '../core/diff.js';

// Mocka simple-git e fs: o serviço é testado sem repo git real e sem fs real.
// `add` é incluído só para PROVAR que nunca é chamado (index não é tocado).
const { status, gitDiff, add, revparse, reset, gitCommit } = vi.hoisted(() => ({
  status: vi.fn(),
  gitDiff: vi.fn(),
  add: vi.fn(),
  revparse: vi.fn(),
  reset: vi.fn(),
  gitCommit: vi.fn(),
}));
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({ status, diff: gitDiff, add, revparse, reset, commit: gitCommit })),
}));
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('node:fs', () => ({ promises: { readFile } }));

import { commit, diff, stage, stagedDiff, stagedPaths, unstage } from './local.js';

/** StatusResult mínimo: só os campos que o serviço lê. */
const statusResult = (
  files: { path: string; index: string; working_dir: string }[],
  renamed: { from: string; to: string }[] = [],
) => ({ files, renamed });

beforeEach(() => {
  status.mockReset();
  gitDiff.mockReset();
  add.mockReset();
  reset.mockReset();
  gitCommit.mockReset();
  readFile.mockReset();
  // Default: repo com HEAD (revparse resolve). O caso sem HEAD sobrescreve.
  revparse.mockReset();
  revparse.mockResolvedValue('deadbeef');
});

describe('local.diff — change-set não-commitado (staged+unstaged+untracked)', () => {
  it('untracked aparece via bloco de adição sintetizado, lendo o conteúdo do fs', async () => {
    status.mockResolvedValue(
      statusResult([{ path: 'database/migrations/2026_create_x_table.php', index: '?', working_dir: '?' }]),
    );
    readFile.mockResolvedValue(Buffer.from('<?php\nreturn 1;\n', 'utf8'));

    const files = await diff('/repo');

    expect(files).toEqual<DiffFile[]>([
      {
        path: 'database/migrations/2026_create_x_table.php',
        status: { kind: 'added' },
        body: { kind: 'patch', patch: '@@ -0,0 +1,2 @@\n+<?php\n+return 1;' },
        url: null,
      },
    ]);
    // leu os bytes crus do arquivo (caminho absoluto sob o repo, SEM encoding),
    // não o git diff dele.
    expect(readFile).toHaveBeenCalledWith('/repo/database/migrations/2026_create_x_table.php');
    expect(gitDiff).not.toHaveBeenCalled();
  });

  it('untracked binário (PNG novo com \\0): vira binary, sem sintetizar mojibake como adições', async () => {
    status.mockResolvedValue(statusResult([{ path: 'public/logo.png', index: '?', working_dir: '?' }]));
    readFile.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]));

    const files = await diff('/repo');

    expect(files[0]).toEqual<DiffFile>({
      path: 'public/logo.png',
      status: { kind: 'added' },
      body: { kind: 'binary' },
      url: null,
    });
    expect(gitDiff).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('diretório untracked colapsado (repo git embarcado: `?? dir/`): vira added sem corpo, sem ler o fs (não dá EISDIR)', async () => {
    // O git não recursiona num repo embarcado e devolve a entrada com barra final;
    // o serviço lia isso com fs.readFile e quebrava com "EISDIR ... read",
    // derrubando o Working diff inteiro.
    status.mockResolvedValue(statusResult([{ path: 'embedded/', index: '?', working_dir: '?' }]));

    const files = await diff('/repo');

    expect(files).toEqual<DiffFile[]>([
      { path: 'embedded', status: { kind: 'added' }, body: { kind: 'none' }, url: null },
    ]);
    // não tentou ler o diretório como arquivo nem rodou git diff nele.
    expect(readFile).not.toHaveBeenCalled();
    expect(gitDiff).not.toHaveBeenCalled();
  });

  it('symlink-para-diretório untracked (`?? link`, SEM barra): readFile dá EISDIR → added sem corpo, não derruba o diff', async () => {
    // O git não anexa barra final a um symlink, então isDirEntry (que olha a barra)
    // não o pega; mas o link resolve p/ um diretório e fs.readFile o segue e lança
    // EISDIR. Antes, isso derrubava o Working diff inteiro; agora vira um DiffFile
    // sem corpo, igual ao repo embarcado (só o fs revela que é diretório).
    status.mockResolvedValue(statusResult([{ path: 'thelink', index: '?', working_dir: '?' }]));
    readFile.mockRejectedValue(
      Object.assign(new Error('EISDIR: illegal operation on a directory, read'), { code: 'EISDIR' }),
    );

    const files = await diff('/repo');

    expect(files).toEqual<DiffFile[]>([
      { path: 'thelink', status: { kind: 'added' }, body: { kind: 'none' }, url: null },
    ]);
    expect(gitDiff).not.toHaveBeenCalled();
  });

  it('o index NÃO é tocado: nunca chama add/add -N (read-only, AC)', async () => {
    status.mockResolvedValue(
      statusResult([{ path: 'novo.ts', index: '?', working_dir: '?' }]),
    );
    readFile.mockResolvedValue(Buffer.from('x\n', 'utf8'));

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

  it('repo sem HEAD (zero commits): tudo é novo, sintetiza do fs sem git diff HEAD', async () => {
    // revparse rejeita: "bad revision 'HEAD'" — repo recém-criado, antes do 1º commit.
    revparse.mockRejectedValue(new Error("fatal: bad revision 'HEAD'"));
    // Arquivo já staged (index 'A') mas sem commit base: o ramo rastreado chamaria
    // `git diff HEAD` e quebraria; com #35 ele cai na síntese, igual ao untracked.
    status.mockResolvedValue(statusResult([{ path: 'src/index.ts', index: 'A', working_dir: ' ' }]));
    readFile.mockResolvedValue(Buffer.from('export const x = 1;\n', 'utf8'));

    const files = await diff('/repo');

    expect(files).toEqual<DiffFile[]>([
      {
        path: 'src/index.ts',
        status: { kind: 'added' },
        body: { kind: 'patch', patch: '@@ -0,0 +1,1 @@\n+export const x = 1;' },
        url: null,
      },
    ]);
    expect(readFile).toHaveBeenCalledWith('/repo/src/index.ts');
    // O erro genérico não acontece: git diff HEAD nunca é chamado, e o index fica intocado.
    expect(gitDiff).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
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
    readFile.mockResolvedValue(Buffer.from('novo\n', 'utf8'));
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

describe('local — escritas do portão de commit (#47)', () => {
  it('stagedPaths: parseia o name-only do diff --cached num Set, ignorando vazios', async () => {
    gitDiff.mockResolvedValue('a.ts\nsrc/b.ts\n\n');
    const paths = await stagedPaths('/repo');
    expect(gitDiff).toHaveBeenCalledWith(['--cached', '--name-only']);
    expect(paths).toEqual(new Set(['a.ts', 'src/b.ts']));
  });

  it('stage: git add dos paths; no-op sem paths', async () => {
    await stage('/repo', ['a.ts', 'b.ts']);
    expect(add).toHaveBeenCalledWith(['a.ts', 'b.ts']);
    add.mockClear();
    await stage('/repo', []);
    expect(add).not.toHaveBeenCalled();
  });

  it('unstage: git reset -- <paths> (não toca a working tree); no-op sem paths', async () => {
    await unstage('/repo', ['a.ts']);
    expect(reset).toHaveBeenCalledWith(['--', 'a.ts']);
    reset.mockClear();
    await unstage('/repo', []);
    expect(reset).not.toHaveBeenCalled();
  });

  it('stagedDiff: git diff --cached dos paths', async () => {
    gitDiff.mockResolvedValue('PATCH');
    expect(await stagedDiff('/repo', ['a.ts'])).toBe('PATCH');
    expect(gitDiff).toHaveBeenCalledWith(['--cached', '--', 'a.ts']);
  });

  it('commit: git commit com a mensagem', async () => {
    await commit('/repo', 'feat: x');
    expect(gitCommit).toHaveBeenCalledWith('feat: x');
  });

  it('commit: falha do hook propaga como erro (staging fica de pé)', async () => {
    gitCommit.mockRejectedValue(new Error('pre-commit hook failed'));
    await expect(commit('/repo', 'feat: x')).rejects.toThrow('pre-commit hook failed');
  });
});
