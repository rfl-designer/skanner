/**
 * Núcleo do agrupamento em fatia vertical (PRD §4, ADR 0002, CONTEXT.md
 * §Agrupamento / §Funções-coração): puro, agnóstico de UI e de fonte, testável
 * isolado. As fontes (Octokit em #5, simple-git e grafo brain depois) só montam a
 * lista de arquivos alterados e patches; a regra de domínio (camada + contexto +
 * árvore) mora aqui, e nunca na view nem no serviço. Issue #5 / #6.
 */

import type { Profile } from './repo.js';

/**
 * Camada (Layer) — papel arquitetural de um arquivo no fluxo da feature. Conjunto
 * FIXO de 16 literais (CONTEXT.md §Camada). É union discriminada: o compilador
 * recusa qualquer valor fora da lista, e um `categorize` só pode devolver um deles.
 */
export type Layer =
  | 'migration'
  | 'model'
  | 'enum'
  | 'dto'
  | 'policy'
  | 'action'
  | 'service'
  | 'job'
  | 'event'
  | 'listener'
  | 'observer'
  | 'notification'
  | 'livewire'
  | 'blade'
  | 'tests'
  | 'outros';

/**
 * Contexto / Feature (CONTEXT.md §Feature/Contexto) — a fatia do domínio à qual um
 * arquivo pertence. Conjunto ABERTO (qualquer `<Ctx>` de `app/Contexts/<Ctx>/`),
 * por isso `string` e não union. A AUSÊNCIA de contexto é `null` explícito (balde
 * "Sem contexto"), nunca string vazia — estado impossível irrepresentável.
 */
export type Context = string;

/** Um arquivo alterado vindo de uma fonte (serviço), antes de categorizado. */
export interface DiffFile {
  path: string;
  /** Diff unified (hunks) do arquivo; `null` quando a fonte não traz patch. */
  patch: string | null;
}

/** Arquivo já com sua camada resolvida — o que a árvore carrega nas folhas. */
export interface ChangedFile {
  path: string;
  patch: string | null;
  layer: Layer;
}

/** Um balde de arquivos de uma mesma camada (nível do meio da árvore). */
export interface LayerGroup {
  layer: Layer;
  files: ChangedFile[];
}

/** Nível superior da árvore: um contexto (ou o balde "Sem contexto" = `null`). */
export interface ContextGroup {
  context: Context | null;
  layers: LayerGroup[];
}

/** Árvore de saída `Contexto → Camada → [arquivos]` (PRD §4, perfil modular). */
export interface ReviewTree {
  groups: ContextGroup[];
}

/**
 * Árvore de saída `Camada → [arquivos]` (PRD §4.0 estratégia 3, perfil `flat` sem
 * grafo): a MESMA forma do modular, porém SEM o nível de grupo. A ausência de grupo
 * é a forma do tipo — não há campo de contexto/fluxo — e não um string vazio.
 */
export interface FlatTree {
  layers: LayerGroup[];
}

/**
 * Saída do agrupamento conforme o [perfil do repo](repo.ts) — união discriminada por
 * `profile` (CONTEXT.md §Grupo: contexto, fluxo, ou AUSENTE). `modular` carrega
 * `groups` (Contexto → Camada); `flat` carrega só `layers` (Camada). O nível de grupo
 * está ausente no `flat` por construção: estados impossíveis (flat com contexto,
 * modular sem grupo) são irrepresentáveis.
 */
export type GroupedReview =
  | { profile: 'modular'; groups: ContextGroup[] }
  | { profile: 'flat'; layers: LayerGroup[] };

/** Rótulo do balde sem contexto (CONTEXT.md §Balde "Sem contexto"). */
export const NO_CONTEXT_LABEL = 'Sem contexto';

/**
 * Ordem de EXIBIÇÃO fixa das camadas dentro de uma feature (PRD §4.2). Uma union
 * não tem ordem; a ordem é um dado declarado aqui. Migration abre, Tests fecha.
 */
export const LAYER_ORDER: readonly Layer[] = [
  'migration',
  'model',
  'enum',
  'dto',
  'policy',
  'action',
  'service',
  'job',
  'event',
  'listener',
  'observer',
  'notification',
  'livewire',
  'blade',
  'tests',
  'outros',
];

