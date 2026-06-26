/**
 * Núcleo do **arquivo de diff** (PRD §6.5, CONTEXT.md §Render de diff): puro,
 * agnóstico de UI e de fonte. As fontes (Octokit em #5/#8, `simple-git` depois)
 * só trazem os campos crus de cada arquivo alterado; a decisão de *o que é*
 * aquele arquivo (criado/deletado/renomeado · texto/binário/truncado) e *como*
 * renderizar (badge, colapso por teto de linhas) mora aqui — nunca na view nem
 * no serviço. Issue #8.
 */

/**
 * Como o arquivo entrou no diff (CONTEXT.md §Camada evita "tipo de arquivo" p/
 * o papel; aqui é o *status* do change-set). União discriminada: o renomeado
 * carrega o nome antigo (`from`) e nenhum outro estado o carrega — estado
 * impossível irrepresentável.
 */
export type FileStatus =
  | { kind: 'added' }
  | { kind: 'removed' }
  | { kind: 'modified' }
  | { kind: 'renamed'; from: string };

/**
 * O corpo desenhável do diff de um arquivo. União discriminada cobrindo os
 * casos da v1 (PRD §6.5): `patch` (hunks unified) · `binary` (sem corpo) ·
 * `truncated` (mudou mas o GitHub omitiu o patch grande) · `none` (sem mudança
 * de conteúdo, ex.: renomeado puro). Só `patch` carrega texto — não há "patch
 * de um binário" representável.
 */
export type DiffBody =
  | { kind: 'patch'; patch: string }
  | { kind: 'binary' }
  | { kind: 'truncated' }
  | { kind: 'none' };

/** Um arquivo alterado vindo de uma fonte (serviço), antes de categorizado. */
export interface DiffFile {
  path: string;
  status: FileStatus;
  body: DiffBody;
  /** URL do arquivo no GitHub (`blob_url`), p/ ver o diff truncado/binário; `null` no modo local. */
  url: string | null;
}

/** Campos crus de um arquivo do endpoint `pulls.listFiles` (o que `toDiffFile` consome). */
export interface RawDiffFile {
  filename: string;
  status: string;
  changes: number;
  patch?: string | null;
  previous_filename?: string;
  blob_url?: string;
}

/** Teto de linhas de patch acima do qual o arquivo abre **colapsado** (PRD §6.5). */
export const COLLAPSE_CEILING = 1500;

function toStatus(raw: RawDiffFile): FileStatus {
  switch (raw.status) {
    case 'added':
      return { kind: 'added' };
    case 'removed':
      return { kind: 'removed' };
    case 'renamed':
      return { kind: 'renamed', from: raw.previous_filename ?? '?' };
    default:
      // modified · changed · copied · unchanged
      return { kind: 'modified' };
  }
}

/**
 * Classifica o corpo a partir dos campos crus. O GitHub não marca "binário" nem
 * "truncado" explicitamente, então a regra é: **patch presente** → `patch`;
 * **sem patch mas com mudanças** → `truncated` (patch grande demais, omitido);
 * **sem patch e sem mudança** → `none` se renomeado puro, senão `binary`.
 */
function toBody(raw: RawDiffFile, status: FileStatus): DiffBody {
  const patch = raw.patch ?? null;
  if (patch !== null && patch.length > 0) return { kind: 'patch', patch };
  if (raw.changes > 0) return { kind: 'truncated' };
  if (status.kind === 'renamed') return { kind: 'none' };
  return { kind: 'binary' };
}

/** Campos crus do arquivo → [DiffFile](#difffile). Pura; é o coração do serviço `pr.diff`. */
export function toDiffFile(raw: RawDiffFile): DiffFile {
  const status = toStatus(raw);
  return {
    path: raw.filename,
    status,
    body: toBody(raw, status),
    url: raw.blob_url ?? null,
  };
}

/**
 * Rótulos curtos do cabeçalho do arquivo (PRD §6.5): status (criado/deletado/
 * renomeado) e natureza do corpo (binário/diff truncado). Modificado e patch
 * normal não geram badge (são o caso comum). Lista pode ter 0, 1 ou 2 itens.
 */
export function badgesFor(file: Pick<DiffFile, 'status' | 'body'>): string[] {
  const badges: string[] = [];
  switch (file.status.kind) {
    case 'added':
      badges.push('criado');
      break;
    case 'removed':
      badges.push('deletado');
      break;
    case 'renamed':
      badges.push('renomeado');
      break;
    case 'modified':
      break;
  }
  switch (file.body.kind) {
    case 'binary':
      badges.push('binário');
      break;
    case 'truncated':
      badges.push('diff truncado');
      break;
    case 'patch':
    case 'none':
      break;
  }
  return badges;
}

/**
 * O patch é grande demais p/ renderizar de cara? (PRD §6.5: arquivo gigante abre
 * colapsado p/ evitar re-render pesado na TUI.) Só patch tem corpo a colapsar.
 */
export function isOversized(body: DiffBody, ceiling: number = COLLAPSE_CEILING): boolean {
  return body.kind === 'patch' && body.patch.split('\n').length > ceiling;
}

