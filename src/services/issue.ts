import { Octokit } from 'octokit';
import { readToken } from './auth.js';
import type { ResolvedRepo } from '../core/repo.js';

/**
 * Módulo de serviço `issue` (PRD `local-commit-gate`, issue #47): a fronteira
 * tipada app↔Node que busca o **corpo** de uma issue do GitHub via Octokit, para
 * o portão de commit entregar à IA o *porquê* que o diff não carrega. PAT lazy
 * via `auth`, nunca logado.
 *
 * Degrada gracioso: sem identidade GitHub, sem PAT, ou qualquer falha (404, rede,
 * rate limit) → `null`. O corpo da issue é um BÔNUS de contexto; sua ausência não
 * derruba o portão (o prefixo `(#NN)` segue valendo, a IA só fica sem o contexto).
 */

/** O corpo da issue `number`, ou `null` quando indisponível (degradação graciosa). */
export async function issueBody(repo: ResolvedRepo, number: number): Promise<string | null> {
  if (repo.identity.kind !== 'github') return null;
  const token = await readToken();
  if (token === null) return null;

  const { owner, name } = repo.identity;
  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.issues.get({ owner, repo: name, issue_number: number });
    const body = data.body?.trim();
    return body && body.length > 0 ? body : null;
  } catch {
    return null;
  }
}
