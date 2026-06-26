import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from '../core/repo.js';
import type { PrDiff } from '../services/pr.js';

// Mocka os serviços e o highlight: a view é testada como máquina de estados, sem
// rede/fs e sem ANSI de sintaxe poluindo o frame.
const { diff } = vi.hoisted(() => ({ diff: vi.fn() }));
vi.mock('../services/pr.js', () => ({ diff }));
vi.mock('cli-highlight', () => ({ highlight: (code: string) => code }));

import { ReviewView } from './review.js';

const repo: ResolvedRepo = {
  root: '/repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'concilliun-crm' },
  profile: 'modular',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
};

const tick = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
const noop = () => {};

const modularDiff: PrDiff = {
  number: 42,
  files: [
    { path: 'composer.json', patch: '@@ -1 +1 @@\n+"x": 1' },
    { path: 'app/Contexts/Crm/Models/Contact.php', patch: '@@ -1 +1 @@\n+class Contact {}' },
    { path: 'database/migrations/2024_create_contacts_table.php', patch: null },
    { path: 'tests/Feature/Crm/CreateContactTest.php', patch: '@@ -0 +1 @@\n+assert(true);' },
  ],
};

beforeEach(() => {
  diff.mockReset();
});

describe('ReviewView — máquina de estados', () => {
  it('loading: enquanto busca o diff', async () => {
    diff.mockReturnValue(new Promise(() => {})); // nunca resolve
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    expect(lastFrame()).toContain('carregando diff da PR #42');
    unmount();
  });

  it('empty: PR sem arquivos', async () => {
    diff.mockResolvedValue({ number: 7, files: [] });
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={7} onBack={noop} />);
    await tick();
    expect(lastFrame()).toContain('sem arquivos');
    unmount();
  });

  it('error: falha na busca mostra erro com retorno', async () => {
    diff.mockRejectedValue(new Error('sem rede'));
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    await tick();
    expect(lastFrame()).toContain('erro: sem rede');
    expect(lastFrame()).toContain('voltar');
    unmount();
  });
});

describe('ReviewView — árvore agrupada (AC1–AC3)', () => {
  it('agrupa por contexto e camada; "Sem contexto" por último', async () => {
    diff.mockResolvedValue(modularDiff);
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    await tick();
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Crm');
    expect(frame).toContain('Migration');
    expect(frame).toContain('Model');
    expect(frame).toContain('Tests');
    expect(frame).toContain('Sem contexto');
    // "Sem contexto" (do composer.json) aparece depois do contexto Crm.
    expect(frame.indexOf('Sem contexto')).toBeGreaterThan(frame.indexOf('Crm'));
    // a migration foi pontuada ao Crm (ponte por nome create_contacts_table → Crm? não:
    // o substantivo é "contacts"; o contexto é "Crm", então NÃO casa) — fica em Sem contexto.
    unmount();
  });
});

describe('ReviewView — diff e navegação (AC5)', () => {
  it('renderiza o diff unified do arquivo selecionado', async () => {
    diff.mockResolvedValue(modularDiff);
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    await tick();
    const frame = lastFrame() ?? '';
    // 1º arquivo na ordem da árvore = Crm/Models/Contact.php (contexto antes de "Sem contexto").
    expect(frame).toContain('class Contact {}');
    expect(frame).toContain('arquivo 1/4');
    unmount();
  });

  it('[↓] navega para o próximo arquivo e renderiza o diff dele', async () => {
    diff.mockResolvedValue(modularDiff);
    const { lastFrame, stdin, unmount } = render(
      <ReviewView repo={repo} number={42} onBack={noop} />,
    );
    await tick();

    stdin.write('[B'); // seta para baixo
    await tick();

    expect(lastFrame()).toContain('arquivo 2/4');
    unmount();
  });

  it('patch null: badge de diff indisponível, sem corpo', async () => {
    diff.mockResolvedValue({
      number: 9,
      files: [{ path: 'storage/logo.png', patch: null }],
    });
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={9} onBack={noop} />);
    await tick();
    expect(lastFrame()).toContain('patch indisponível');
    unmount();
  });

  it('[esc] volta para a lista', async () => {
    diff.mockResolvedValue(modularDiff);
    const onBack = vi.fn();
    const { stdin, unmount } = render(<ReviewView repo={repo} number={42} onBack={onBack} />);
    await tick();

    stdin.write(''); // esc
    await tick();

    expect(onBack).toHaveBeenCalled();
    unmount();
  });
});
