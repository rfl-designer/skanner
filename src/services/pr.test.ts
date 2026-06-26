import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from '../core/repo.js';

// Mocka o Octokit p/ não tocar a rede: `paginate` devolve os arquivos da PR
// (filename + patch), como o endpoint paginado `rest.pulls.listFiles`.
const { paginate, listFiles } = vi.hoisted(() => ({ paginate: vi.fn(), listFiles: vi.fn() }));
vi.mock('octokit', () => ({
  Octokit: vi.fn(function () {
    return { paginate, rest: { pulls: { listFiles } } };
  }),
}));

import { diff } from './pr.js';

const githubRepo: ResolvedRepo = {
  root: '/repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'concilliun-crm' },
  profile: 'modular',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
};
const localOnlyRepo: ResolvedRepo = { ...githubRepo, identity: { kind: 'local-only' } };

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-pr-'));
  process.env.SKANNER_CONFIG_DIR = dir;
  await fs.writeFile(path.join(dir, 'token'), 'ghp_valid', { mode: 0o600 });
  paginate.mockReset();
  listFiles.mockReset();
});

afterEach(async () => {
  delete process.env.SKANNER_CONFIG_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('pr.diff — arquivos alterados + patches', () => {
  it('mapeia filename→path e patch (null quando ausente)', async () => {
    paginate.mockResolvedValue([
      { filename: 'app/Contexts/Crm/Models/Contact.php', patch: '@@ -1 +1 @@\n+x' },
      { filename: 'storage/logo.png' }, // binário: sem patch
    ]);

    const result = await diff(githubRepo, 42);

    expect(result).toEqual({
      number: 42,
      files: [
        { path: 'app/Contexts/Crm/Models/Contact.php', patch: '@@ -1 +1 @@\n+x' },
        { path: 'storage/logo.png', patch: null },
      ],
    });
    expect(paginate).toHaveBeenCalledWith(listFiles, {
      owner: 'rfl-designer',
      repo: 'concilliun-crm',
      pull_number: 42,
      per_page: 100,
    });
  });

  it('PR sem arquivos: devolve files vazio', async () => {
    paginate.mockResolvedValue([]);
    expect(await diff(githubRepo, 7)).toEqual({ number: 7, files: [] });
  });

  it('repo local-only: rejeita sem tocar a rede', async () => {
    await expect(diff(localOnlyRepo, 1)).rejects.toThrow();
    expect(paginate).not.toHaveBeenCalled();
  });

  it('sem PAT persistido: rejeita sem tocar a rede', async () => {
    await fs.unlink(path.join(dir, 'token'));
    await expect(diff(githubRepo, 1)).rejects.toThrow();
    expect(paginate).not.toHaveBeenCalled();
  });
});
