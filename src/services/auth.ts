import { promises as fs } from 'node:fs';
import path from 'node:path';
import envPaths from 'env-paths';
import { Octokit } from 'octokit';

/**
 * Módulo de serviço `auth` (PRD §3, ADR 0004/0001): a fronteira tipada app↔Node
 * para o PAT do GitHub. Chamado direto pela TUI, sem IPC.
 *
 * O token vive num arquivo `0600` no diretório de config (XDG), **nunca** no
 * store `conf` em texto plano (PRD §5). `SKANNER_CONFIG_DIR` sobrepõe o dir —
 * usado nos testes para apontar a um diretório temporário.
 */

export interface GitHubUser {
  login: string;
}

function configDir(): string {
  return process.env.SKANNER_CONFIG_DIR ?? envPaths('skanner', { suffix: '' }).config;
}

function tokenPath(): string {
  return path.join(configDir(), 'token');
}

/** Lê o PAT persistido, ou `null` se não houver arquivo (ou estiver vazio). */
export async function readToken(): Promise<string | null> {
  try {
    const raw = await fs.readFile(tokenPath(), 'utf8');
    const token = raw.trim();
    return token.length > 0 ? token : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Há um PAT persistido? (existência, não validade — ver `validateToken`.) */
export async function hasToken(): Promise<boolean> {
  return (await readToken()) !== null;
}

/** Grava o PAT em arquivo `0600`, criando o dir de config se preciso. */
async function writeToken(token: string): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(tokenPath(), token, { mode: 0o600 });
  // Garante 0600 mesmo se o arquivo já existia com outra permissão.
  await fs.chmod(tokenPath(), 0o600);
}

/** Remove o PAT persistido (no-op se não existir). */
export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(tokenPath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** Valida o PAT chamando `GET /user` (Octokit). Rejeita se inválido. */
export async function validateToken(token: string): Promise<GitHubUser> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.rest.users.getAuthenticated();
  return { login: data.login };
}

/**
 * Valida e, só se válido, persiste o PAT em `0600`. Token vazio ou inválido
 * rejeita **sem** persistir (PRD §6.5, AC da issue #2).
 */
export async function setToken(token: string): Promise<GitHubUser> {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    throw new Error('PAT vazio — cole um Personal Access Token.');
  }
  const user = await validateToken(trimmed);
  await writeToken(trimmed);
  return user;
}

/**
 * Resolve o usuário autenticado a partir do PAT persistido, revalidando contra
 * o GitHub. `null` se não houver token. Rejeita se o token existe mas é inválido
 * (revogado/expirado) — a UI repede nesse caso.
 */
export async function authenticatedUser(): Promise<GitHubUser | null> {
  const token = await readToken();
  if (token === null) return null;
  return validateToken(token);
}
