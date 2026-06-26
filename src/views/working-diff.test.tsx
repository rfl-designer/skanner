import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRepo } from '../core/repo.js';
import type { DiffFile } from '../core/diff.js';

// Mocka o serviço e o highlight: a view é testada como máquina de estados, sem
// git/fs/rede e sem ANSI de sintaxe poluindo o frame.
const { diff } = vi.hoisted(() => ({ diff: vi.fn() }));
vi.mock('../services/local.js', () => ({ diff }));
vi.mock('cli-highlight', () => ({ highlight: (code: string) => code }));

import { WorkingDiffView, type Reload } from './working-diff.js';

const modularRepo: ResolvedRepo = {
  root: '/repo',
  identity: { kind: 'github', owner: 'rfl-designer', name: 'concilliun-crm' },
  profile: 'modular',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
  autoWatch: false,
};
const flatRepo: ResolvedRepo = { ...modularRepo, profile: 'flat', identity: { kind: 'local-only' } };

const tick = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const patch = (p: string): DiffFile['body'] => ({ kind: 'patch', patch: p });

// Change-set de UMA camada (gate comum): uma migration untracked sintetizada.
const migrationOnly: DiffFile[] = [
  {
    path: 'database/migrations/2026_create_contacts_table.php',
    status: { kind: 'added' },
    body: patch('@@ -0,0 +1,2 @@\n+<?php\n+return 1;'),
    url: null,
  },
];

// Change-set multi-camada (modular): migration + model em contexto Crm.
const multiLayer: DiffFile[] = [
  {
    path: 'app/Contexts/Crm/Models/Contact.php',
    status: { kind: 'modified' },
    body: patch('@@ -1 +1 @@\n+class Contact {}'),
    url: null,
  },
  {
    path: 'app/Contexts/Crm/database/migrations/2026_create_contacts_table.php',
    status: { kind: 'added' },
    body: patch('@@ -0,0 +1,1 @@\n+migration'),
    url: null,
  },
];

// Arquivo com DOIS hunks, para exercitar a navegação por bloco ([j/k] no diff).
const twoHunks: DiffFile[] = [
  {
    path: 'app/Models/Plan.php',
    status: { kind: 'modified' },
    body: patch('@@ -1,2 +1,2 @@\n-a\n+b\n@@ -10,2 +10,2 @@\n-c\n+d'),
    url: null,
  },
];

beforeEach(() => {
  diff.mockReset();
});

