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
 * Estado de exibição com que um arquivo entra em cena: normal abre desdobrado
 * (diff à mostra); gigante abre dobrado (placeholder), evitando o re-render
 * pesado na TUI. O [tab] inverte; trocar de arquivo volta a este default.
 */
export function defaultExpanded(body: DiffBody): boolean {
  return !isOversized(body);
}
