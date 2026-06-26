/**
 * Núcleo da **classificação de erro do GitHub** (PRD §6.5, ADR 0004): puro,
 * agnóstico de UI. O serviço faz IO via Octokit e deixa o erro propagar; a view
 * (máquina de estados) chama `classifyGitHubError` no `catch` e renderiza por
 * variante — PAT inválido leva a Settings, sem rede oferece retry, rate limit
 * mostra o reset. Erros viram **variantes tipadas**, não exceptions soltas
 * stringificadas. Issue #8.
 */

/** O que deu errado ao falar com o GitHub, como união discriminada. */
export type GitHubError =
  | { kind: 'invalid-pat' }
  | { kind: 'rate-limit'; resetAt: Date | null }
  | { kind: 'network' }
  | { kind: 'unknown'; message: string };

const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function asRecord(err: unknown): Record<string, unknown> | null {
  return typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
}

function statusOf(err: unknown): number | null {
  const rec = asRecord(err);
  return rec && typeof rec.status === 'number' ? rec.status : null;
}

function headersOf(err: unknown): Record<string, unknown> | null {
  const rec = asRecord(err);
  const response = rec ? asRecord(rec.response) : null;
  return response ? asRecord(response.headers) : null;
}

function header(err: unknown, name: string): string | null {
  const headers = headersOf(err);
  const value = headers?.[name];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;
}

function codeOf(err: unknown): string | null {
  const rec = asRecord(err);
  if (rec && typeof rec.code === 'string') return rec.code;
  const cause = rec ? asRecord(rec.cause) : null;
  return cause && typeof cause.code === 'string' ? cause.code : null;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const rec = asRecord(err);
  if (rec && typeof rec.message === 'string') return rec.message;
  return String(err);
}

function isNetworkError(err: unknown): boolean {
  const code = codeOf(err);
  if (code !== null && NETWORK_CODES.has(code)) return true;
  // Octokit/undici envolvem falha de rede como TypeError 'fetch failed'.
  return /fetch failed|network|getaddrinfo|socket hang up/i.test(errorMessage(err));
}

/**
 * Erro cru do Octokit → [GitHubError](#githuberror). `401` = PAT inválido;
 * `403` com `x-ratelimit-remaining: 0` = rate limit (lê o `x-ratelimit-reset`);
 * erro de rede/DNS = `network`; o resto = `unknown` com a mensagem.
 */
export function classifyGitHubError(err: unknown): GitHubError {
  const status = statusOf(err);
  if (status === 401) return { kind: 'invalid-pat' };
  if (status === 403 && header(err, 'x-ratelimit-remaining') === '0') {
    const reset = header(err, 'x-ratelimit-reset');
    const seconds = reset !== null ? Number(reset) : NaN;
    return {
      kind: 'rate-limit',
      resetAt: Number.isFinite(seconds) ? new Date(seconds * 1000) : null,
    };
  }
  if (isNetworkError(err)) return { kind: 'network' };
  return { kind: 'unknown', message: errorMessage(err) };
}

/** Hora de reset do rate limit como `HH:MM` em UTC (determinístico p/ a TUI/testes). */
export function resetLabel(resetAt: Date | null): string {
  if (resetAt === null) return 'em instantes';
  const hh = String(resetAt.getUTCHours()).padStart(2, '0');
  const mm = String(resetAt.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}