describe('WorkingDiffView — máquina de estados', () => {
  it('loading: enquanto lê o diff local', () => {
    diff.mockReturnValue(new Promise(() => {})); // nunca resolve
    const { lastFrame, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    expect(lastFrame()).toContain('lendo o diff local');
    unmount();
  });

  it('empty: change-set vazio mostra estado explícito (AC)', async () => {
    diff.mockResolvedValue([]);
    const { lastFrame, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    expect(lastFrame()).toContain('nada para revisar');
    unmount();
  });

  it('error: falha no git/fs mostra erro com retorno', async () => {
    diff.mockRejectedValue(new Error('not a git repo'));
    const { lastFrame, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    expect(lastFrame()).toContain('não deu para ler o diff local');
    expect(lastFrame()).toContain('not a git repo');
    unmount();
  });
});

describe('WorkingDiffView — ready (AC2, AC4)', () => {
  it('lê o diff da raiz do repo ao montar', async () => {
    diff.mockResolvedValue(migrationOnly);
    const { unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    expect(diff).toHaveBeenCalledWith('/repo');
    unmount();
  });

  it('untracked aparece e a camada detectada vai no topo (AC2/AC4)', async () => {
    diff.mockResolvedValue(migrationOnly);
    const { lastFrame, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Camada: Migration'); // rótulo de camada no topo
    expect(frame).toContain('2026_create_contacts_table.php'); // o arquivo novo aparece
    expect(frame).toContain('arquivo 1/1');
    unmount();
  });

  it('rodapé da view tem [j/k]/[tab] mas NÃO repete [r] recarregar (vive no rodapé global, #36)', async () => {
    diff.mockResolvedValue(migrationOnly);
    const { lastFrame, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[j/k] arquivo'); // atalhos contextuais da view seguem
    expect(frame).toContain('[tab] expandir');
    expect(frame).not.toContain('recarregar'); // o [r] não é duplicado aqui
    unmount();
  });

  it('multi-camada: lista todas as camadas no topo, agrupado por contexto (AC4, degradação graciosa)', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Camadas: Migration, Model'); // ambas, na ordem canônica
    expect(frame).toContain('Crm'); // agrupado por contexto (perfil modular)
    unmount();
  });

  it('renderiza o diff unified do arquivo selecionado', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    stdin.write('\t'); // arquivo entra colapsado; [tab] desdobra
    await tick();
    // 1º arquivo na ordem da árvore = Crm/.../migration (migration abre a fatia).
    expect(lastFrame()).toContain('+migration');
    unmount();
  });

  it('[tab] desdobra/dobra o diff do arquivo (entra colapsado)', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    expect(lastFrame()).not.toContain('+migration'); // entra colapsado
    expect(lastFrame()).toContain('diff dobrado');

    stdin.write('\t'); // desdobra
    await tick();
    expect(lastFrame()).toContain('+migration');

    stdin.write('\t'); // dobra de novo
    await tick();
    expect(lastFrame()).not.toContain('+migration');
    unmount();
  });

  it('[↓] navega para o próximo arquivo', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    expect(lastFrame()).toContain('arquivo 1/2');

    stdin.write('\x1B[B'); // seta para baixo
    await tick();
    expect(lastFrame()).toContain('arquivo 2/2');
    unmount();
  });

  it('[l] entra no diff e desdobra; [h] volta para a sidebar', async () => {
    diff.mockResolvedValue(twoHunks);
    const { lastFrame, stdin, unmount } = render(<WorkingDiffView repo={flatRepo} />);
    await tick();
    expect(lastFrame()).toContain('[l] diff'); // foco inicial: sidebar
    expect(lastFrame()).toContain('diff dobrado'); // entra colapsado
    expect(lastFrame()).toContain('›'); // sidebar (cursor da árvore) visível

    stdin.write('l'); // entra no diff (e desdobra)
    await tick();
    expect(lastFrame()).toContain('[h] sidebar'); // rodapé do diff
    expect(lastFrame()).toContain('+b'); // conteúdo do 1º hunk visível
    expect(lastFrame()).toContain('bloco 1/2');
    expect(lastFrame()).not.toContain('›'); // sidebar some: diff em tela cheia

    stdin.write('h'); // volta para a sidebar
    await tick();
    expect(lastFrame()).toContain('[l] diff');
    expect(lastFrame()).toContain('›'); // sidebar de volta
    unmount();
  });

  it('[tab] esconde a sidebar ao expandir e a traz de volta ao dobrar', async () => {
    diff.mockResolvedValue(twoHunks);
    const { lastFrame, stdin, unmount } = render(<WorkingDiffView repo={flatRepo} />);
    await tick();
    expect(lastFrame()).toContain('›'); // sidebar visível (colapsado)

    stdin.write('\t'); // desdobra → sidebar some, foco no diff
    await tick();
    expect(lastFrame()).not.toContain('›');
    expect(lastFrame()).toContain('[h] sidebar'); // rodapé do diff (foco acoplado)

    stdin.write('\t'); // dobra → sidebar volta, foco na sidebar
    await tick();
    expect(lastFrame()).toContain('›');
    expect(lastFrame()).toContain('[l] diff');
    unmount();
  });

  it('[j/k] caminha entre os blocos quando o foco é o diff', async () => {
    diff.mockResolvedValue(twoHunks);
    const { lastFrame, stdin, unmount } = render(<WorkingDiffView repo={flatRepo} />);
    await tick();
    stdin.write('l'); // foco no diff
    await tick();
    expect(lastFrame()).toContain('bloco 1/2');

    stdin.write('j'); // próximo bloco
    await tick();
    expect(lastFrame()).toContain('bloco 2/2');

    stdin.write('k'); // bloco anterior
    await tick();
    expect(lastFrame()).toContain('bloco 1/2');
    unmount();
  });

  it('perfil flat (repo local-only): agrupa só por camada, sem nível de contexto', async () => {
    diff.mockResolvedValue([
      { path: 'app/Models/Plan.php', status: { kind: 'modified' }, body: patch('@@ -1 +1 @@\n+x'), url: null },
      { path: 'database/migrations/2026_create_plans_table.php', status: { kind: 'added' }, body: patch('@@ -0,0 +1,1 @@\n+m'), url: null },
    ]);
    const { lastFrame, unmount } = render(<WorkingDiffView repo={flatRepo} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Migration');
    expect(frame).toContain('Model');
    expect(frame).not.toContain('Sem contexto'); // flat não tem nível de grupo
    unmount();
  });
});

describe('WorkingDiffView — seleção múltipla (#46)', () => {
  it('[espaço] marca o arquivo sob o cursor (✓ na sidebar) e marca de novo desmarca', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    expect(lastFrame()).not.toContain('✓'); // entra sem marcação

    stdin.write(' '); // marca o arquivo 1
    await tick();
    expect(lastFrame()).toContain('✓');

    stdin.write(' '); // desmarca
    await tick();
    expect(lastFrame()).not.toContain('✓');
    unmount();
  });

  it('navegar (j/k) não altera a marcação; dá para marcar vários', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    stdin.write(' '); // marca arquivo 1
    await tick();
    stdin.write('\x1B[B'); // desce p/ arquivo 2 — marcação do 1 permanece
    await tick();
    expect(lastFrame()).toContain('arquivo 2/2');
    expect(lastFrame()).toContain('✓'); // o 1 segue marcado
    stdin.write(' '); // marca o 2 também
    await tick();
    expect((lastFrame() ?? '').match(/✓/g)?.length).toBe(2); // dois marcados
    unmount();
  });

  it('o atalho [espaço] marcar aparece no rodapé da sidebar', async () => {
    diff.mockResolvedValue(migrationOnly);
    const { lastFrame, unmount } = render(<WorkingDiffView repo={modularRepo} />);
    await tick();
    expect(lastFrame()).toContain('[espaço] marcar');
    unmount();
  });

  it('marcação é efêmera: zera ao recarregar (#46)', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, rerender, unmount } = render(
      <WorkingDiffView repo={modularRepo} reload={{ nonce: 0, preserve: false }} />,
    );
    await tick();
    stdin.write(' '); // marca
    await tick();
    expect(lastFrame()).toContain('✓');

    rerender(<WorkingDiffView repo={modularRepo} reload={{ nonce: 1, preserve: true }} />);
    await tick();
    expect(lastFrame()).not.toContain('✓'); // some ao recarregar
    unmount();
  });
});

