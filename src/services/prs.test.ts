import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from '../core/repo.js';

// Mocka o Octokit p/ não tocar a rede: `paginate` devolve os resumos das PRs e
// `rest.pulls.get` devolve as contagens add/del por número (o N+1 do serviço).
const { paginate, get } = vi.hoisted(() => ({ paginate: vi.fn(), get: vi.fn() }));
vi.mock('octokit', () => ({
  Octokit: vi.fn(function () {
    return { paginate, rest: { pulls: { list: vi.fn(), get } } };
  }),
}));

import { list } from './prs.js';

const githubRepo: ResolvedRepo = {
  root: '/repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'skanner' },
  profile: 'flat',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
};
const localOnlyRepo: ResolvedRepo = { ...githubRepo, identity: { kind: 'local-only' } };

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-prs-'));
  process.env.SKANNER_CONFIG_DIR = dir;
  await fs.writeFile(path.join(dir, 'token'), 'ghp_valid', { mode: 0o600 });
  paginate.mockReset();
  get.mockReset();
});

afterEach(async () => {
  delete process.env.SKANNER_CONFIG_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('prs.list — listagem de PRs abertas', () => {
  it('mapeia número, título, autor, branch, add/del e data de atualização', async () => {
    paginate.mockResolvedValue([
      {
        number: 42,
        title: 'feat: fatia vertical',
        user: { login: 'rafa' },
        head: { ref: 'feat/slice' },
        updated_at: '2026-06-20T10:00:00Z',
      },
    ]);
    get.mockResolvedValue({ data: { additions: 120, deletions: 8 } });

    const prs = await list(githubRepo);

    expect(prs).toEqual([
      {
        number: 42,
        title: 'feat: fatia vertical',
        author: 'rafa',
        branch: 'feat/slice',
        additions: 120,
        deletions: 8,
        updatedAt: '2026-06-20T10:00:00Z',
      },
    ]);
    expect(get).toHaveBeenCalledWith({ owner: 'rfl-designer', repo: 'skanner', pull_number: 42 });
  });

  it('sem PRs abertas: devolve lista vazia e não busca detalhe', async () => {
    paginate.mockResolvedValue([]);

    expect(await list(githubRepo)).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('repo local-only: rejeita sem tocar a rede', async () => {
    await expect(list(localOnlyRepo)).rejects.toThrow();
    expect(paginate).not.toHaveBeenCalled();
  });
});
