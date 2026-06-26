import { describe, expect, it } from 'vitest';
import {
  assembleMessage,
  buildPrompt,
  COMMIT_TRAILER,
  messagePrefix,
  parseIssueInput,
  pathsToReset,
} from './commit.js';

describe('parseIssueInput', () => {
  it('dígitos (com ou sem #) viram referência de issue', () => {
    expect(parseIssueInput('46')).toEqual({ kind: 'issue', number: 46 });
    expect(parseIssueInput('#47')).toEqual({ kind: 'issue', number: 47 });
    expect(parseIssueInput('  12 ')).toEqual({ kind: 'issue', number: 12 });
  });

  it('texto vira intenção livre', () => {
    expect(parseIssueInput('preserva cursor por path')).toEqual({
      kind: 'intent',
      text: 'preserva cursor por path',
    });
  });

  it('vazio é nenhum', () => {
    expect(parseIssueInput('')).toEqual({ kind: 'none' });
    expect(parseIssueInput('   ')).toEqual({ kind: 'none' });
  });
});

describe('messagePrefix', () => {
  it('tipo(#NN): quando há issue', () => {
    expect(messagePrefix('feat', { kind: 'issue', number: 46 })).toBe('feat(#46): ');
  });

  it('tipo: quando intenção ou nenhum', () => {
    expect(messagePrefix('fix', { kind: 'intent', text: 'x' })).toBe('fix: ');
    expect(messagePrefix('chore', { kind: 'none' })).toBe('chore: ');
  });
});

describe('assembleMessage', () => {
  it('costura prefixo + miolo (verbatim, aparado) + trailer quando assistido pela IA', () => {
    const msg = assembleMessage({
      type: 'feat',
      issue: { kind: 'issue', number: 46 },
      body: '  marca arquivos com espaço  ',
      aiAssisted: true,
    });
    expect(msg).toBe(`feat(#46): marca arquivos com espaço\n\n${COMMIT_TRAILER}`);
  });

  it('sem trailer quando escrito à mão (fallback sem claude)', () => {
    const msg = assembleMessage({
      type: 'fix',
      issue: { kind: 'none' },
      body: 'corrige bug',
      aiAssisted: false,
    });
    expect(msg).toBe('fix: corrige bug');
  });
});

describe('buildPrompt', () => {
  it('inclui o diff staged e pede só o miolo', () => {
    const p = buildPrompt({ stagedDiff: 'DIFF_AQUI', issueBody: null, intent: null });
    expect(p).toContain('DIFF_AQUI');
    expect(p).toContain('APENAS');
    expect(p).not.toContain('Contexto da issue');
    expect(p).not.toContain('Intenção declarada');
  });

  it('injeta o corpo da issue quando presente', () => {
    const p = buildPrompt({ stagedDiff: 'D', issueBody: 'PORQUE_DA_ISSUE', intent: null });
    expect(p).toContain('Contexto da issue');
    expect(p).toContain('PORQUE_DA_ISSUE');
  });

  it('injeta a intenção livre quando presente', () => {
    const p = buildPrompt({ stagedDiff: 'D', issueBody: null, intent: 'decisão b' });
    expect(p).toContain('Intenção declarada');
    expect(p).toContain('decisão b');
  });
});

describe('pathsToReset — armadilha do staging pré-existente', () => {
  it('reseta só os paths que o Skanner stageou (marked menos os pré-staged)', () => {
    const marked = ['a.ts', 'b.ts', 'c.ts'];
    const stagedBefore = new Set(['b.ts']); // o usuário já tinha b.ts staged
    expect(pathsToReset(marked, stagedBefore)).toEqual(['a.ts', 'c.ts']);
  });

  it('nada a resetar se tudo já estava staged antes', () => {
    expect(pathsToReset(['a.ts'], new Set(['a.ts']))).toEqual([]);
  });

  it('reseta tudo se nada estava staged antes', () => {
    expect(pathsToReset(['a.ts', 'b.ts'], new Set())).toEqual(['a.ts', 'b.ts']);
  });
});
