import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Semente de `repo.resolveFromCwd` (CONTEXT.md §Módulo de serviço): a fronteira
 * tipada app↔Node. Por ora resolve só a raiz do repo git do cwd; owner/name e
 * perfil entram nas issues delas.
 *
 * Fora de um repo git, `git` sai não-zero e isto rejeita — semente do
 * "fora de repo git = erro fatal" (PRD §6.5).
 */
export async function getRepoRoot(): Promise<string> {
  const { stdout } = await run('git', ['rev-parse', '--show-toplevel']);
  return stdout.trim();
}
