import { describe, expect, it } from 'vitest';
import { freshness, STALE_AFTER_MS } from './freshness.js';

const base = '2026-06-25T12:00:00.000Z';
const at = (ms: number) => new Date(new Date(base).getTime() + ms);

describe('freshness — rótulo "atualizado há X"', () => {
  it('recém-buscado: "agora"', () => {
    expect(freshness(base, at(0)).label).toBe('atualizado agora');
    expect(freshness(base, at(3_000)).label).toBe('atualizado agora');
  });

  it('segundos, minutos, horas e dias', () => {
    expect(freshness(base, at(30_000)).label).toBe('atualizado há 30s');
    expect(freshness(base, at(3 * 60_000)).label).toBe('atualizado há 3 min');
    expect(freshness(base, at(2 * 3_600_000)).label).toBe('atualizado há 2 h');
    expect(freshness(base, at(3 * 86_400_000)).label).toBe('atualizado há 3 d');
  });

  it('relógio adiantado (now < fetchedAt) cai em "agora", nunca negativo', () => {
    expect(freshness(base, at(-10_000)).label).toBe('atualizado agora');
  });
});

describe('freshness — flag stale', () => {
  it('fresco antes do limite, stale a partir dele', () => {
    expect(freshness(base, at(STALE_AFTER_MS - 1)).stale).toBe(false);
    expect(freshness(base, at(STALE_AFTER_MS)).stale).toBe(true);
    expect(freshness(base, at(STALE_AFTER_MS * 3)).stale).toBe(true);
  });
});
