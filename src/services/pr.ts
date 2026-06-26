import { Octokit } from 'octokit';
import { readToken } from './auth.js';
import type { ResolvedRepo } from '../core/repo.js';
import { toDiffFile, type DiffFile } from '../core/diff.js';

/**
 * Módulo de serviço `pr` (PRD §6.3, CONTEXT.md §Módulo de serviço): a fronteira
 * tipada app↔Node que busca o diff de UMA PR (arquivos alterados + patches) via
 * Octokit e devolve o tipo do modelo (`DiffFile[]`). Sem regra de domínio inline —
 * o agrupamento mora no núcleo (`buildReviewTree`). PAT lazy via `auth`, nunca
 * logado. Pagina a lista COMPLETA de arquivos antes de devolver; a classificação
 * de cada arquivo (status/binário/truncado/renomeado) mora no núcleo (`toDiffFile`).
 * Erros do Octokit propagam — a view os classifica via `classifyGitHubError` (#8).
 */

/** O diff de uma PR: a lista de arquivos alterados com seus patches (modelo). */
export interface PrDiff {
  number: number;
  files: DiffFile[];
}

/**
 * Busca os arquivos alterados + patches da PR `number` do `repo`. Exige identidade
 * GitHub resolvida (a view barra repo local-only antes daqui) e um PAT persistido.
 * Pagina até o fim (todas as páginas) e devolve a lista completa.
 */
export async function diff(repo: ResolvedRepo, number: number): Promise<PrDiff> {
  if (repo.identity.kind !== 'github') {
    throw new Error('owner/name não resolvido — repo local-only.');
  }
  const token = await readToken();
  if (token === null) {
    throw new Error('PAT ausente — autentique na aba PRs.');
  }

  const { owner, name } = repo.identity;
  const octokit = new Octokit({ auth: token });

  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo: name,
    pull_number: number,
    per_page: 100,
  });

  return { number, files: files.map(toDiffFile) };
}
