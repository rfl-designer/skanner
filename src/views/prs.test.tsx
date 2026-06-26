import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from '../core/repo.js';

// Mocka os serviços: a view é testada como máquina de estados, sem rede/fs.
const { authenticatedUser, setToken, clearToken, list } = vi.hoisted(() => ({
  authenticatedUser: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  list: vi.fn(),
}));
vi.mock('../services/auth.js', () => ({ authenticatedUser, setToken, clearToken }));
vi.mock('../services/prs.js', () => ({ list }));

import { PrsView } from './prs.js';

const githubRepo: ResolvedRepo = {
  root: '/repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'skanner' },
  profile: 'flat',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
};
const localOnlyRepo: ResolvedRepo = { ...githubRepo, identity: { kind: 'local-only' } };

const tick = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
const noop = () => {};

beforeEach(() => {
  authenticatedUser.mockReset();
  setToken.mockReset();
  clearToken.mockReset();
  list.mockReset();
  list.mockResolvedValue([]);
});

describe('PrsView — auth lazy', () => {
  it('sem PAT persistido: pede o token e documenta o escopo repo', async () => {
    authenticatedUser.mockResolvedValue(null);
    const onCapturing = vi.fn();

    const { lastFrame, unmount } = render(
      <PrsView repo={githubRepo} onCapturingChange={onCapturing} />,
    );
    await tick();

    expect(lastFrame()).toContain('Personal Access Token');
    expect(lastFrame()).toContain('repo');
    expect(onCapturing).toHaveBeenCalledWith(true);
    unmount();
  });

  it('com PAT válido persistido: retoma autenticado mostrando o usuário', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });

    const { lastFrame, unmount } = render(<PrsView repo={githubRepo} onCapturingChange={noop} />);
    await tick();

    expect(lastFrame()).toContain('autenticado como rafa');
    unmount();
  });

  it('autenticado: [x] limpa o PAT', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    clearToken.mockResolvedValue(undefined);

    const { lastFrame, stdin, unmount } = render(
      <PrsView repo={githubRepo} onCapturingChange={noop} />,
    );
    await tick();
    expect(lastFrame()).toContain('autenticado como rafa');

    stdin.write('x');
    await tick();

    expect(clearToken).toHaveBeenCalled();
    expect(lastFrame()).toContain('Personal Access Token');
    unmount();
  });
});

describe('PrsView — lista de PRs (issue #4)', () => {
  it('autenticado: lista as PRs abertas com os metadados', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    list.mockResolvedValue([
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

    const { lastFrame, unmount } = render(<PrsView repo={githubRepo} onCapturingChange={noop} />);
    await tick();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('#42');
    expect(frame).toContain('feat: fatia vertical');
    expect(frame).toContain('@rafa');
    expect(frame).toContain('feat/slice');
    expect(frame).toContain('+120');
    expect(frame).toContain('-8');
    expect(frame).toContain('2026-06-20');
    unmount();
  });

  it('autenticado sem PRs: estado vazio explícito', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    list.mockResolvedValue([]);

    const { lastFrame, unmount } = render(<PrsView repo={githubRepo} onCapturingChange={noop} />);
    await tick();

    expect(lastFrame()).toContain('nenhuma PR aberta');
    unmount();
  });

  it('autenticado com falha na busca: estado de erro', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    list.mockRejectedValue(new Error('sem rede'));

    const { lastFrame, unmount } = render(<PrsView repo={githubRepo} onCapturingChange={noop} />);
    await tick();

    expect(lastFrame()).toContain('erro: sem rede');
    unmount();
  });

  it('[r] refaz a busca da lista', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    list.mockResolvedValue([]);

    const { stdin, unmount } = render(<PrsView repo={githubRepo} onCapturingChange={noop} />);
    await tick();
    expect(list).toHaveBeenCalledTimes(1);

    stdin.write('r');
    await tick();

    expect(list).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('repo local-only: mensagem de owner/name, sem listar', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });

    const { lastFrame, unmount } = render(
      <PrsView repo={localOnlyRepo} onCapturingChange={noop} />,
    );
    await tick();

    expect(lastFrame()).toContain('owner/name não resolvido');
    expect(list).not.toHaveBeenCalled();
    unmount();
  });
});