/** Rótulo legível de cada camada para a árvore (PRD §4.2). */
export const LAYER_LABEL: Record<Layer, string> = {
  migration: 'Migration',
  model: 'Model',
  enum: 'Enums',
  dto: 'DTOs',
  policy: 'Policies',
  action: 'Actions',
  service: 'Services',
  job: 'Jobs',
  event: 'Events',
  listener: 'Listeners',
  observer: 'Observers',
  notification: 'Notifications',
  livewire: 'Livewire',
  blade: 'Blade',
  tests: 'Tests',
  outros: 'Outros',
};

/**
 * Path do arquivo → [Camada](CONTEXT.md §Camada). Primeira regra que casa vence;
 * **Tests é checado ANTES de Actions** para que `*ActionTest.php` (e qualquer
 * arquivo sob `tests/`) caia em `tests`, não na camada do sufixo (PRD §4.2). O
 * balde `outros` fecha o furo — todo path devolve algum `Layer`.
 */
export function categorize(path: string): Layer {
  if (path.includes('/tests/') || path.startsWith('tests/') || path.endsWith('Test.php')) {
    return 'tests';
  }
  if (path.includes('database/migrations/')) return 'migration';
  if (
    path.includes('/Models/') ||
    path.includes('database/factories/') ||
    path.endsWith('Factory.php') ||
    path.includes('database/seeders/') ||
    path.endsWith('Seeder.php')
  ) {
    return 'model';
  }
  if (path.includes('/Enums/') || path.endsWith('Enum.php')) return 'enum';
  if (
    path.includes('/DTOs/') ||
    path.includes('/Data/') ||
    path.endsWith('DTO.php') ||
    path.endsWith('Data.php')
  ) {
    return 'dto';
  }
  if (path.includes('/Policies/') || path.includes('/Authorization/') || path.endsWith('Policy.php')) {
    return 'policy';
  }
  if (path.includes('/Actions/') || path.endsWith('Action.php')) return 'action';
  if (path.includes('/Services/') || path.endsWith('Service.php')) return 'service';
  if (path.includes('/Jobs/') || path.endsWith('Job.php')) return 'job';
  if (path.includes('/Events/') || path.endsWith('Event.php')) return 'event';
  if (path.includes('/Listeners/') || path.endsWith('Listener.php')) return 'listener';
  if (path.includes('/Observers/') || path.endsWith('Observer.php')) return 'observer';
  if (path.includes('/Notifications/') || path.endsWith('Notification.php')) return 'notification';
  if (path.includes('app/Livewire/') || path.includes('resources/views/livewire/')) return 'livewire';
  if (path.endsWith('.blade.php') || path.includes('resources/views/')) return 'blade';
  return 'outros';
}

const CONTEXTS_MARKER = 'app/Contexts/';
const TESTS_MARKER = 'tests/';
const LIVEWIRE_MARKER = 'app/Livewire/';
const MIGRATIONS_MARKER = 'database/migrations/';

/**
 * Contexto vindo DO PATH (regras 1–2 do PRD §4.1): `app/Contexts/<Ctx>/…` ou
 * `tests/<Suite>/<Ctx>/…Test.php`. É o que semeia o conjunto de candidatos da
 * ponte por nome — por isso é determinístico e independente do escopo. `null`
 * quando o path não carrega contexto.
 */
function pathContext(path: string): Context | null {
  const ci = path.indexOf(CONTEXTS_MARKER);
  if (ci !== -1) {
    const seg = path.slice(ci + CONTEXTS_MARKER.length).split('/')[0];
    if (seg.length > 0 && !seg.endsWith('.php')) return seg;
  }

  const ti = path.indexOf(TESTS_MARKER);
  if (ti !== -1 && path.endsWith('Test.php')) {
    // tests/<Suite>/<Ctx>/… — o contexto espelha app/Contexts/<Ctx> (1º após a suíte).
    const segs = path.slice(ti + TESTS_MARKER.length).split('/');
    const ctx = segs[1];
    if (typeof ctx === 'string' && ctx.length > 0 && !ctx.endsWith('.php')) return ctx;
  }

  return null;
}

/**
 * "Substantivo raiz" de um arquivo sem contexto no path, para a ponte por nome
 * (PRD §4.1 regra 3): migration `…_create_<noun>_table.php` → `<noun>`; componente
 * `app/Livewire/<Grupo>/…` → `<Grupo>`. `null` quando não há substantivo a casar.
 */
function bridgeNoun(path: string): string | null {
  if (path.includes(MIGRATIONS_MARKER)) {
    const m = /create_(.+?)_table/.exec(path);
    if (m) return m[1];
  }
  const li = path.indexOf(LIVEWIRE_MARKER);
  if (li !== -1) {
    const seg = path.slice(li + LIVEWIRE_MARKER.length).split('/')[0];
    if (seg.length > 0) return seg.replace(/\.php$/, '');
  }
  return null;
}

