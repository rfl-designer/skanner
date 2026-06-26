import { describe, expect, it } from 'vitest';
import { classifyGitHubError, resetLabel } from './github-error.js';

describe('classifyGitHubError — variantes tipadas', () => {
  it('401 → PAT inválido', () => {
    expect(classifyGitHubError({ status: 401, message: 'Bad credentials' })).toEqual({
      kind: 'invalid-pat',
    });
  });

  it('403 com x-ratelimit-remaining 0 → rate limit com reset', () => {
    const seconds = 1_750_000_000;
    const err = {
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(seconds) } },
    };
    expect(classifyGitHubError(err)).toEqual({
      kind: 'rate-limit',
      resetAt: new Date(seconds * 1000),
    });
  });

  it('403 SEM esgotar o rate limit (ex.: permissão) → unknown, não rate-limit', () => {
    const err = { status: 403, message: 'Forbidden', response: { headers: {} } };
    expect(classifyGitHubError(err).kind).toBe('unknown');
  });

  it('rate limit sem header de reset → resetAt null', () => {
    const err = { status: 403, response: { headers: { 'x-ratelimit-remaining': '0' } } };
    expect(classifyGitHubError(err)).toEqual({ kind: 'rate-limit', resetAt: null });
  });

  it('erro de rede por code → network', () => {
    expect(classifyGitHubError(Object.assign(new Error('boom'), { code: 'ENOTFOUND' })).kind).toBe(
      'network',
    );
  });

  it('erro de rede por cause.code (undici) → network', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    expect(classifyGitHubError(err).kind).toBe('network');
  });

  it('erro qualquer → unknown com a mensagem', () => {
    expect(classifyGitHubError(new Error('algo estranho'))).toEqual({
      kind: 'unknown',
      message: 'algo estranho',
    });
  });
});

describe('resetLabel — hora de reset', () => {
  it('formata HH:MM em UTC', () => {
    expect(resetLabel(new Date(1_750_001_600 * 1000))).toBe('15:33 UTC');
  });

  it('null vira "em instantes"', () => {
    expect(resetLabel(null)).toBe('em instantes');
  });
});
