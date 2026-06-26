/**
 * Núcleo do **Checklist de review** (PRD §5, CONTEXT.md §Checklist de review): puro,
 * agnóstico de UI e de store. O modelo persistido (`ReviewState`) e o agregado por
 * camada/feature (`reviewProgress`) moram aqui; o serviço `review` faz o IO no `conf`
 * e a view só desenha. O agregado é **derivado** da árvore + set de checados — nunca
 * armazenado em duplicidade. Issue #7.
 */

import type { ResolvedRepo } from './repo.js';
import type { Context, Layer, LayerGroup, ReviewTree } from './review.js';

/**
 * Estado do checklist de UMA PR, como persiste no `conf` (PRD §5). `checked` é um
 * conjunto-como-mapa (`path → true`); a ausência de chave = arquivo não revisado
 * (estado impossível "false" irrepresentável). `updatedAt` é ISO-8601.
 */
export interface ReviewState {
  checked: Record<string, true>;
  updatedAt: string;
}

/**
 * Chave de persistência do checklist: `<owner>/<name>#<pr>` (PRD §5) — chaveia por
 * repo+PR para não vazar entre PRs. `null` quando o repo é local-only (sem PR
 * remota a revisar); a view de review só roda com identidade GitHub resolvida.
 */
export function prKey(repo: ResolvedRepo, number: number): string | null {
  if (repo.identity.kind !== 'github') return null;
  return `${repo.identity.owner}/${repo.identity.name}#${number}`;
}

/** Set dos paths revisados a partir do estado persistido (modelo → domínio). */
export function checkedSet(state: ReviewState): Set<string> {
  return new Set(Object.keys(state.checked));
}

/** Mapa `path → true` a partir do set de checados (domínio → modelo). */
export function checkedRecord(checked: ReadonlySet<string>): Record<string, true> {
  const record: Record<string, true> = {};
  for (const path of checked) record[path] = true;
  return record;
}

/** Contagem revisados/total de um nível da árvore. */
export interface CountProgress {
  reviewed: number;
  total: number;
}

/**
 * Conta revisados/total de um conjunto de camadas — o nível do meio da árvore,
 * comum aos perfis modular e flat. Uniforme para qualquer recorte: a árvore toda
 * (geral), as camadas de um contexto, ou uma única camada (`[layer]`). É a regra
 * de agregação do checklist (#7); vive no coração, a view só desenha.
 */
export function progressOf(layers: LayerGroup[], checked: ReadonlySet<string>): CountProgress {
  let reviewed = 0;
  let total = 0;
  for (const lg of layers) {
    for (const file of lg.files) {
      total += 1;
      if (checked.has(file.path)) reviewed += 1;
    }
  }
  return { reviewed, total };
}

/** Progresso de uma camada dentro de uma feature. */
export interface LayerProgress {
  layer: Layer;
  progress: CountProgress;
}

/** Progresso de uma feature (contexto) e o detalhe por camada. */
export interface ContextProgress {
  context: Context | null;
  progress: CountProgress;
  layers: LayerProgress[];
}

/** Progresso agregado da PR inteira + por feature + por camada (PRD §6.3). */
export interface ReviewProgress {
  overall: CountProgress;
  contexts: ContextProgress[];
}

/**
 * Dada a árvore `Contexto → Camada → [arquivos]` e o set de paths revisados,
 * calcula o progresso agregado por camada e por feature (e o total). Os `contexts`
 * saem **na mesma ordem** dos `tree.groups` (e `layers` dos `group.layers`), para a
 * navegação lateral alinhar contagem e nó sem re-buscar.
 */
export function reviewProgress(tree: ReviewTree, checked: ReadonlySet<string>): ReviewProgress {
  let overallReviewed = 0;
  let overallTotal = 0;

  const contexts = tree.groups.map((group) => {
    let ctxReviewed = 0;
    let ctxTotal = 0;

    const layers = group.layers.map((lg) => {
      let reviewed = 0;
      for (const file of lg.files) if (checked.has(file.path)) reviewed += 1;
      ctxReviewed += reviewed;
      ctxTotal += lg.files.length;
      return { layer: lg.layer, progress: { reviewed, total: lg.files.length } };
    });

    overallReviewed += ctxReviewed;
    overallTotal += ctxTotal;
    return { context: group.context, progress: { reviewed: ctxReviewed, total: ctxTotal }, layers };
  });

  return { overall: { reviewed: overallReviewed, total: overallTotal }, contexts };
}
