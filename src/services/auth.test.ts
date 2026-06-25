import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocka o Octokit p/ não tocar a rede; expõe um `getAuthenticated` controlável.
const { getAuthenticated } = vi.hoisted(() => ({ getAuthenticated: vi.fn() }));
vi.mock('octokit', () => ({
  Octokit: vi.fn(function () {
    return { rest: { users: { getAuthenticated } } };
  }),
}));

import { clearToken, hasToken, readToken, setToken } from './auth.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-auth-'));
  process.env.SKANNER_CONFIG_DIR = dir;
  getAuthenticated.mockReset();
});

afterEach(async () => {
  delete process.env.SKANNER_CONFIG_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('auth — armazenamento do PAT', () => {
  it('sem arquivo: readToken=null e hasToken=false', async () => {
    expect(await readToken()).toBeNull();
    expect(await hasToken()).toBe(false);
  });

  it('setToken valida, persiste em arquivo 0600 e retorna o usuário', async () => {
    getAuthenticated.mockResolvedValue({ data: { login: 'rafa' } });

    const user = await setToken('ghp_valid');

    expect(user).toEqual({ login: 'rafa' });
    expect(await readToken()).toBe('ghp_valid');
    const stat = await fs.stat(path.join(dir, 'token'));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('PAT vazio rejeita sem validar nem persistir', async () => {
    await expect(setToken('   ')).rejects.toThrow();
    expect(getAuthenticated).not.toHaveBeenCalled();
    expect(await hasToken()).toBe(false);
  });

  it('PAT inválido (401) rejeita e não persiste', async () => {
    getAuthenticated.mockRejectedValue(Object.assign(new Error('Bad credentials'), { status: 401 }));

    await expect(setToken('ghp_bad')).rejects.toThrow();
    expect(await hasToken()).toBe(false);
  });

  it('clearToken remove o PAT persistido', async () => {
    getAuthenticated.mockResolvedValue({ data: { login: 'rafa' } });
    await setToken('ghp_valid');
    expect(await hasToken()).toBe(true);

    await clearToken();

    expect(await hasToken()).toBe(false);
  });
});
