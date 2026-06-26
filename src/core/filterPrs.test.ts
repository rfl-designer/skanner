import { describe, expect, it } from 'vitest';
import { applyFilters, hasActiveFilter, NO_FILTERS, type PrFilters } from './filterPrs.js';
import type { PullRequest } from '../services/prs.js';

const pr = (over: Partial<PullRequest>): PullRequest => ({
  number: 1,
  title: 'feat: fatia vertical',
  author: 'rafa',
  branch: 'feat/slice',
  baseBranch: 'main',
  draft: false,
  additions: 10,
  deletions: 2,
  updatedAt: '2026-06-20T10:00:00Z',
  ...over,
});

const list: PullRequest[] = [
  pr({ number: 1, title: 'feat: Fatia vertical', author: 'rafa', baseBranch: 'main', draft: false }),
  pr({ number: 2, title: 'fix: rate limit', author: 'ana', baseBranch: 'develop', draft: true }),
  pr({ number: 3, title: 'chore: bump deps', author: 'rafa', baseBranch: 'develop', draft: false }),
];

const filters = (over: Partial<PrFilters>): PrFilters => ({ ...NO_FILTERS, ...over });
const numbers = (prs: PullRequest[]) => prs.map((p) => p.number);

describe('applyFilters', () => {
  it('sem filtros: devolve tudo na ordem de entrada', () => {
    expect(numbers(applyFilters(list, NO_FILTERS))).toEqual([1, 2, 3]);
  });

  it('hideDrafts: oculta as PRs em rascunho', () => {
    expect(numbers(applyFilters(list, filters({ hideDrafts: true })))).toEqual([1, 3]);
  });

  it('baseBranch: mantém só a branch base exata', () => {
    expect(numbers(applyFilters(list, filters({ baseBranch: 'develop' })))).toEqual([2, 3]);
    expect(numbers(applyFilters(list, filters({ baseBranch: 'main' })))).toEqual([1]);
  });

  it('author: mantém só o autor exato', () => {
    expect(numbers(applyFilters(list, filters({ author: 'rafa' })))).toEqual([1, 3]);
    expect(numbers(applyFilters(list, filters({ author: 'ana' })))).toEqual([2]);
  });

  it('query: busca textual no título, case-insensitive', () => {
    expect(numbers(applyFilters(list, filters({ query: 'fatia' })))).toEqual([1]);
    expect(numbers(applyFilters(list, filters({ query: 'FATIA' })))).toEqual([1]);
    expect(numbers(applyFilters(list, filters({ query: '  bump  ' })))).toEqual([3]);
    expect(numbers(applyFilters(list, filters({ query: 'inexistente' })))).toEqual([]);
  });

  it('combina os eixos com E lógico', () => {
    const out = applyFilters(list, filters({ hideDrafts: true, author: 'rafa', baseBranch: 'develop' }));
    expect(numbers(out)).toEqual([3]);
  });

  it('preserva a ordem de entrada', () => {
    const reversed = [...list].reverse();
    expect(numbers(applyFilters(reversed, filters({ author: 'rafa' })))).toEqual([3, 1]);
  });
});

describe('hasActiveFilter', () => {
  it('NO_FILTERS não tem filtro ativo', () => {
    expect(hasActiveFilter(NO_FILTERS)).toBe(false);
  });

  it('cada eixo ativo conta como filtro ativo', () => {
    expect(hasActiveFilter(filters({ hideDrafts: true }))).toBe(true);
    expect(hasActiveFilter(filters({ baseBranch: 'main' }))).toBe(true);
    expect(hasActiveFilter(filters({ author: 'rafa' }))).toBe(true);
    expect(hasActiveFilter(filters({ query: 'x' }))).toBe(true);
    expect(hasActiveFilter(filters({ query: '   ' }))).toBe(false);
  });
});
