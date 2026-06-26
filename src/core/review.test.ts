import { describe, expect, it } from 'vitest';
import {
  buildFlatTree,
  buildReviewTree,
  categorize,
  groupReview,
  resolveContext,
  type DiffFile,
  type Layer,
} from './review.js';

const file = (path: string, patch: string | null = null): DiffFile => ({
  path,
  status: { kind: 'modified' },
  body: patch === null ? { kind: 'none' } : { kind: 'patch', patch },
  url: null,
});

describe('categorize — camada por path (casos reais concilliun-crm)', () => {
  it.each<[string, Layer]>([
    ['database/migrations/2024_01_01_000000_create_plans_table.php', 'migration'],
    ['app/Contexts/Crm/Models/Contact.php', 'model'],
    ['database/factories/PlanFactory.php', 'model'],
    ['database/seeders/PlanSeeder.php', 'model'],
    ['app/Contexts/Billing/Enums/InvoiceStatus.php', 'enum'],
    ['app/Contexts/Billing/DTOs/InvoiceData.php', 'dto'],
    ['app/Contexts/Crm/Policies/ContactPolicy.php', 'policy'],
    ['app/Contexts/Crm/Actions/CreateContact.php', 'action'],
    ['app/Contexts/Crm/Services/ContactService.php', 'service'],
    ['app/Contexts/Crm/Jobs/SyncContactJob.php', 'job'],
    ['app/Contexts/Crm/Events/ContactCreated.php', 'event'],
    ['app/Contexts/Crm/Listeners/NotifyOwnerListener.php', 'listener'],
    ['app/Contexts/Crm/Observers/ContactObserver.php', 'observer'],
    ['app/Contexts/Crm/Notifications/ContactCreatedNotification.php', 'notification'],
    ['app/Livewire/Activities/Index.php', 'livewire'],
    ['resources/views/livewire/activities/index.blade.php', 'livewire'],
    ['resources/views/components/card.blade.php', 'blade'],
    ['tests/Feature/Crm/CreateContactTest.php', 'tests'],
    ['composer.json', 'outros'],
  ])('%s → %s', (path, layer) => {
    expect(categorize(path)).toBe(layer);
  });

  it('Tests vence Actions: *ActionTest.php cai em tests, não action', () => {
    expect(categorize('tests/Feature/Crm/Actions/CreateContactActionTest.php')).toBe('tests');
  });

  it('todo path devolve um Layer (balde outros fecha o furo)', () => {
    expect(categorize('.github/workflows/ci.yml')).toBe('outros');
    expect(categorize('README.md')).toBe('outros');
  });
});

describe('resolveContext — path-first (regras 1–2)', () => {
  const empty = new Set<string>();

  it('app/Contexts/<Ctx>/… → <Ctx>', () => {
    expect(resolveContext('app/Contexts/Crm/Actions/CreateContact.php', empty)).toBe('Crm');
  });

  it('tests/<Suite>/<Ctx>/…Test.php → <Ctx>', () => {
    expect(resolveContext('tests/Feature/Crm/CreateContactTest.php', empty)).toBe('Crm');
    expect(resolveContext('tests/Unit/Billing/Invoice/CalcTest.php', empty)).toBe('Billing');
  });

  it('sem contexto no path e sem escopo → null', () => {
    expect(resolveContext('composer.json', empty)).toBeNull();
    expect(resolveContext('database/migrations/2024_create_plans_table.php', empty)).toBeNull();
  });
});

describe('resolveContext — ponte por nome dentro do escopo (regra 3)', () => {
  it('migration create_<x>_table casa o contexto da PR (singular/plural)', () => {
    const scope = new Set(['Activity', 'Crm']);
    expect(
      resolveContext('database/migrations/2024_create_activities_table.php', scope),
    ).toBe('Activity');
  });

  it('componente app/Livewire/<X> casa o contexto da PR', () => {
    const scope = new Set(['Activity', 'Crm']);
    expect(resolveContext('app/Livewire/Activities/Index.php', scope)).toBe('Activity');
  });

  it('empate (dois candidatos casam) → null, sem chute', () => {
    const scope = new Set(['Plan', 'Plans']);
    expect(
      resolveContext('database/migrations/2024_create_plans_table.php', scope),
    ).toBeNull();
  });

  it('nenhum candidato casa → null', () => {
    const scope = new Set(['Crm']);
    expect(
      resolveContext('database/migrations/2024_create_invoices_table.php', scope),
    ).toBeNull();
  });
});

