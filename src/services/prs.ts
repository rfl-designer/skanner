import { Octokit } from 'octokit';
import { readToken } from './auth.js';
import type { ResolvedRepo } from '../core/repo.js';

/**
 * Módulo de serviço `prs` (PRD §6.1, CONTEXT.md §Módulo de serviço): a fronteira
 * tipada app↔Node do modo remoto. Faz IO (Octokit) e devolve o tipo do modelo;
 * sem regra de domínio inline. Chamado direto pela aba PRs, sob remoto lazy.
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
  branch: string;
  additions: number;
  deletions: number;
  updatedAt: string;
}

/**
 * Lista as PRs abertas do `repo`, ordenadas pela atualização mais recente. Exige
 * identidade GitHub resolvida (`owner/name`); um repo local-only é barrado pela
 * view antes daqui — o guard mantém o tipo honesto. Reusa o PAT persistido.
 */
export async function list(repo: ResolvedRepo): Promise<PullRequest[]> {
  if (repo.identity.kind !== 'github') {
    throw new Error('owner/name não resolvido — repo local-only.');
  }
  const token = await readToken();
  if (token === null) {
    throw new Error('PAT ausente — autentique na aba PRs.');
  }

  const { owner, name } = repo.identity;
  const octokit = new Octokit({ auth: token });

  const summaries = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo: name,
    state: 'open',
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  });

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
        additions: data.additions,
        deletions: data.deletions,
        updatedAt: pr.updated_at,
      };
    }),
  );
}
