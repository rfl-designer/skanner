import { readReview, writeReview } from './conf.js';
import type { ReviewState } from '../core/checklist.js';

/**
 * Módulo de serviço `review` (PRD §6.3, CONTEXT.md §Módulo de serviço): a fronteira
 * `review.getState/setState(prKey)` que guarda o checklist de UMA PR no `conf` (chave
 * `review`). Faz só o IO; o modelo e o agregado moram no núcleo (`core/checklist`). A
 * chave já vem do núcleo (`prKey`) chaveada por repo+PR, então não vaza entre PRs.
 */

/** Estado do checklist da PR `prKey`; PR nunca revisada → estado vazio. */
export function getState(prKey: string): ReviewState {
  return readReview(prKey) ?? { checked: {}, updatedAt: '' };
}

/** Persiste o estado do checklist da PR `prKey` (sobrevive a fechar/reabrir). */
export function setState(prKey: string, state: ReviewState): void {
  writeReview(prKey, state);
}