describe('buildReviewTree — árvore Contexto → Camada → [arquivos]', () => {
  it('agrupa por contexto e ordena camadas migration→tests (AC1)', () => {
    const tree = buildReviewTree([
      file('tests/Feature/Contact/CreateContactTest.php'),
      file('app/Contexts/Contact/Actions/CreateContact.php'),
      file('app/Contexts/Contact/Models/Contact.php'),
      file('database/migrations/2024_create_contacts_table.php'),
    ]);

    const contact = tree.groups.find((g) => g.context === 'Contact');
    expect(contact).toBeDefined();
    expect(contact?.layers.map((l) => l.layer)).toEqual(['migration', 'model', 'action', 'tests']);
  });

  it('ponte por nome leva migration e Livewire ao contexto da PR (AC2)', () => {
    const tree = buildReviewTree([
      file('app/Contexts/Activity/Models/Activity.php'),
      file('database/migrations/2024_create_activities_table.php'),
      file('app/Livewire/Activities/Index.php'),
    ]);

    const activity = tree.groups.find((g) => g.context === 'Activity');
    const paths = activity?.layers.flatMap((l) => l.files.map((f) => f.path)) ?? [];
    expect(paths).toContain('database/migrations/2024_create_activities_table.php');
    expect(paths).toContain('app/Livewire/Activities/Index.php');
    expect(tree.groups.some((g) => g.context === null)).toBe(false);
  });

  it('arquivos sem contexto vão para "Sem contexto", por último (AC3)', () => {
    const tree = buildReviewTree([
      file('composer.json'),
      file('app/Contexts/Crm/Models/Contact.php'),
    ]);

    expect(tree.groups[tree.groups.length - 1].context).toBeNull();
    const semContexto = tree.groups.find((g) => g.context === null);
    expect(semContexto?.layers.flatMap((l) => l.files.map((f) => f.path))).toEqual([
      'composer.json',
    ]);
  });

  it('empate na ponte por nome → arquivo em "Sem contexto" (AC4)', () => {
    const tree = buildReviewTree([
      file('app/Contexts/Plan/Models/Plan.php'),
      file('app/Contexts/Plans/Models/PlanGroup.php'),
      file('database/migrations/2024_create_plans_table.php'),
    ]);

    const semContexto = tree.groups.find((g) => g.context === null);
    expect(semContexto?.layers.flatMap((l) => l.files.map((f) => f.path))).toEqual([
      'database/migrations/2024_create_plans_table.php',
    ]);
  });

  it('contextos em ordem alfabética', () => {
    const tree = buildReviewTree([
      file('app/Contexts/Crm/Models/Contact.php'),
      file('app/Contexts/Billing/Models/Invoice.php'),
    ]);
    expect(tree.groups.map((g) => g.context)).toEqual(['Billing', 'Crm']);
  });
});

describe('buildFlatTree — árvore Camada → [arquivos] (perfil flat, #6)', () => {
  // Repo flat (soloboard): sem app/Contexts, sem contexto no path.
  const flatFiles = [
    file('tests/Feature/PlanTest.php'),
    file('app/Actions/CreatePlan.php'),
    file('app/Models/Plan.php'),
    file('database/migrations/2024_create_plans_table.php'),
  ];

  it('agrupa só por camada, na ordem migration→tests (AC1)', () => {
    const tree = buildFlatTree(flatFiles);
    expect(tree.layers.map((l) => l.layer)).toEqual(['migration', 'model', 'action', 'tests']);
  });

  it('não há nível de grupo: nenhuma chave de contexto na saída (AC2)', () => {
    const tree = buildFlatTree(flatFiles);
    // A forma carrega só `layers`; o nível de grupo está ausente por construção.
    expect(tree).not.toHaveProperty('groups');
    expect(Object.keys(tree)).toEqual(['layers']);
  });

  it('camadas vazias são omitidas e as folhas preservam path/patch', () => {
    const tree = buildFlatTree([file('app/Models/Plan.php', '@@\n+x')]);
    expect(tree.layers).toHaveLength(1);
    expect(tree.layers[0].files).toEqual([
      { path: 'app/Models/Plan.php', patch: '@@\n+x', layer: 'model' },
    ]);
  });
});

describe('groupReview — despacho por perfil; alternar modular↔flat (AC3)', () => {
  // MESMOS arquivos resolvidos por cada perfil produzem a forma correta de cada um.
  const files = [
    file('app/Contexts/Crm/Models/Contact.php'),
    file('database/migrations/2024_create_contacts_table.php'),
    file('tests/Feature/Crm/CreateContactTest.php'),
  ];

  it('modular → groups (Contexto → Camada), igual a buildReviewTree', () => {
    const review = groupReview(files, 'modular');
    expect(review.profile).toBe('modular');
    if (review.profile !== 'modular') throw new Error('esperava modular');
    expect(review.groups).toEqual(buildReviewTree(files).groups);
    expect(review.groups.some((g) => g.context === 'Crm')).toBe(true);
  });

  it('flat → layers (só Camada), igual a buildFlatTree, sem nível de grupo', () => {
    const review = groupReview(files, 'flat');
    expect(review.profile).toBe('flat');
    if (review.profile !== 'flat') throw new Error('esperava flat');
    expect(review.layers).toEqual(buildFlatTree(files).layers);
    expect(review).not.toHaveProperty('groups');
    expect(review.layers.map((l) => l.layer)).toEqual(['migration', 'model', 'tests']);
  });
});
