/**
 * Função-coração do frescor da lista de PRs (CONTEXT.md §Funções-coração, issue
 * #9): pura, agnóstica de UI e de fonte, testável isolada. O serviço `prs` faz o
 * IO (octokit/conf) e a view renderiza; a regra de "quão velho é o cache" mora
 * só aqui.
 *
 * Não conhece `PullRequest` nem o store — só decide, a partir de um instante de
 * busca e do agora, o rótulo "atualizado há X" e se o cache já está `stale`.
 */

/** Decisão de frescor de um cache: rótulo legível + se passou do limite. */
export interface Freshness {
  /** Texto pronto p/ a TUI, sempre na forma "atualizado <relativo>". */
  label: string;
  /** Cache mais velho que `STALE_AFTER_MS` — gatilho visual de "desatualizado". */
  stale: boolean;
}

/** Acima disto o cache conta como `stale` (5 min — escala de uma sessão). */
export const STALE_AFTER_MS = 5 * 60_000;

/** Tempo desde `fetchedAt` em forma relativa pt-BR (`agora`, `há 3 min`, …). */
function relative(elapsedMs: number): string {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  if (seconds < 5) return 'agora';
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

/**
 * Frescor do cache buscado em `fetchedAt` (ISO) em relação a `now`. Relógio
 * adiantado (elapsed < 0) é tratado como "agora", nunca negativo.
 */
export function freshness(fetchedAt: string, now: Date): Freshness {
  const elapsedMs = now.getTime() - new Date(fetchedAt).getTime();
  return {
    label: `atualizado ${relative(elapsedMs)}`,
    stale: elapsedMs >= STALE_AFTER_MS,
  };
}