/**
 * O arquivo tem **conteúdo de texto presente no disco** para abrir no modal de
 * arquivo completo ([z], issue #53)? Só corpo `patch` carrega texto — mas o
 * **deletado** também vem como `patch` (o diff de remoção), e dele não há arquivo
 * no disco a ler. Logo: patch E não-removido. Binário, diretório colapsado
 * (`none`) e truncado ficam de fora — `z` é no-op silencioso neles.
 */
export function isViewable(file: Pick<DiffFile, 'status' | 'body'>): boolean {
  return file.body.kind === 'patch' && file.status.kind !== 'removed';
}

/**
 * Índices (0-based) das linhas que abrem um hunk (`@@ … @@`) no patch — as
 * âncoras por onde o [j/k] salta no diff (navegação por bloco). Vazio quando o
 * patch não tem cabeçalho de hunk (ex.: corpo já fatiado pelo serviço local).
 */
export function hunkStarts(patch: string): number[] {
  const starts: number[] = [];
  const lines = patch.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) starts.push(i);
  }
  return starts;
}

/**
 * Maior `scrollTop` que ainda desenha conteúdo: garante que a última página
 * (`maxRows` linhas) seja alcançável mesmo quando um único hunk é mais alto que o
 * viewport. Sem isso, o scroll ancorado em hunk deixa a cauda do hunk inacessível.
 */
export function maxScrollTop(totalLines: number, maxRows: number): number {
  return Math.max(0, totalLines - maxRows);
}

/** Índice do hunk que contém (ou precede) a linha `scrollTop` — rótulo "bloco N/N". */
export function hunkAt(starts: number[], scrollTop: number): number {
  let idx = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= scrollTop) idx = i;
    else break;
  }
  return idx;
}

/** Próximo início de hunk estritamente após `scrollTop` ([J]); fica no último se não houver. */
export function nextHunkStart(starts: number[], scrollTop: number): number {
  for (const s of starts) if (s > scrollTop) return s;
  return starts.length > 0 ? starts[starts.length - 1] : 0;
}

/** Início de hunk estritamente antes de `scrollTop` ([K]); cai em 0 se não houver. */
export function prevHunkStart(starts: number[], scrollTop: number): number {
  let prev = 0;
  for (const s of starts) {
    if (s < scrollTop) prev = s;
    else break;
  }
  return prev;
}

/**
 * Faixa `[start, end)` em coordenadas de **conteúdo** (após o marcador +/−) da
 * sub-região que de fato mudou numa linha — o realce intra-linha do diff (estilo
 * `*_rich` do GitButler). `end` é exclusivo.
 */
export interface IntralineRange {
  start: number;
  end: number;
}

function isDelLine(line: string): boolean {
  return line.startsWith('-') && !line.startsWith('---');
}

function isAddLine(line: string): boolean {
  return line.startsWith('+') && !line.startsWith('+++');
}

/**
 * Trecho central que difere entre o conteúdo removido `a` e o adicionado `b`,
 * por prefixo/sufixo comum (refino char-a-char, barato e robusto — o mesmo
 * princípio do diff intra-linha de `delta`/`git`). Retorna a faixa em cada lado
 * só quando há um meio não-vazio ali; prefixo/sufixo idênticos ficam de fora.
 */
function changedMiddle(a: string, b: string): { del?: IntralineRange; add?: IntralineRange } {
  if (a === b) return {};
  const min = Math.min(a.length, b.length);
  let p = 0;
  while (p < min && a[p] === b[p]) p++;
  let s = 0;
  while (s < min - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const del = p < a.length - s ? { start: p, end: a.length - s } : undefined;
  const add = p < b.length - s ? { start: p, end: b.length - s } : undefined;
  return { del, add };
}

/**
 * Refino **intra-linha** de um patch unified: para cada índice de linha que tem
 * uma sub-região alterada, a faixa `[start, end)` (em coords de conteúdo) a
 * realçar. Aplica-se só ao caso limpo e inequívoco — um bloco de `N` linhas
 * removidas seguido imediatamente por `N` adicionadas, pareadas por posição —,
 * onde o "uma linha virou outra" é nítido; blocos de tamanhos diferentes (inserção/
 * remoção pura, edição multi-linha desalinhada) não são refinados. Puro.
 */
export function refineIntraline(lines: string[]): Map<number, IntralineRange> {
  const out = new Map<number, IntralineRange>();
  let i = 0;
  while (i < lines.length) {
    if (!isDelLine(lines[i])) {
      i++;
      continue;
    }
    let delEnd = i;
    while (delEnd < lines.length && isDelLine(lines[delEnd])) delEnd++;
    let addEnd = delEnd;
    while (addEnd < lines.length && isAddLine(lines[addEnd])) addEnd++;
    const dels = delEnd - i;
    const adds = addEnd - delEnd;
    if (dels > 0 && dels === adds) {
      for (let k = 0; k < dels; k++) {
        const seg = changedMiddle(lines[i + k].slice(1), lines[delEnd + k].slice(1));
        if (seg.del) out.set(i + k, seg.del);
        if (seg.add) out.set(delEnd + k, seg.add);
      }
    }
    i = addEnd > i ? addEnd : i + 1;
  }
  return out;
}
