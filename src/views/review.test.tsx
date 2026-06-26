import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from '../core/repo.js';
import type { DiffFile } from '../core/diff.js';
import type { PrDiff } from '../services/pr.js';

// Mocka os serviços e o highlight: a view é testada como máquina de estados, sem
// rede/fs e sem ANSI de sintaxe poluindo o frame.
const { diff } = vi.hoisted(() => ({ diff: vi.fn() }));
const { getState, setState } = vi.hoisted(() => ({ getState: vi.fn(), setState: vi.fn() }));
vi.mock('../services/pr.js', () => ({ diff }));
vi.mock('../services/review.js', () => ({ getState, setState }));
vi.mock('cli-highlight', () => ({ highlight: (code: string) => code }));

import { ReviewView } from './review.js';

const repo: ResolvedRepo = {
  root: '/repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'concilliun-crm' },
  profile: 'modular',
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
const noop = () => {};

const patch = (p: string): DiffFile['body'] => ({ kind: 'patch', patch: p });

// Repo flat (soloboard): sem app/Contexts; o agrupamento é só por camada.
const flatRepo: ResolvedRepo = {
  root: '/repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'soloboard' },
  profile: 'flat',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
  autoWatch: false,
};

const flatDiff: PrDiff = {
  number: 50,
  files: [
    { path: 'tests/Feature/PlanTest.php', status: { kind: 'modified' }, body: patch('@@ -0 +1 @@\n+assert(true);'), url: null },
    { path: 'app/Actions/CreatePlan.php', status: { kind: 'modified' }, body: patch('@@ -1 +1 @@\n+class CreatePlan {}'), url: null },
    { path: 'app/Models/Plan.php', status: { kind: 'modified' }, body: patch('@@ -1 +1 @@\n+class Plan {}'), url: null },
    { path: 'database/migrations/2024_create_plans_table.php', status: { kind: 'added' }, body: { kind: 'none' }, url: null },
  ],
};

const modularDiff: PrDiff = {
  number: 42,
  files: [
    { path: 'composer.json', status: { kind: 'modified' }, body: patch('@@ -1 +1 @@\n+"x": 1'), url: null },
    {
      path: 'app/Contexts/Crm/Models/Contact.php',
      status: { kind: 'modified' },
      body: patch('@@ -1 +1 @@\n+class Contact {}'),
      url: null,
    },
    {
      path: 'database/migrations/2024_create_contacts_table.php',
      status: { kind: 'added' },
      body: { kind: 'none' },
      url: null,
    },
    {
      path: 'tests/Feature/Crm/CreateContactTest.php',
      status: { kind: 'modified' },
      body: patch('@@ -0 +1 @@\n+assert(true);'),
      url: null,
    },
  ],
};

beforeEach(() => {
  diff.mockReset();
  getState.mockReset();
  setState.mockReset();
  getState.mockReturnValue({ checked: {}, updatedAt: '' });
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

describe('ReviewView — agrupamento flat (perfil flat, #6)', () => {
  it('agrupa só por camada na ordem migration→tests, sem nível de grupo', async () => {
    diff.mockResolvedValue(flatDiff);
    const { lastFrame, unmount } = render(<ReviewView repo={flatRepo} number={50} onBack={noop} />);
    await tick();
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Migration');
    expect(frame).toContain('Model');
    expect(frame).toContain('Actions');
    expect(frame).toContain('Tests');
    // ordem migration→tests preservada na árvore renderizada.
    expect(frame.indexOf('Migration')).toBeLessThan(frame.indexOf('Tests'));
    // sem nível de grupo: nem contexto, nem o balde "Sem contexto".
    expect(frame).not.toContain('Sem contexto');
    unmount();
  });

  it('mesmo render alterna por perfil: modular mostra grupo, flat não', async () => {
    diff.mockResolvedValue(modularDiff);
    const modular = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    await tick();
    expect(modular.lastFrame() ?? '').toContain('Sem contexto');
    modular.unmount();

    diff.mockResolvedValue(flatDiff);
    const flat = render(<ReviewView repo={flatRepo} number={50} onBack={noop} />);
    await tick();
    expect(flat.lastFrame() ?? '').not.toContain('Sem contexto');
    flat.unmount();
  });
});

describe('ReviewView — diff e navegação (AC5)', () => {
  it('renderiza o diff unified do arquivo selecionado', async () => {
    diff.mockResolvedValue(modularDiff);
    const { lastFrame, stdin, unmount } = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    await tick();
    stdin.write('\t'); // arquivo entra colapsado; [tab] desdobra
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

    stdin.write('\x1B[B'); // seta para baixo
    await tick();

    expect(lastFrame()).toContain('arquivo 2/4');
    unmount();
  });

  it('[esc] volta para a lista', async () => {
    diff.mockResolvedValue(modularDiff);
    const onBack = vi.fn();
    const { stdin, unmount } = render(<ReviewView repo={repo} number={42} onBack={onBack} />);
    await tick();

    stdin.write('\x1B'); // esc
    await tick();

    expect(onBack).toHaveBeenCalled();
    unmount();
  });
});

describe('ReviewView — navegação por grupo e ajuda (#11)', () => {
  it('] salta o grupo inteiro para o próximo; [ volta para o anterior', async () => {
    diff.mockResolvedValue(modularDiff);
    const { lastFrame, stdin, unmount } = render(
      <ReviewView repo={repo} number={42} onBack={noop} />,
    );
    await tick();
    // Grupos no flatten: Crm [1,2], Sem contexto [3,4]. Começa no 1º arquivo do Crm.
    expect(lastFrame()).toContain('arquivo 1/4');

    stdin.write(']'); // próximo grupo → 1º arquivo de "Sem contexto"
    await tick();
    expect(lastFrame()).toContain('arquivo 3/4');

    stdin.write('['); // grupo anterior → de volta ao início do Crm
    await tick();
    expect(lastFrame()).toContain('arquivo 1/4');
    unmount();
  });

  it('? mostra a folha de atalhos e fecha com ?', async () => {
    diff.mockResolvedValue(modularDiff);
    const { lastFrame, stdin, unmount } = render(
      <ReviewView repo={repo} number={42} onBack={noop} />,
    );
    await tick();

    stdin.write('?');
    await tick();
    expect(lastFrame()).toContain('Atalhos — Review');
    expect(lastFrame()).toContain('grupo próximo/anterior');

    stdin.write('?'); // fecha e volta à review
    await tick();
    expect(lastFrame()).toContain('arquivo 1/4');
    unmount();
  });
});

describe('ReviewView — checklist de review (#7)', () => {
  const CONTACT = 'app/Contexts/Crm/Models/Contact.php';

  it('[espaço] marca o arquivo atual; o agregado da camada/feature muda e persiste', async () => {
    diff.mockResolvedValue(modularDiff);
    const { lastFrame, stdin, unmount } = render(
      <ReviewView repo={repo} number={42} onBack={noop} />,
    );
    await tick();
    // 1º arquivo na ordem da árvore = Crm/Models/Contact.php.
    expect(lastFrame()).toContain('revisados 0/4');

    stdin.write(' '); // marca revisado
    await tick();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('revisados 1/4');
    expect(frame).toContain('✓'); // arquivo revisado ganha o check
    // persiste via serviço, chaveado por repo+PR.
    expect(setState).toHaveBeenCalledTimes(1);
    const [calledKey, calledState] = setState.mock.calls[0];
    expect(calledKey).toBe('rfl-designer/concilliun-crm#42');
    expect(calledState.checked).toEqual({ [CONTACT]: true });
    expect(typeof calledState.updatedAt).toBe('string');
    unmount();
  });

  it('carrega o estado persistido ao abrir a PR (sobrevive a reabrir)', async () => {
    diff.mockResolvedValue(modularDiff);
    getState.mockReturnValue({ checked: { [CONTACT]: true }, updatedAt: '2026-06-25T00:00:00Z' });
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    await tick();

    expect(getState).toHaveBeenCalledWith('rfl-designer/concilliun-crm#42');
    expect(lastFrame()).toContain('revisados 1/4');
    expect(lastFrame()).toContain('✓');
    unmount();
  });

  it('[espaço] de novo desmarca o arquivo (toggle)', async () => {
    diff.mockResolvedValue(modularDiff);
    const { lastFrame, stdin, unmount } = render(
      <ReviewView repo={repo} number={42} onBack={noop} />,
    );
    await tick();

    stdin.write(' ');
    await tick();
    expect(lastFrame()).toContain('revisados 1/4');

    stdin.write(' ');
    await tick();
    expect(lastFrame()).toContain('revisados 0/4');
    unmount();
  });
});

describe('ReviewView — diffs difíceis (AC1)', () => {
  const hardDiff: PrDiff = {
    number: 5,
    files: [
      {
        path: 'src/code.ts',
        status: { kind: 'modified' },
        body: { kind: 'patch', patch: '@@ -1 +1 @@\n+ok' },
        url: 'https://github.com/o/r/blob/sha/src/code.ts',
      },
      {
        path: 'assets/logo.png',
        status: { kind: 'modified' },
        body: { kind: 'binary' },
        url: 'https://github.com/o/r/blob/sha/assets/logo.png',
      },
      {
        path: 'package-lock.json',
        status: { kind: 'modified' },
        body: { kind: 'truncated' },
        url: 'https://github.com/o/r/blob/sha/package-lock.json',
      },
      {
        path: 'src/new-name.ts',
        status: { kind: 'renamed', from: 'src/old-name.ts' },
        body: { kind: 'none' },
        url: 'https://github.com/o/r/blob/sha/src/new-name.ts',
      },
    ],
  };

  it('truncado + binário + renomeado coexistem: árvore lista todos, sem travar', async () => {
    diff.mockResolvedValue(hardDiff);
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={5} onBack={noop} />);
    await tick();
    const frame = lastFrame() ?? '';
    // os quatro arquivos aparecem na árvore (nada travou ao montar com os casos difíceis).
    expect(frame).toContain('code.ts');
    expect(frame).toContain('logo.png');
    expect(frame).toContain('package-lock.json');
    expect(frame).toContain('new-name.ts');
    expect(frame).toContain('arquivo 1/4');
    unmount();
  });

  // Cada caso é testado como arquivo SELECIONADO (1º da árvore), sem depender de
  // navegação encadeada por teclado (frágil no ink-testing-library).
  const only = (file: PrDiff['files'][number]): PrDiff => ({ number: 5, files: [file] });

  it('binário: badge [binário] + linha de status, sem corpo de diff', async () => {
    diff.mockResolvedValue(only(hardDiff.files[1]));
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={5} onBack={noop} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[binário]');
    expect(frame).toContain('binário — sem diff');
    unmount();
  });

  it('truncado: badge [diff truncado] + URL do arquivo no GitHub, sem corpo', async () => {
    diff.mockResolvedValue(only(hardDiff.files[2]));
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={5} onBack={noop} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[diff truncado]');
    expect(frame).toContain('ver no GitHub');
    expect(frame).toContain('package-lock.json');
    unmount();
  });

  it('renomeado: cabeçalho old → new + badge [renomeado]', async () => {
    diff.mockResolvedValue(only(hardDiff.files[3]));
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={5} onBack={noop} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[renomeado]');
    expect(frame).toContain('src/old-name.ts → src/new-name.ts');
    unmount();
  });

  it('criado e deletado: badge claro', async () => {
    diff.mockResolvedValue(
      only({ path: 'src/novo.ts', status: { kind: 'added' }, body: { kind: 'patch', patch: '+a' }, url: null }),
    );
    const created = render(<ReviewView repo={repo} number={5} onBack={noop} />);
    await tick();
    expect(created.lastFrame()).toContain('[criado]');
    created.unmount();
  });

  it('arquivo gigante abre colapsado; [tab] expande', async () => {
    const huge = Array.from({ length: 2000 }, (_, i) => `+linha${i}`).join('\n');
    diff.mockResolvedValue({
      number: 6,
      files: [
        { path: 'src/big.ts', status: { kind: 'modified' }, body: { kind: 'patch', patch: huge }, url: null },
      ],
    });
    const { lastFrame, stdin, unmount } = render(<ReviewView repo={repo} number={6} onBack={noop} />);
    await tick();
    expect(lastFrame()).toContain('expandir');
    expect(lastFrame()).not.toContain('+linha0');
    expect(lastFrame()).toContain('›'); // sidebar (cursor da árvore) visível

    stdin.write('\t');
    await tick();
    expect(lastFrame()).toContain('+linha0'); // desdobra no topo do diff
    expect(lastFrame()).not.toContain('linha1999'); // viewport: última linha fica fora da tela
    expect(lastFrame()).toContain('abaixo'); // indicador de scroll
    expect(lastFrame()).not.toContain('›'); // sidebar some: diff em tela cheia

    stdin.write('\t'); // dobra → sidebar volta
    await tick();
    expect(lastFrame()).toContain('›');
    unmount();
  });
});

describe('ReviewView — estados de erro tipados (AC3)', () => {
  it('PAT inválido (401): leva a Settings na aba PRs', async () => {
    diff.mockRejectedValue({ status: 401, message: 'Bad credentials' });
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('PAT inválido');
    expect(frame).toContain('aba PRs');
    unmount();
  });

  it('rate limit (403): mostra quando reseta', async () => {
    diff.mockRejectedValue({
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1750001600' } },
    });
    const { lastFrame, unmount } = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('rate limit');
    expect(frame).toContain('reseta às 15:33 UTC');
    unmount();
  });

  it('sem rede: erro com [r] tentar de novo, e o retry refaz a busca', async () => {
    diff.mockRejectedValueOnce(Object.assign(new Error('fetch failed'), { code: 'ENOTFOUND' }));
    diff.mockResolvedValue(modularDiff);
    const { lastFrame, stdin, unmount } = render(<ReviewView repo={repo} number={42} onBack={noop} />);
    await tick();
    expect(lastFrame()).toContain('sem rede');
    expect(lastFrame()).toContain('[r] tentar de novo');

    stdin.write('r');
    await tick();
    expect(lastFrame()).toContain('arquivo 1/4');
    expect(diff).toHaveBeenCalledTimes(2);
    unmount();
  });
});
