import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from '../core/repo.js';

// Mocka os serviços: a view é testada como máquina de estados, sem rede/fs.
const { authenticatedUser, setToken, clearToken, readCache, revalidate } = vi.hoisted(() => ({
  authenticatedUser: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  readCache: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('../services/auth.js', () => ({ authenticatedUser, setToken, clearToken }));
vi.mock('../services/prs.js', () => ({ readCache, revalidate }));

const cachedList = (prs: unknown[], fetchedAt = new Date().toISOString()) => ({
  prs,
  etag: '"v"',
  fetchedAt,
});
const pr = (number: number, title: string, over: Record<string, unknown> = {}) => ({
  number,
  title,
  author: 'rafa',
  branch: 'feat/slice',
  baseBranch: 'main',
  draft: false,
  additions: 120,
  deletions: 8,
  updatedAt: '2026-06-20T10:00:00Z',
  ...over,
});

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
  readCache.mockReset();
  revalidate.mockReset();
  readCache.mockReturnValue(null);
  revalidate.mockResolvedValue(cachedList([]));
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

describe('PrsView — lista de PRs (issue #4 + #9)', () => {
  it('autenticado: lista as PRs abertas com os metadados e o frescor', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    revalidate.mockResolvedValue(cachedList([pr(42, 'feat: fatia vertical')]));

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
    // Indicador de frescor visível (issue #9).
    expect(frame).toContain('atualizado');
    unmount();
  });

  it('reabrir o repo: pinta o cache na hora e revalida em 2º plano', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    readCache.mockReturnValue(cachedList([pr(7, 'PR cacheada')]));
    let resolveRevalidate: (v: unknown) => void = () => {};
    revalidate.mockReturnValue(new Promise((res) => (resolveRevalidate = res)));

    const { lastFrame, unmount } = render(<PrsView repo={githubRepo} onCapturingChange={noop} />);
    await tick();

    // Antes da rede responder, já mostra a lista cacheada + "revalidando…".
    const before = lastFrame() ?? '';
    expect(before).toContain('#7');
    expect(before).toContain('PR cacheada');
    expect(before).toContain('revalidando');

    // A revalidação chega e substitui pela lista fresca.
    resolveRevalidate(cachedList([pr(42, 'PR fresca')]));
    await tick();
    const after = lastFrame() ?? '';
    expect(after).toContain('#42');
    expect(after).toContain('PR fresca');
    expect(after).not.toContain('revalidando');
    unmount();
  });

  it('autenticado sem PRs: estado vazio explícito', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    revalidate.mockResolvedValue(cachedList([]));

    const { lastFrame, unmount } = render(<PrsView repo={githubRepo} onCapturingChange={noop} />);
    await tick();

    expect(lastFrame()).toContain('nenhuma PR aberta');
    unmount();
  });

  it('autenticado com falha na busca: estado de erro', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    revalidate.mockRejectedValue(new Error('sem rede'));

    const { lastFrame, unmount } = render(<PrsView repo={githubRepo} onCapturingChange={noop} />);
    await tick();

    expect(lastFrame()).toContain('erro: sem rede');
    unmount();
  });

  it('[r] força a revalidação da lista', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });
    revalidate.mockResolvedValue(cachedList([]));

    const { stdin, unmount } = render(<PrsView repo={githubRepo} onCapturingChange={noop} />);
    await tick();
    expect(revalidate).toHaveBeenCalledTimes(1);

    stdin.write('r');
    await tick();

    expect(revalidate).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('repo local-only: mensagem de owner/name, sem listar', async () => {
    authenticatedUser.mockResolvedValue({ login: 'rafa' });

    const { lastFrame, unmount } = render(
      <PrsView repo={localOnlyRepo} onCapturingChange={noop} />,
    );
    await tick();

    expect(lastFrame()).toContain('owner/name não resolvido');
    expect(revalidate).not.toHaveBeenCalled();
    expect(readCache).not.toHaveBeenCalled();
    unmount();
  });
});
