import React, { act } from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from './core/repo.js';
import { isIgnoredPath } from './core/watch.js';

// Mocka as views pesadas (Working diff / PRs), o serviço de override e o de watch:
// o foco é a fiação dos atalhos globais (#11) e do auto-watch (#15) — máquina de
// estados do shell, sem fs nem rede.
const { workingMounts, saveOverride, watchMock, unsub } = vi.hoisted(() => ({
  workingMounts: { count: 0 },
  saveOverride: vi.fn(),
  watchMock: vi.fn(),
  unsub: vi.fn(),
}));

vi.mock('./services/repo.js', () => ({ saveOverride }));
vi.mock('./services/watch.js', () => ({ watch: watchMock }));
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
  autoWatch: false,
};

const tick = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

// Emula o contrato do serviço `watch` (real `isIgnoredPath`): entrega um evento de
// path; só vira `onChange` quando o path não é ruído de diretório ignorado.
let triggerWatch: (relPath: string) => void = () => {};

beforeEach(() => {
  workingMounts.count = 0;
  saveOverride.mockReset();
  watchMock.mockReset();
  unsub.mockReset();
  watchMock.mockImplementation((_root: string, onChange: () => void) => {
    triggerWatch = (relPath: string) => {
      if (!isIgnoredPath(relPath)) onChange();
    };
    return unsub;
  });
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

describe('App — auto-watch (#15)', () => {
  it('AC1: com auto-watch ligado, um evento de watch recarrega sem input do usuário', async () => {
    const { stdin, unmount } = render(<App repo={repo} />);
    await tick();
    expect(workingMounts.count).toBe(1); // monta uma vez

    stdin.write('w'); // liga o auto-watch → o effect assina o watcher
    await tick();
    expect(watchMock).toHaveBeenCalledWith('/tmp/fake-repo', expect.any(Function));
    expect(workingMounts.count).toBe(1); // ligar não remonta por si

    // Um evento de arquivo de código (não-ignorado) → bump do nonce → remonta.
    await act(async () => {
      triggerWatch('app/Contexts/Crm/Models/Lead.php');
    });
    await tick();
    expect(workingMounts.count).toBe(2); // recarregou sem nenhum input

    unmount();
  });

  it('AC2: evento em diretório ignorado não recarrega', async () => {
    const { stdin, unmount } = render(<App repo={repo} />);
    await tick();
    stdin.write('w');
    await tick();
    expect(workingMounts.count).toBe(1);

    await act(async () => {
      triggerWatch('vendor/autoload.php');
      triggerWatch('node_modules/react/index.js');
    });
    await tick();
    expect(workingMounts.count).toBe(1); // ruído não dispara re-render

    unmount();
  });

  it('AC3: [w] liga/desliga e persiste por repo (saveOverride), e cancela o watcher ao desligar', async () => {
    const { lastFrame, stdin, unmount } = render(<App repo={repo} />);
    await tick();
    expect(lastFrame()).toContain('[w] auto-watch: off');

    stdin.write('w'); // liga
    await tick();
    expect(saveOverride).toHaveBeenLastCalledWith('/tmp/fake-repo', { autoWatch: true });
    expect(lastFrame()).toContain('[w] auto-watch: on');

    stdin.write('w'); // desliga
    await tick();
    expect(saveOverride).toHaveBeenLastCalledWith('/tmp/fake-repo', { autoWatch: false });
    expect(lastFrame()).toContain('[w] auto-watch: off');
    expect(unsub).toHaveBeenCalled(); // o cleanup fechou o watcher

    unmount();
  });

  it('AC3: com auto-watch desligado, o [r] manual continua recarregando (não regride #14)', async () => {
    const { stdin, unmount } = render(<App repo={repo} />);
    await tick();
    expect(workingMounts.count).toBe(1);
    expect(watchMock).not.toHaveBeenCalled(); // desligado: nenhum watcher ativo

    stdin.write('r');
    await tick();
    expect(workingMounts.count).toBe(2); // refresh manual intacto

    unmount();
  });
});
