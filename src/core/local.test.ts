import { describe, expect, it } from 'vitest';
import {
  bodyFromPatch,
  detectedLayers,
  isBinaryContent,
  synthesizeAddition,
  toLocalStatus,
  trackedDiffFile,
  untrackedDiffFile,
} from './local.js';
import type { DiffFile } from './diff.js';

describe('synthesizeAddition — untracked como bloco todo-adições', () => {
  it('arquivo multi-linha: cabeçalho @@ -0,0 +1,N @@ + cada linha prefixada com +', () => {
    expect(synthesizeAddition('a\nb\nc\n')).toBe('@@ -0,0 +1,3 @@\n+a\n+b\n+c');
  });

  it('sem newline final: conta as linhas igual (a última linha não tem terminador)', () => {
    expect(synthesizeAddition('a\nb')).toBe('@@ -0,0 +1,2 @@\n+a\n+b');
  });

  it('uma linha só', () => {
    expect(synthesizeAddition('só isto\n')).toBe('@@ -0,0 +1,1 @@\n+só isto');
  });

  it('arquivo vazio: patch vazio (não há adição a mostrar)', () => {
    expect(synthesizeAddition('')).toBe('');
  });
});

describe('isBinaryContent — byte nulo marca não-texto (heurística do git)', () => {
  it('conteúdo com \\0 é binário', () => {
    expect(isBinaryContent(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]))).toBe(true);
  });

  it('\\0 no meio do texto também conta', () => {
    expect(isBinaryContent(Buffer.from('a\0b', 'utf8'))).toBe(true);
  });

  it('texto puro (sem \\0) não é binário', () => {
    expect(isBinaryContent(Buffer.from('<?php\nreturn 1;\n', 'utf8'))).toBe(false);
  });

  it('conteúdo vazio não é binário', () => {
    expect(isBinaryContent(Buffer.alloc(0))).toBe(false);
  });
});

describe('untrackedDiffFile — arquivo novo vira DiffFile', () => {
  it('texto: status added, corpo patch sintetizado, url null', () => {
    const file = untrackedDiffFile('database/migrations/2026_create_x_table.php', Buffer.from('<?php\nreturn 1;\n', 'utf8'));
    expect(file).toEqual<DiffFile>({
      path: 'database/migrations/2026_create_x_table.php',
      status: { kind: 'added' },
      body: { kind: 'patch', patch: '@@ -0,0 +1,2 @@\n+<?php\n+return 1;' },
      url: null,
    });
  });

  it('binário (PNG novo com \\0): status added mas corpo binary, sem sintetizar adições', () => {
    const file = untrackedDiffFile('public/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]));
    expect(file).toEqual<DiffFile>({
      path: 'public/logo.png',
      status: { kind: 'added' },
      body: { kind: 'binary' },
      url: null,
    });
  });

  it('arquivo novo vazio: ainda é added, com patch vazio', () => {
    const file = untrackedDiffFile('.gitkeep', Buffer.alloc(0));
    expect(file.status).toEqual({ kind: 'added' });
    expect(file.body).toEqual({ kind: 'patch', patch: '' });
  });
});

describe('toLocalStatus — códigos do git status → FileStatus', () => {
  it('added (staged new: A␣)', () => {
    expect(toLocalStatus({ path: 'a', index: 'A', workingDir: ' ' })).toEqual({ kind: 'added' });
  });

  it('modified (unstaged: ␣M)', () => {
    expect(toLocalStatus({ path: 'a', index: ' ', workingDir: 'M' })).toEqual({ kind: 'modified' });
  });

  it('removed (deleted: ␣D)', () => {
    expect(toLocalStatus({ path: 'a', index: ' ', workingDir: 'D' })).toEqual({ kind: 'removed' });
  });

  it('renamed carrega o nome antigo (R␣ + from)', () => {
    expect(toLocalStatus({ path: 'novo.ts', index: 'R', workingDir: ' ', from: 'velho.ts' })).toEqual({
      kind: 'renamed',
      from: 'velho.ts',
    });
  });
});

describe('bodyFromPatch — saída crua do git diff → DiffBody', () => {
  it('patch: corta do primeiro @@ (descarta cabeçalho diff --git/index/---/+++)', () => {
    const raw = [
      'diff --git a/foo.ts b/foo.ts',
      'index 111..222 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,2 +1,3 @@',
      ' ctx',
      '-old',
      '+new',
      '',
    ].join('\n');
    expect(bodyFromPatch(raw)).toEqual({
      kind: 'patch',
      patch: '@@ -1,2 +1,3 @@\n ctx\n-old\n+new',
    });
  });

  it('binário: linha "Binary files … differ" sem hunk → binary', () => {
    const raw = 'diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n';
    expect(bodyFromPatch(raw)).toEqual({ kind: 'binary' });
  });

  it('rename puro (sem mudança de conteúdo, sem hunk) → none', () => {
    const raw = 'diff --git a/old b/new\nsimilarity index 100%\nrename from old\nrename to new\n';
    expect(bodyFromPatch(raw)).toEqual({ kind: 'none' });
  });
});

describe('trackedDiffFile — rastreado vira DiffFile (status + corpo)', () => {
  it('deletado: status removed + patch só de remoções', () => {
    const raw = 'diff --git a/x b/x\ndeleted file mode 100644\n--- a/x\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n-b\n';
    const file = trackedDiffFile({ path: 'x', index: ' ', workingDir: 'D' }, raw);
    expect(file.status).toEqual({ kind: 'removed' });
    expect(file.body).toEqual({ kind: 'patch', patch: '@@ -1,2 +0,0 @@\n-a\n-b' });
    expect(file.url).toBeNull();
  });

  it('renomeado puro: status renamed (com from) + corpo none', () => {
    const raw = 'diff --git a/old b/new\nsimilarity index 100%\nrename from old\nrename to new\n';
    const file = trackedDiffFile({ path: 'new', index: 'R', workingDir: ' ', from: 'old' }, raw);
    expect(file.status).toEqual({ kind: 'renamed', from: 'old' });
    expect(file.body).toEqual({ kind: 'none' });
  });
});

describe('detectedLayers — camadas presentes no change-set, na ordem canônica', () => {
  const file = (path: string): DiffFile => ({
    path,
    status: { kind: 'modified' },
    body: { kind: 'none' },
    url: null,
  });

  it('uma camada só (gate por camada)', () => {
    expect(detectedLayers([file('database/migrations/2026_create_x_table.php')])).toEqual(['migration']);
  });

  it('multi-camada: lista todas na ordem LAYER_ORDER, distintas (degradação graciosa)', () => {
    const layers = detectedLayers([
      file('tests/Feature/XTest.php'),
      file('app/Actions/CreateX.php'),
      file('database/migrations/2026_create_x_table.php'),
      file('app/Actions/UpdateX.php'),
    ]);
    // migration antes de action antes de tests, e 'action' aparece uma vez só.
    expect(layers).toEqual(['migration', 'action', 'tests']);
  });

  it('change-set vazio → nenhuma camada', () => {
    expect(detectedLayers([])).toEqual([]);
  });
});
