import type { PullRequest } from '../services/prs.js';

/**
 * Função-coração dos filtros da lista de PRs (CONTEXT.md §Funções-coração, issue
 * #10): pura, agnóstica de UI e de fonte, testável isolada. A view só guarda o
 * estado e renderiza; o serviço `prs` faz o IO. A regra de "qual PR passa pelo
 * filtro" mora só aqui.
 *
 * Estado impossível irrepresentável: a ausência de um filtro é `null` explícito
 * (não string vazia ambígua) para base/autor; `query` é a busca textual crua
 * (vazia = sem busca) e `hideDrafts` é um booleano simples.
 */

/** Os quatro eixos de filtro da lista, lembrados por repo. */
export interface PrFilters {
  /** Oculta as PRs em rascunho (draft) quando `true`. */
  hideDrafts: boolean;
  /** Branch base exata a manter, ou `null` para não filtrar por base. */
  baseBranch: string | null;
  /** Autor exato a manter, ou `null` para não filtrar por autor. */
  author: string | null;
  /** Busca textual no título (case-insensitive); vazia = sem busca. */
  query: string;
}

/** Filtro neutro — passa tudo. Default ao abrir um repo sem filtros lembrados. */
export const NO_FILTERS: PrFilters = {
  hideDrafts: false,
  baseBranch: null,
  author: null,
  query: '',
};

/** `true` se algum eixo está ativo (útil p/ a view diferenciar "vazio por filtro"). */
export function hasActiveFilter(filters: PrFilters): boolean {
  return (
    filters.hideDrafts ||
    filters.baseBranch !== null ||
    filters.author !== null ||
    filters.query.trim() !== ''
  );
}

/**
 * Aplica os filtros à lista, preservando a ordem de entrada. Uma PR passa quando
 * satisfaz **todos** os eixos ativos: não-draft (se ocultando), base e autor
 * exatos (quando não-`null`), e título contendo a busca (case-insensitive).
 */
export function applyFilters(prs: PullRequest[], filters: PrFilters): PullRequest[] {
  const query = filters.query.trim().toLowerCase();
  return prs.filter((pr) => {
    if (filters.hideDrafts && pr.draft) return false;
    if (filters.baseBranch !== null && pr.baseBranch !== filters.baseBranch) return false;
    if (filters.author !== null && pr.author !== filters.author) return false;
    if (query !== '' && !pr.title.toLowerCase().includes(query)) return false;
    return true;
  });
}
