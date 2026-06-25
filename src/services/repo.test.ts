import { execFile } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRepoRoot, resolveFromCwd } from './repo.js';

const run = promisify(execFile);

let configDir: string;
const previousConfig = process.env.SKANNER_CONFIG_DIR;
const tmpDirs: string[] = [];

/** Cria um repo git temporário; devolve a raiz já em realpath (macOS /var→/private/var). */
async function makeRepo(opts: { origin?: string; modularDir?: string } = {}): Promise<string> {
  const made = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-repo-'));
  tmpDirs.push(made);
  const root = await fs.realpath(made);
  await run('git', ['init', '-q'], { cwd: root });
  if (opts.origin) await run('git', ['remote', 'add', 'origin', opts.origin], { cwd: root });
  if (opts.modularDir) await fs.mkdir(path.join(root, opts.modularDir), { recursive: true });
  return root;
}

async function writeOverride(root: string, override: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(configDir, 'config.json'), JSON.stringify({ overrides: { [root]: override } }));
}

beforeEach(async () => {
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-cfg-'));
  tmpDirs.push(configDir);
  process.env.SKANNER_CONFIG_DIR = configDir;
});

afterEach(async () => {
  if (previousConfig === undefined) delete process.env.SKANNER_CONFIG_DIR;
  else process.env.SKANNER_CONFIG_DIR = previousConfig;
  await Promise.all(tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe('getRepoRoot (semente)', () => {
  it('resolve a raiz absoluta do repo git (que contém package.json)', async () => {
    const root = await getRepoRoot();
    expect(path.isAbsolute(root)).toBe(true);
    expect(existsSync(path.join(root, 'package.json'))).toBe(true);
  });
});

describe('resolveFromCwd', () => {
  it('AC 1 — resolve a raiz mesmo rodado de uma subpasta', async () => {
    const root = await makeRepo();
    const sub = path.join(root, 'a', 'b');
    await fs.mkdir(sub, { recursive: true });

    expect((await resolveFromCwd(sub)).root).toBe(root);
  });

  it('AC 2 — fora de um repo git → erro fatal claro', async () => {
    const notRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-bare-'));
    tmpDirs.push(notRepo);

    await expect(resolveFromCwd(notRepo)).rejects.toThrow(/não é um repo git/);
  });

  it('AC 3 — origin ssh deriva owner/name', async () => {
    const root = await makeRepo({ origin: 'git@github.com:rfl-designer/skanner.git' });

    expect((await resolveFromCwd(root)).identity).toEqual({
      kind: 'github',
      owner: 'rfl-designer',
      name: 'skanner',
    });
  });

  it('AC 3 — sem origin GitHub → local-only', async () => {
    const root = await makeRepo();

    expect((await resolveFromCwd(root)).identity).toEqual({ kind: 'local-only' });
  });

  it('AC 4 — diretório base modular existe → modular/auto (caso concilliun-crm)', async () => {
    const root = await makeRepo({ modularDir: 'app/Contexts' });
    const repo = await resolveFromCwd(root);

    expect(repo.profile).toBe('modular');
    expect(repo.source.profile).toBe('auto');
  });

  it('AC 4 — sem diretório base modular → flat/auto (caso soloboard)', async () => {
    const root = await makeRepo();

    expect((await resolveFromCwd(root)).profile).toBe('flat');
  });

  it('AC 5 — override do conf sobrescreve o auto-detectado e respeita modularBaseDir', async () => {
    const root = await makeRepo({ modularDir: 'src/Modules' });
    await writeOverride(root, { profile: 'modular', modularBaseDir: 'src/Modules' });
    const repo = await resolveFromCwd(root);

    expect(repo.profile).toBe('modular');
    expect(repo.modularBaseDir).toBe('src/Modules');
    expect(repo.source.profile).toBe('override');
  });

  it('AC 6 — resolver não escreve no conf quando não há correção', async () => {
    const root = await makeRepo({ origin: 'git@github.com:rfl-designer/skanner.git' });
    await resolveFromCwd(root);

    expect(existsSync(path.join(configDir, 'config.json'))).toBe(false);
  });
});
