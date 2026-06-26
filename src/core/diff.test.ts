import { describe, expect, it } from 'vitest';
import {
  badgesFor,
  COLLAPSE_CEILING,
  hunkAt,
  hunkStarts,
  isOversized,
  isViewable,
  maxScrollTop,
  nextHunkStart,
  prevHunkStart,
  refineIntraline,
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

describe('isViewable — tem texto no disco p/ o modal de arquivo [z]', () => {
  it('texto modificado/criado (corpo patch) é exibível', () => {
    expect(isViewable({ status: { kind: 'modified' }, body: { kind: 'patch', patch: 'x' } })).toBe(true);
    expect(isViewable({ status: { kind: 'added' }, body: { kind: 'patch', patch: 'x' } })).toBe(true);
  });

  it('deletado NÃO é exibível, mesmo com corpo patch (não há arquivo no disco)', () => {
    expect(isViewable({ status: { kind: 'removed' }, body: { kind: 'patch', patch: '-x' } })).toBe(false);
  });

  it('binário, diretório colapsado (none) e truncado não são exibíveis', () => {
    expect(isViewable({ status: { kind: 'modified' }, body: { kind: 'binary' } })).toBe(false);
    expect(isViewable({ status: { kind: 'added' }, body: { kind: 'none' } })).toBe(false);
    expect(isViewable({ status: { kind: 'modified' }, body: { kind: 'truncated' } })).toBe(false);
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

describe('scroll por linha do diff (#scroll: hunk maior que a tela)', () => {
  it('maxScrollTop garante a última página alcançável — e nunca é negativo', () => {
    expect(maxScrollTop(30, 10)).toBe(20); // sobra 20 acima do topo da última página
    expect(maxScrollTop(8, 15)).toBe(0); // diff menor que o viewport não rola
  });

  it('hunkAt resolve o bloco que contém (ou precede) o topo do viewport', () => {
    const starts = [0, 21];
    expect(hunkAt(starts, 0)).toBe(0);
    expect(hunkAt(starts, 20)).toBe(0); // ainda dentro do 1º bloco
    expect(hunkAt(starts, 21)).toBe(1); // chegou no 2º
    expect(hunkAt([], 5)).toBe(0); // sem hunks: não estoura
  });

  it('nextHunkStart pula para o próximo @@ e fica no último quando não há mais', () => {
    const starts = [0, 21];
    expect(nextHunkStart(starts, 0)).toBe(21);
    expect(nextHunkStart(starts, 21)).toBe(21); // já no último: não avança
  });

  it('prevHunkStart volta para o @@ anterior e cai em 0 quando não há', () => {
    const starts = [0, 21];
    expect(prevHunkStart(starts, 21)).toBe(0);
    expect(prevHunkStart(starts, 0)).toBe(0); // já no primeiro
  });
});

describe('refineIntraline — realce da sub-região que mudou', () => {
  it('par −/+ alinhado: realça só o meio que diferiu (prefixo/sufixo comuns ficam de fora)', () => {
    // conteúdo: "const x = 1;" → "const x = 2;" — só o "1"/"2" mudou (índice 10).
    const lines = ['@@ -1 +1 @@', '-const x = 1;', '+const x = 2;'];
    const ranges = refineIntraline(lines);
    expect(ranges.get(1)).toEqual({ start: 10, end: 11 }); // linha removida
    expect(ranges.get(2)).toEqual({ start: 10, end: 11 }); // linha adicionada
  });

  it('inserção pura (sufixo acrescentado): só o lado adicionado ganha faixa', () => {
    const lines = ['-foo', '+foobar'];
    const ranges = refineIntraline(lines);
    expect(ranges.has(0)).toBe(false); // nada removido do "foo"
    expect(ranges.get(1)).toEqual({ start: 3, end: 6 }); // "bar"
  });

  it('bloco de tamanhos diferentes não é refinado (pareamento ambíguo)', () => {
    const lines = ['-a', '-b', '+c']; // 2 removidas, 1 adicionada
    expect(refineIntraline(lines).size).toBe(0);
  });

  it('linha de contexto e cabeçalho de hunk são ignorados', () => {
    const lines = [' contexto', '@@ -1 +1 @@', '+nova'];
    expect(refineIntraline(lines).size).toBe(0); // sem par −/+
  });

  it('não confunde os marcadores de cabeçalho de arquivo (---/+++) com linhas de diff', () => {
    const lines = ['--- a/x', '+++ b/x'];
    expect(refineIntraline(lines).size).toBe(0);
  });
});
