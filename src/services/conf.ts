import Conf from 'conf';
import envPaths from 'env-paths';
import type { RepoOverride } from '../core/repo.js';
import type { PrFilters } from '../core/filterPrs.js';
import type { CachedList } from './prs.js';

/**
 * Módulo de serviço `conf` (PRD §5): o store JSON local. A issue #3 só **lê** o
 * mapa `path → overrides`; a issue #9 adiciona a **escrita** do cache da lista de
 * PRs (`prsCache`, keyed `owner/name`). O PAT continua fora daqui (arquivo
 * `0600`, ver `auth.ts`) — só metadados de PR, nunca segredo.
 *
 * `SKANNER_CONFIG_DIR` sobrepõe o dir (mesmo idioma do `auth.ts`) — os testes
 * apontam para um diretório temporário. Construir **sem `defaults`** é write-free:
 * ler um override (ou um cache ausente) jamais persiste nada (AC 6).
 */

interface SkannerStore {
  overrides: Record<string, RepoOverride>;
  /** Cache da lista de PRs por repo (issue #9), keyed `owner/name`. */
  prsCache: Record<string, CachedList>;
  /** Filtros da lista de PRs lembrados por repo (issue #10), keyed `owner/name`. */
  prFilters: Record<string, PrFilters>;
}

function configDir(): string {
  return process.env.SKANNER_CONFIG_DIR ?? envPaths('skanner', { suffix: '' }).config;
}

function store(): Conf<SkannerStore> {
  return new Conf<SkannerStore>({ projectName: 'skanner', cwd: configDir() });
}

/**
 * Override de um repo no mapa `path → overrides` (chave = raiz do git). `{}`
 * quando não há store ou o repo não tem correção — leitura sem efeito colateral.
 */
export function readOverride(root: string): RepoOverride {
  return store().get('overrides')?.[root] ?? {};
}

/**
 * Cache da lista de PRs de um repo (`key = "owner/name"`), ou `null` se nunca
 * foi buscada. Leitura sem efeito colateral — não cria o store (AC 6).
 */
export function readPrsCache(key: string): CachedList | null {
  return store().get('prsCache')?.[key] ?? null;
}

/**
 * Persiste o cache da lista de PRs sob `key` (`owner/name`), preservando os
 * outros repos no mapa. É a primeira **escrita** do `conf` no app — só metadados
 * de PR (nunca o PAT, que segue lazy em arquivo `0600`).
 */
export function writePrsCache(key: string, entry: CachedList): void {
  const conf = store();
  const all = conf.get('prsCache') ?? {};
  conf.set('prsCache', { ...all, [key]: entry });
}

/**
 * Filtros da lista de PRs lembrados de um repo (`key = "owner/name"`), ou `null`
 * se nunca foram salvos. Leitura sem efeito colateral — não cria o store.
 */
export function readPrFilters(key: string): PrFilters | null {
  return store().get('prFilters')?.[key] ?? null;
}

/**
 * Persiste os filtros da lista sob `key` (`owner/name`), preservando os demais
 * repos no mapa — mesmo padrão de escrita do cache (issue #9).
 */
export function writePrFilters(key: string, filters: PrFilters): void {
  const conf = store();
  const all = conf.get('prFilters') ?? {};
  conf.set('prFilters', { ...all, [key]: filters });
}