// Ordem do multiLayer (modular, contexto Crm): migration antes de model (LAYER_ORDER).
// Logo arquivo 1 = …/2026_create_contacts_table.php, arquivo 2 = …/Models/Contact.php.
describe('WorkingDiffView — reload preservado vs manual (#37)', () => {
  const noPreserve = (nonce: number): Reload => ({ nonce, preserve: false });
  const preserve = (nonce: number): Reload => ({ nonce, preserve: true });

  it('auto-watch preserva o cursor por caminho: não joga o dono de volta ao topo', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, rerender, unmount } = render(
      <WorkingDiffView repo={modularRepo} reload={noPreserve(0)} />,
    );
    await tick();
    stdin.write('\x1B[B'); // desce para o arquivo 2 (Contact.php)
    await tick();
    expect(lastFrame()).toContain('arquivo 2/2');

    // Save em background: mesmo change-set, reload PRESERVANDO. O cursor fica no 2.
    rerender(<WorkingDiffView repo={modularRepo} reload={preserve(1)} />);
    await tick();
    expect(lastFrame()).toContain('arquivo 2/2');
    expect(lastFrame()).toContain('Contact.php');
    unmount();
  });

  it('[r] manual (preserve=false) reseta ao topo mesmo após navegar', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, rerender, unmount } = render(
      <WorkingDiffView repo={modularRepo} reload={noPreserve(0)} />,
    );
    await tick();
    stdin.write('\x1B[B');
    await tick();
    expect(lastFrame()).toContain('arquivo 2/2');

    rerender(<WorkingDiffView repo={modularRepo} reload={noPreserve(1)} />);
    await tick();
    expect(lastFrame()).toContain('arquivo 1/2'); // de volta ao topo
    unmount();
  });

  it('por caminho: arquivo selecionado mudou de posição → cursor o segue', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, rerender, unmount } = render(
      <WorkingDiffView repo={modularRepo} reload={noPreserve(0)} />,
    );
    await tick();
    stdin.write('\x1B[B'); // Contact.php (arquivo 2)
    await tick();

    // Recarrega só com o Contact.php (a migration saiu do change-set): ele agora é
    // o índice 0, e o cursor preservado por caminho pousa nele.
    diff.mockResolvedValue([multiLayer[0]]);
    rerender(<WorkingDiffView repo={modularRepo} reload={preserve(1)} />);
    await tick();
    expect(lastFrame()).toContain('arquivo 1/1');
    expect(lastFrame()).toContain('Contact.php');
    unmount();
  });

  it('arquivo selecionado sumiu → cai no vizinho (não crasha)', async () => {
    diff.mockResolvedValue(multiLayer);
    const { lastFrame, stdin, rerender, unmount } = render(
      <WorkingDiffView repo={modularRepo} reload={noPreserve(0)} />,
    );
    await tick();
    stdin.write('\x1B[B'); // Contact.php (arquivo 2, índice 1)
    await tick();

    // Recarrega só com a migration (Contact.php sumiu): clampa ao vizinho disponível.
    diff.mockResolvedValue([multiLayer[1]]);
    rerender(<WorkingDiffView repo={modularRepo} reload={preserve(1)} />);
    await tick();
    expect(lastFrame()).toContain('arquivo 1/1');
    expect(lastFrame()).toContain('2026_create_contacts_table.php');
    unmount();
  });
});
