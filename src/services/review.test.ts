import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getState, setState } from './review.js';

let dir: string;
const previous = process.env.SKANNER_CONFIG_DIR;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-review-'));
  process.env.SKANNER_CONFIG_DIR = dir;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.SKANNER_CONFIG_DIR;
  else process.env.SKANNER_CONFIG_DIR = previous;
  await fs.rm(dir, { recursive: true, force: true });
});

const KEY = 'rfl-designer/concilliun-crm#42';

describe('review.getState', () => {
  it('PR nunca revisada → estado vazio, sem criar arquivo (ler não escreve)', () => {
    expect(getState(KEY)).toEqual({ checked: {}, updatedAt: '' });
    expect(existsSync(path.join(dir, 'config.json'))).toBe(false);
  });
});

describe('review.setState → getState — persistência', () => {
  it('o estado persiste e é relido (sobrevive a fechar/reabrir a PR)', () => {
    const state = {
      checked: { 'app/Contexts/Crm/Models/Contact.php': true as const },
      updatedAt: '2026-06-25T00:00:00.000Z',
    };
    setState(KEY, state);

    expect(getState(KEY)).toEqual(state);
  });

  it('marcar um arquivo a mais preserva os já revisados', () => {
    setState(KEY, { checked: { 'a.php': true }, updatedAt: 't1' });
    setState(KEY, { checked: { 'a.php': true, 'b.php': true }, updatedAt: 't2' });

    expect(getState(KEY)).toEqual({
      checked: { 'a.php': true, 'b.php': true },
      updatedAt: 't2',
    });
  });
});

describe('review — isolamento por repo+PR (AC: não vaza entre PRs)', () => {
  it('chaves distintas (PRs/repos) não se misturam', () => {
    const pr42 = 'rfl-designer/concilliun-crm#42';
    const pr43 = 'rfl-designer/concilliun-crm#43';
    const other = 'rfl-designer/soloboard#42';

    setState(pr42, { checked: { 'a.php': true }, updatedAt: 't' });
    setState(pr43, { checked: { 'b.php': true }, updatedAt: 't' });

    expect(getState(pr42).checked).toEqual({ 'a.php': true });
    expect(getState(pr43).checked).toEqual({ 'b.php': true });
    expect(getState(other)).toEqual({ checked: {}, updatedAt: '' });
  });
});
