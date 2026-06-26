import { Octokit } from 'octokit';
import { readToken } from './auth.js';
import { readPrsCache, writePrsCache, readPrFilters, writePrFilters } from './conf.js';
import type { ResolvedRepo, RepoIdentity } from '../core/repo.js';
import type { PrFilters } from '../core/filterPrs.js';

/**
 * Módulo de serviço `prs` (PRD §6.1, CONTEXT.md §Módulo de serviço): a fronteira
 * tipada app↔Node do modo remoto. Faz IO (Octokit + store `conf`) e devolve o
 * tipo do modelo; sem regra de domínio inline (o frescor mora em `core/freshness`).
 *
 * Cache + frescor (issue #9): a lista é cacheada por repo no `conf` (`prsCache`,
 * keyed `owner/name`). `readCache` devolve o cache na hora (abertura instantânea);
 * `revalidate` faz uma **requisição condicional** com ETag/`If-None-Match` — um
 * `304` reusa o cache **sem recontar rate limit** nem refazer o N+1 dos detalhes.
 *
 * O endpoint de listagem (`pulls.list`) **não** traz adições/remoções — por isso
 * a contagem vem de um `pulls.get` por PR (N+1), aceitável p/ uma ferramenta
 * pessoal com poucas PRs abertas.
 */

/** Uma PR aberta com os metadados exibidos na lista (issue #4 / PRD §6.1). */
export interface PullRequest {
  number: number;
  title: string;
  author: string;
  /** Branch de origem (head ref) — o que a lista exibe. */
  branch: string;
  /** Branch base (alvo do merge) — eixo de filtro da issue #10. */
  baseBranch: string;
  /** Se a PR é um rascunho (draft) — eixo de filtro da issue #10. */
  draft: boolean;
  additions: number;
  deletions: number;
  updatedAt: string;
}

/**
 * Lista de PRs cacheada de um repo (issue #9). `etag` alimenta a próxima
 * requisição condicional; `fetchedAt` (ISO) alimenta o frescor da view.
 */
export interface CachedList {
  prs: PullRequest[];
  etag: string | null;
  fetchedAt: string;
}

/** `owner/name` resolvido, ou erro: a view barra o repo local-only antes daqui. */
function githubIdentity(repo: ResolvedRepo): Extract<RepoIdentity, { kind: 'github' }> {
  if (repo.identity.kind !== 'github') {
    throw new Error('owner/name não resolvido — repo local-only.');
  }
  return repo.identity;
}

/** Cache da lista deste repo, ou `null` se nunca foi buscada (leitura instantânea). */
export function readCache(repo: ResolvedRepo): CachedList | null {
  const { owner, name } = githubIdentity(repo);
  return readPrsCache(`${owner}/${name}`);
}

/** Filtros lembrados deste repo (issue #10), ou `null` se nunca foram salvos. */
export function readFilters(repo: ResolvedRepo): PrFilters | null {
  const { owner, name } = githubIdentity(repo);
  return readPrFilters(`${owner}/${name}`);
}

/** Persiste os filtros deste repo (issue #10), keyed `owner/name`. */
export function writeFilters(repo: ResolvedRepo, filters: PrFilters): void {
  const { owner, name } = githubIdentity(repo);
  writePrFilters(`${owner}/${name}`, filters);
}

/** `error.status === N`? (RequestError do Octokit — ex.: 304 Not Modified.) */
function hasStatus(err: unknown, status: number): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'status' in err &&
    (err as { status?: number }).status === status
  );
}

/** Busca add/del por PR (N+1) e monta o tipo do modelo, ordenado como veio. */
async function detailsOf(
  octokit: Octokit,
  owner: string,
  name: string,
  summaries: { number: number; title: string; user: { login: string } | null; head: { ref: string }; base: { ref: string }; draft?: boolean; updated_at: string }[],
): Promise<PullRequest[]> {
  return Promise.all(
    summaries.map(async (pr) => {
      const { data } = await octokit.rest.pulls.get({
        owner,
        repo: name,
        pull_number: pr.number,
      });
      return {
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? '—',
        branch: pr.head.ref,
        baseBranch: pr.base.ref,
        draft: pr.draft ?? false,
        additions: data.additions,
        deletions: data.deletions,
        updatedAt: pr.updated_at,
      };
    }),
  );
}

/**
 * Revalida a lista de PRs abertas do `repo` contra o GitHub, **stale-while-
 * revalidate**: a view já mostrou `readCache`; esta promessa traz o resultado
 * fresco em segundo plano e regrava o cache.
 *
 * Requisição condicional: envia `If-None-Match` com o ETag do cache. Um `304`
 * (nada mudou) **não reconta rate limit** e devolve o cache intacto, pulando o
 * N+1. Um `200` refaz os detalhes e regrava `{prs, etag, fetchedAt}`. Reusa o
 * PAT persistido (lazy, arquivo `0600`).
 */
export async function revalidate(repo: ResolvedRepo): Promise<CachedList> {
  const { owner, name } = githubIdentity(repo);
  const token = await readToken();
  if (token === null) {
    throw new Error('PAT ausente — autentique na aba PRs.');
  }

  const key = `${owner}/${name}`;
  const cached = readPrsCache(key);
  const octokit = new Octokit({ auth: token });

  try {
    const response = await octokit.rest.pulls.list({
      owner,
      repo: name,
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
      headers: cached?.etag ? { 'if-none-match': cached.etag } : {},
    });

    const prs = await detailsOf(octokit, owner, name, response.data);
    const fresh: CachedList = {
      prs,
      etag: response.headers.etag ?? null,
      fetchedAt: new Date().toISOString(),
    };
    writePrsCache(key, fresh);
    return fresh;
  } catch (err) {
    // 304 Not Modified: nada mudou — reusa o cache sem custo de rate limit.
    if (hasStatus(err, 304) && cached !== null) {
      const reused: CachedList = { ...cached, fetchedAt: new Date().toISOString() };
      writePrsCache(key, reused);
      return reused;
    }
    throw err;
  }
}
