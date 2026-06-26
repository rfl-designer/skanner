import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResolvedRepo } from './core/repo.js';
import { App } from './app.js';

const repo: ResolvedRepo = {
  root: '/tmp/fake-repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'skanner' },
  profile: 'flat',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
};

const tick = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

let dir: string;

beforeEach(async () => {
  // Dir de config vazio: a aba PRs resolve "sem token" sem tocar a rede.
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skanner-app-'));
  process.env.SKANNER_CONFIG_DIR = dir;
});

afterEach(async () => {
  delete process.env.SKANNER_CONFIG_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('App', () => {
  it('abre no Working diff com o título, a aba ativa e o repo resolvido', () => {
    const { lastFrame, unmount } = render(<App repo={repo} />);

    expect(lastFrame()).toContain('Skanner');
    expect(lastFrame()).toContain('Working diff');
    // O perfil do repo resolvido aparece no cabeçalho da aba local.
    expect(lastFrame()).toContain('perfil flat');
    // A aba Working diff já monta e começa a ler o diff local.
    expect(lastFrame()).toContain('lendo o diff local');

    unmount();
  });

  it('alterna para a aba PRs com [tab] e cai no fluxo de auth', async () => {
    const { lastFrame, stdin, unmount } = render(<App repo={repo} />);

    stdin.write('\t');
    await tick();

    expect(lastFrame()).toContain('Personal Access Token');

    unmount();
  });
});
