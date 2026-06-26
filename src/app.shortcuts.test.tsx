import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from './core/repo.js';

// Mocka as views pesadas (Working diff / PRs) e o serviço de override: o foco é a
// fiação dos atalhos globais (#11) — máquina de estados do shell, sem fs nem rede.
const { workingMounts, saveOverride } = vi.hoisted(() => ({
  workingMounts: { count: 0 },
  saveOverride: vi.fn(),
}));

vi.mock('./services/repo.js', () => ({ saveOverride }));
vi.mock('./views/working-diff.js', () => ({
  WorkingDiffView: ({ repo }: { repo: ResolvedRepo }) => {
    // Conta montagens: `[r]` remonta a view (= recarrega o snapshot).
    React.useEffect(() => {
      workingMounts.count += 1;
    }, []);
    return <Text>working perfil={repo.profile} dir={repo.modularBaseDir}</Text>;
  },
}));
vi.mock('./views/prs.js', () => ({
  PrsView: () => <Text>PRs view</Text>,
}));

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

beforeEach(() => {
  workingMounts.count = 0;
  saveOverride.mockReset();
});

describe('App — atalhos globais (#11)', () => {
  it('[tab] alterna Working diff ⇄ PRs', async () => {
    const { lastFrame, stdin, unmount } = render(<App repo={repo} />);
    await tick();
    expect(lastFrame()).toContain('working perfil=flat');

    stdin.write('\t');
    await tick();
    expect(lastFrame()).toContain('PRs view');
    unmount();
  });

  it('[r] recarrega o Working diff (remonta a view)', async () => {
    const { stdin, unmount } = render(<App repo={repo} />);
    await tick();
    expect(workingMounts.count).toBe(1);

    stdin.write('r');
    await tick();
    expect(workingMounts.count).toBe(2);
    unmount();
  });

  it('[m] alterna o perfil e persiste o override por path', async () => {
    const { lastFrame, stdin, unmount } = render(<App repo={repo} />);
    await tick();
    expect(lastFrame()).toContain('perfil flat');

    stdin.write('m'); // alterna → modular e abre a edição inline
    await tick();
    expect(lastFrame()).toContain('modularBaseDir');

    stdin.write('\r'); // [enter] salva
    await tick();
    expect(saveOverride).toHaveBeenCalledWith('/tmp/fake-repo', {
      profile: 'modular',
      modularBaseDir: 'app/Contexts',
    });
    // o repo em estado reflete a correção na hora.
    expect(lastFrame()).toContain('working perfil=modular');
    unmount();
  });

  it('[m] edita o modularBaseDir inline antes de salvar', async () => {
    const { lastFrame, stdin, unmount } = render(<App repo={repo} />);
    await tick();

    stdin.write('m');
    await tick();
    stdin.write('X'); // digita no campo do modularBaseDir
    await tick();
    expect(lastFrame()).toContain('X');

    stdin.write('\r');
    await tick();
    expect(saveOverride).toHaveBeenCalledWith(
      '/tmp/fake-repo',
      expect.objectContaining({ profile: 'modular', modularBaseDir: expect.stringContaining('X') }),
    );
    unmount();
  });

  it('[esc] cancela a edição do [m] sem persistir', async () => {
    const { lastFrame, stdin, unmount } = render(<App repo={repo} />);
    await tick();

    stdin.write('m');
    await tick();
    stdin.write(''); // esc
    await tick();

    expect(saveOverride).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('working perfil=flat'); // perfil intacto
    unmount();
  });

  it('? mostra a folha de atalhos e fecha com ?', async () => {
    const { lastFrame, stdin, unmount } = render(<App repo={repo} />);
    await tick();

    stdin.write('?');
    await tick();
    expect(lastFrame()).toContain('Atalhos — Skanner');
    expect(lastFrame()).toContain('recarrega o Working diff');

    stdin.write('?');
    await tick();
    expect(lastFrame()).toContain('working perfil=flat');
    unmount();
  });
});
