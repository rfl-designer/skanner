import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './app.js';

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
  it('abre no Working diff com o título e a aba ativa', () => {
    const { lastFrame, unmount } = render(<App />);

    expect(lastFrame()).toContain('Skanner');
    expect(lastFrame()).toContain('Working diff');
    expect(lastFrame()).toContain('[g] resolver raiz do repo');

    unmount();
  });

  it('alterna para a aba PRs com [tab] e cai no fluxo de auth', async () => {
    const { lastFrame, stdin, unmount } = render(<App />);

    stdin.write('\t');
    await tick();

    expect(lastFrame()).toContain('Personal Access Token');

    unmount();
  });
});
