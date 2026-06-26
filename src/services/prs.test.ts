import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from '../core/repo.js';

// Mocka o Octokit p/ não tocar a rede: `rest.pulls.list` devolve os resumos +
// headers (com o ETag) e `rest.pulls.get` devolve as contagens add/del (N+1).
const { list, get } = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock('octokit', () => ({
  Octokit: vi.fn(function () {
    return { rest: { pulls: { list, get } } };
  }),
}));

import { readCache, revalidate } from './prs.js';

const githubRepo: ResolvedRepo = {
  root: '/repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'skanner' },
  profile: 'flat',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
};
const localOnlyRepo: ResolvedRepo = { ...githubRepo, identity: { kind: 'local-only' } };

const summary = {
  number: 42,
  title: 'feat: fatia vertical',
  user: { login: 'rafa' },
  head: { ref: 'feat/slice' },
  updated_at: '2026-06-20T10:00:00Z',
};
const okResponse = (data: unknown[], etag = '"v1"') => ({ data, headers: { etag } });

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-prs-'));
  process.env.SKANNER_CONFIG_DIR = dir;
  await fs.writeFile(path.join(dir, 'token'), 'ghp_valid', { mode: 0o600 });
  list.mockReset();
  get.mockReset();
});

afterEach(async () => {
  delete process.env.SKANNER_CONFIG_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('prs.revalidate — busca condicional + cache', () => {
  it('200: mapeia os campos, guarda o ETag e o fetchedAt no cache', async () => {
    list.mockResolvedValue(okResponse([summary], '"etag-1"'));
    get.mockResolvedValue({ data: { additions: 120, deletions: 8 } });

    const result = await revalidate(githubRepo);

    expect(result.prs).toEqual([
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
    expect(result.etag).toBe('"etag-1"');
    expect(typeof result.fetchedAt).toBe('string');
    expect(get).toHaveBeenCalledWith({ owner: 'rfl-designer', repo: 'skanner', pull_number: 42 });
    // Persistiu no conf: uma segunda leitura encontra o cache.
    expect(readCache(githubRepo)?.etag).toBe('"etag-1"');
  });

  it('sem PRs abertas: lista vazia e não busca detalhe', async () => {
    list.mockResolvedValue(okResponse([], '"empty"'));

    const result = await revalidate(githubRepo);

    expect(result.prs).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('304: reusa o cache sem refazer o N+1 (não reconta rate limit)', async () => {
    // 1ª busca (200) popula o cache com um ETag.
    list.mockResolvedValueOnce(okResponse([summary], '"etag-1"'));
    get.mockResolvedValue({ data: { additions: 120, deletions: 8 } });
    await revalidate(githubRepo);
    expect(get).toHaveBeenCalledTimes(1);

    // 2ª busca: o GitHub responde 304 (nada mudou) → Octokit lança RequestError.
    list.mockRejectedValueOnce(Object.assign(new Error('Not modified'), { status: 304 }));
    const result = await revalidate(githubRepo);

    // Envia o ETag como If-None-Match e reusa o cache sem novo N+1.
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ headers: { 'if-none-match': '"etag-1"' } }),
    );
    expect(result.prs).toEqual([
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
    expect(get).toHaveBeenCalledTimes(1); // não cresceu: detalhe não foi refeito
  });

  it('repo local-only: rejeita sem tocar a rede', async () => {
    await expect(revalidate(localOnlyRepo)).rejects.toThrow();
    expect(list).not.toHaveBeenCalled();
  });
});

describe('prs.readCache — leitura instantânea do cache', () => {
  it('sem cache: null (e não cria o store)', () => {
    expect(readCache(githubRepo)).toBeNull();
  });
});
