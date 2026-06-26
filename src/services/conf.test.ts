import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readOverride, readPrsCache, writePrsCache } from './conf.js';
import type { CachedList } from './prs.js';

let dir: string;
const previous = process.env.SKANNER_CONFIG_DIR;

async function writeStore(overrides: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify({ overrides }));
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-conf-'));
  process.env.SKANNER_CONFIG_DIR = dir;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.SKANNER_CONFIG_DIR;
  else process.env.SKANNER_CONFIG_DIR = previous;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('readOverride', () => {
  it('retorna o override do repo pela raiz', async () => {
    await writeStore({ '/repo/a': { profile: 'flat', modularBaseDir: 'src/Modules' } });

    expect(readOverride('/repo/a')).toEqual({ profile: 'flat', modularBaseDir: 'src/Modules' });
  });

  it('repo sem entrada no mapa → {}', async () => {
    await writeStore({ '/repo/a': { profile: 'flat' } });

    expect(readOverride('/repo/b')).toEqual({});
  });

  it('sem store → {} e NÃO cria arquivo (AC 6: ler não escreve)', () => {
    expect(readOverride('/repo/a')).toEqual({});
    expect(existsSync(path.join(dir, 'config.json'))).toBe(false);
  });
});

describe('prsCache (issue #9)', () => {
  const entry: CachedList = {
    prs: [
      {
        number: 1,
        title: 't',
        author: 'rafa',
        branch: 'b',
        baseBranch: 'main',
        draft: false,
        additions: 1,
        deletions: 0,
        updatedAt: '2026-06-20T10:00:00Z',
      },
    ],
    etag: '"v1"',
    fetchedAt: '2026-06-25T12:00:00Z',
  };

  it('grava e relê o cache por repo (key owner/name)', () => {
    writePrsCache('rfl-designer/skanner', entry);
    expect(readPrsCache('rfl-designer/skanner')).toEqual(entry);
  });

  it('escrever um repo preserva os demais no mapa', () => {
    writePrsCache('rfl-designer/skanner', entry);
    writePrsCache('rfl-designer/other', { ...entry, etag: '"v2"' });

    expect(readPrsCache('rfl-designer/skanner')?.etag).toBe('"v1"');
    expect(readPrsCache('rfl-designer/other')?.etag).toBe('"v2"');
  });

  it('repo sem cache → null e ler não cria arquivo', () => {
    expect(readPrsCache('rfl-designer/skanner')).toBeNull();
    expect(existsSync(path.join(dir, 'config.json'))).toBe(false);
  });
});