/** Normaliza para casar singular/plural, case-insensitive (PRD §4.1 regra 3). */
function normalize(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('ies')) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith('s')) return lower.slice(0, -1);
  return lower;
}

/**
 * Arquivo + contextos tocados na PR → [Contexto](CONTEXT.md §Feature/Contexto) ou
 * `null` ("Sem contexto"). Path-first (regras 1–2); se o path não resolve, **ponte
 * por nome DENTRO do escopo** (regra 3): casa o substantivo raiz, normalizado,
 * apenas contra `scopeContextSet` (os contextos já resolvidos pelo path nesta PR).
 * Match único → atribui; empate (≥2) ou nenhum → `null`, sem chute (PRD §4.1 / §8).
 */
export function resolveContext(path: string, scopeContextSet: ReadonlySet<Context>): Context | null {
  const direct = pathContext(path);
  if (direct !== null) return direct;

  const noun = bridgeNoun(path);
  if (noun === null) return null;

  const target = normalize(noun);
  const matches = [...scopeContextSet].filter((ctx) => normalize(ctx) === target);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Monta a árvore `Contexto → Camada → [arquivos]` (PRD §4). Dois passos: (1) o path
 * de cada arquivo semeia o conjunto de contextos da PR; (2) cada arquivo é resolvido
 * contra esse conjunto (path-first + ponte por nome). Contextos em ordem alfabética,
 * "Sem contexto" por último; dentro de cada contexto, camadas na ordem canônica e
 * camadas vazias omitidas (PRD §4.2).
 */
export function buildReviewTree(files: DiffFile[]): ReviewTree {
  const withLayer = withLayers(files);

  const scope = new Set<Context>();
  for (const f of withLayer) {
    const ctx = pathContext(f.path);
    if (ctx !== null) scope.add(ctx);
  }

  const byContext = new Map<Context | null, ChangedFile[]>();
  for (const f of withLayer) {
    const ctx = resolveContext(f.path, scope);
    const bucket = byContext.get(ctx);
    if (bucket) bucket.push(f);
    else byContext.set(ctx, [f]);
  }

  const realContexts = [...byContext.keys()]
    .filter((c): c is Context => c !== null)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const orderedKeys: (Context | null)[] = byContext.has(null)
    ? [...realContexts, null]
    : realContexts;

  const groups: ContextGroup[] = orderedKeys.map((context) => ({
    context,
    layers: toLayerGroups(byContext.get(context) ?? []),
  }));

  return { groups };
}

/**
 * Agrupa a review SÓ por camada, na ordem canônica (PRD §4.0 estratégia 3, perfil
 * `flat`): reusa `categorize` e `LAYER_ORDER`, sem qualquer dimensão de grupo. É o
 * mesmo nível do meio do modular, isolado.
 */
export function buildFlatTree(files: DiffFile[]): FlatTree {
  return { layers: toLayerGroups(withLayers(files)) };
}

/**
 * Despacha o agrupamento pela [hierarquia de estratégia](CONTEXT.md §Hierarquia de
 * estratégia) do perfil do repo: `modular` → `buildReviewTree` (Contexto → Camada);
 * `flat` → `buildFlatTree` (só Camada). Único ponto onde o perfil decide a forma —
 * a view só consome a união. (O nível 2, `flat` + grafo, é de outra issue.)
 */
export function groupReview(files: DiffFile[], profile: Profile): GroupedReview {
  return profile === 'flat'
    ? { profile: 'flat', ...buildFlatTree(files) }
    : { profile: 'modular', ...buildReviewTree(files) };
}

/** Resolve a camada de cada arquivo (CONTEXT.md §Camada), preservando patch e path. */
function withLayers(files: DiffFile[]): ChangedFile[] {
  return files.map((f) => ({ path: f.path, patch: f.patch, layer: categorize(f.path) }));
}

/** Indexa por camada e devolve na ordem canônica, sem camadas vazias (PRD §4.2). */
function toLayerGroups(files: ChangedFile[]): LayerGroup[] {
  const byLayer = new Map<Layer, ChangedFile[]>();
  for (const f of files) {
    const bucket = byLayer.get(f.layer);
    if (bucket) bucket.push(f);
    else byLayer.set(f.layer, [f]);
  }
  return LAYER_ORDER.filter((layer) => byLayer.has(layer)).map((layer) => ({
    layer,
    files: byLayer.get(layer) ?? [],
  }));
}
