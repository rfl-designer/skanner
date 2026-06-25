import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocka o serviço de auth: a view é testada como máquina de estados, sem rede/fs.
const { authenticatedUser, setToken, clearToken } = vi.hoisted(() => ({
  authenticatedUser: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));
vi.mock('../services/auth.js', () => ({ authenticatedUser, setToken, clearToken }));

import { PrsView } from './prs.js';

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
});

describe('PrsView — auth lazy', () => {
  it('sem PAT persistido: pede o token e documenta o escopo repo', async () => {
    authenticatedUser.mockResolvedValue(null);
    const onCapturing = vi.fn();

    const { lastFrame, unmount } = render(<PrsView onCapturingChange={onCapturing} />);
    await tick();

    expect(lastFrame()).toContain('Personal Access Token');
    expect(lastFrame()).toContain('repo');
    expect(onCapturing).toHaveBeenCalledWith(true);
    unmount();
  });

  it('com PAT válido persistido: retoma autenticado mostrando o usuário', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });

    const { lastFrame, unmount } = render(<PrsView onCapturingChange={noop} />);
    await tick();

    expect(lastFrame()).toContain('autenticado como rafa');
    unmount();
  });

  it('autenticado: [x] limpa o PAT', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    clearToken.mockResolvedValue(undefined);

    const { lastFrame, stdin, unmount } = render(<PrsView onCapturingChange={noop} />);
    await tick();
    expect(lastFrame()).toContain('autenticado como rafa');

    stdin.write('x');
    await tick();

    expect(clearToken).toHaveBeenCalled();
    expect(lastFrame()).toContain('Personal Access Token');
    unmount();
  });
});
