import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readOverride,
  writeOverride,
  readPrsCache,
  writePrsCache,
  readPrFilters,
  writePrFilters,
} from './conf.js';
import type { CachedList } from './prs.js';
import type { PrFilters } from '../core/filterPrs.js';

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

describe('prFilters (issue #10)', () => {
  const filters: PrFilters = {
    hideDrafts: true,
    baseBranch: 'main',
    author: 'rafa',
    query: 'fatia',
  };

  it('grava e relê os filtros por repo (key owner/name)', () => {
    writePrFilters('rfl-designer/skanner', filters);
    expect(readPrFilters('rfl-designer/skanner')).toEqual(filters);
  });

  it('escrever um repo preserva os filtros dos demais', () => {
    writePrFilters('rfl-designer/skanner', filters);
    writePrFilters('rfl-designer/other', { ...filters, author: 'ana' });

    expect(readPrFilters('rfl-designer/skanner')?.author).toBe('rafa');
    expect(readPrFilters('rfl-designer/other')?.author).toBe('ana');
  });

  it('repo sem filtros → null e ler não cria arquivo', () => {
    expect(readPrFilters('rfl-designer/skanner')).toBeNull();
    expect(existsSync(path.join(dir, 'config.json'))).toBe(false);
  });
});

describe('writeOverride — edição inline do [m] (#11)', () => {
  it('persiste o override por path e relê', () => {
    writeOverride('/repo/a', { profile: 'modular', modularBaseDir: 'src/Modules' });

    expect(readOverride('/repo/a')).toEqual({ profile: 'modular', modularBaseDir: 'src/Modules' });
  });

  it('funde com o que já existe na entrada (preserva owner/name)', async () => {
    await writeStore({ '/repo/a': { owner: 'rfl-designer', name: 'soloboard' } });

    writeOverride('/repo/a', { profile: 'flat', modularBaseDir: 'app/Contexts' });

    expect(readOverride('/repo/a')).toEqual({
      owner: 'rfl-designer',
      name: 'soloboard',
      profile: 'flat',
      modularBaseDir: 'app/Contexts',
    });
  });

  it('não vaza para outros repos do mapa', async () => {
    await writeStore({ '/repo/b': { profile: 'modular' } });

    writeOverride('/repo/a', { profile: 'flat' });

    expect(readOverride('/repo/b')).toEqual({ profile: 'modular' });
  });
});
