import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readOverride } from './conf.js';

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
