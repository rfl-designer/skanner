import { describe, expect, it } from 'vitest';
import {
  badgesFor,
  COLLAPSE_CEILING,
  hunkStarts,
  isOversized,
  toDiffFile,
  type DiffFile,
} from './diff.js';

describe('toDiffFile — campos crus → arquivo de diff', () => {
  it('texto com patch: corpo patch, status modificado, url passada', () => {
    const file = toDiffFile({
      filename: 'src/a.ts',
      status: 'modified',
      changes: 4,
      patch: '@@ -1 +1 @@\n+x',
      blob_url: 'https://github.com/o/r/blob/sha/src/a.ts',
    });
    expect(file).toEqual<DiffFile>({
      path: 'src/a.ts',
      status: { kind: 'modified' },
      body: { kind: 'patch', patch: '@@ -1 +1 @@\n+x' },
      url: 'https://github.com/o/r/blob/sha/src/a.ts',
    });
  });

  it('criado e deletado viram status added/removed', () => {
    expect(toDiffFile({ filename: 'n.ts', status: 'added', changes: 2, patch: '+a' }).status).toEqual({
      kind: 'added',
    });
    expect(toDiffFile({ filename: 'o.ts', status: 'removed', changes: 2, patch: '-a' }).status).toEqual({
      kind: 'removed',
    });
  });

  it('renomeado carrega o nome antigo; corpo none quando não muda conteúdo', () => {
    const file = toDiffFile({
      filename: 'src/new.ts',
      status: 'renamed',
      changes: 0,
      previous_filename: 'src/old.ts',
    });
    expect(file.status).toEqual({ kind: 'renamed', from: 'src/old.ts' });
    expect(file.body).toEqual({ kind: 'none' });
  });

  it('renomeado COM mudança de conteúdo mantém o patch', () => {
    const file = toDiffFile({
      filename: 'src/new.ts',
      status: 'renamed',
      changes: 3,
      previous_filename: 'src/old.ts',
      patch: '@@ -1 +1 @@\n+y',
    });
    expect(file.body).toEqual({ kind: 'patch', patch: '@@ -1 +1 @@\n+y' });
  });

  it('sem patch e sem mudança = binário', () => {
    const file = toDiffFile({ filename: 'logo.png', status: 'modified', changes: 0 });
    expect(file.body).toEqual({ kind: 'binary' });
    expect(file.url).toBeNull();
  });

  it('sem patch mas com mudanças = truncado (patch grande demais omitido)', () => {
    const file = toDiffFile({ filename: 'huge.lock', status: 'modified', changes: 9000 });
    expect(file.body).toEqual({ kind: 'truncated' });
  });
});

describe('badgesFor — rótulos do cabeçalho', () => {
  it('modificado com patch: sem badge', () => {
    expect(badgesFor({ status: { kind: 'modified' }, body: { kind: 'patch', patch: 'x' } })).toEqual([]);
  });

  it('criado / deletado / renomeado', () => {
    expect(badgesFor({ status: { kind: 'added' }, body: { kind: 'patch', patch: 'x' } })).toEqual(['criado']);
    expect(badgesFor({ status: { kind: 'removed' }, body: { kind: 'patch', patch: 'x' } })).toEqual([
      'deletado',
    ]);
    expect(badgesFor({ status: { kind: 'renamed', from: 'o' }, body: { kind: 'none' } })).toEqual([
      'renomeado',
    ]);
  });

  it('binário e truncado adicionam badge de corpo', () => {
    expect(badgesFor({ status: { kind: 'modified' }, body: { kind: 'binary' } })).toEqual(['binário']);
    expect(badgesFor({ status: { kind: 'modified' }, body: { kind: 'truncated' } })).toEqual([
      'diff truncado',
    ]);
  });

  it('combina status + corpo (renomeado + binário)', () => {
    expect(badgesFor({ status: { kind: 'renamed', from: 'o' }, body: { kind: 'binary' } })).toEqual([
      'renomeado',
      'binário',
    ]);
  });
});

describe('isOversized — colapso por teto de linhas', () => {
  it('patch abaixo do teto não colapsa', () => {
    const patch = Array.from({ length: COLLAPSE_CEILING }, () => 'x').join('\n');
    expect(isOversized({ kind: 'patch', patch })).toBe(false);
  });

  it('patch acima do teto colapsa', () => {
    const patch = Array.from({ length: COLLAPSE_CEILING + 1 }, () => 'x').join('\n');
    expect(isOversized({ kind: 'patch', patch })).toBe(true);
  });

  it('binário/truncado/none nunca colapsam (não têm corpo)', () => {
    expect(isOversized({ kind: 'binary' })).toBe(false);
    expect(isOversized({ kind: 'truncated' })).toBe(false);
    expect(isOversized({ kind: 'none' })).toBe(false);
  });
});

describe('hunkStarts — âncoras de bloco no patch', () => {
  it('acha a linha de cada cabeçalho @@', () => {
    const patch = '@@ -1,2 +1,2 @@\n-a\n+b\n@@ -10,2 +10,2 @@\n-c\n+d';
    expect(hunkStarts(patch)).toEqual([0, 3]);
  });

  it('patch sem cabeçalho de hunk não tem âncoras', () => {
    expect(hunkStarts('+linha solta\n+outra')).toEqual([]);
  });
});
