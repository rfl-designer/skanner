/**
 * Funções-coração da resolução de repo (CONTEXT.md §Funções-coração): puras,
 * agnósticas de UI e de fonte, testáveis isoladas. O serviço `repo.resolveFromCwd`
 * faz o IO (git/fs/conf) e compõe estas. Issue #3 / ADR 0005.
 */

/** Identidade do repo no GitHub, ou `local-only` quando o remote não resolve. */
export type RepoIdentity =
  | { kind: 'github'; owner: string; name: string }
  | { kind: 'local-only' };

export type Profile = 'modular' | 'flat';

/** Correções por repo no mapa `path → overrides` do store `conf` (PRD §5). */
export interface RepoOverride {
  profile?: Profile;
  modularBaseDir?: string;
  owner?: string;
  name?: string;
  /** Auto-watch do Working diff ligado por este repo (issue #15); ausente = desligado. */
  autoWatch?: boolean;
}

/** Repo resolvido do cwd — o que `resolveFromCwd` entrega à UI. */
export interface ResolvedRepo {
  root: string;
  identity: RepoIdentity;
  profile: Profile;
  modularBaseDir: string;
  source: { profile: 'auto' | 'override' };
  /** Estado efetivo do auto-watch deste repo (issue #15); default desligado. */
  autoWatch: boolean;
}

/** Diretório base modular default; a existência dele na raiz marca `modular`. */
export const DEFAULT_MODULAR_BASE_DIR = 'app/Contexts';

/**
 * URL do `git remote origin` → identidade. Parseia ssh (`git@github.com:o/n.git`),
 * https e `ssh://`/`git://`; host não-GitHub, ausente ou ilegível → `local-only`
 * (AC 3 / ADR 0005).
 */
export function parseOriginUrl(remoteUrl: string | null): RepoIdentity {
  const url = remoteUrl?.trim();
  if (!url) return { kind: 'local-only' };

  let host: string;
  let path: string;
  const scp = /^[^@]+@([^:/]+):(.+)$/.exec(url);
  if (scp && !url.includes('://')) {
    [, host, path] = scp;
  } else {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { kind: 'local-only' };
    }
    host = parsed.hostname;
    path = parsed.pathname.replace(/^\//, '');
  }

  if (host.toLowerCase() !== 'github.com') return { kind: 'local-only' };
  const ownerName = /^([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(path);
  if (!ownerName) return { kind: 'local-only' };
  return { kind: 'github', owner: ownerName[1], name: ownerName[2] };
}

/** Diretório base modular a checar no fs, honrando o override (AC 5). */
export function modularBaseDirFor(override: RepoOverride): string {
  return override.modularBaseDir ?? DEFAULT_MODULAR_BASE_DIR;
}

/** Alterna o perfil: `modular` ↔ `flat` — regra pura da tecla `[m]` (issue #11). */
export function toggleProfile(profile: Profile): Profile {
  return profile === 'modular' ? 'flat' : 'modular';
}

/**
 * Aplica a edição inline do `[m]` (issue #11) sobre o repo resolvido: o perfil
 * alvo + o `modularBaseDir` digitado. Devolve o `override` a persistir por path
 * (mapa `path → overrides`, ADR 0005) e o `repo` atualizado para a UI — `source`
 * vira `override` porque a correção passou a ser manual. Diretório em branco cai
 * no default (evita persistir string vazia). Pura/testável.
 */
export function applyProfileEdit(
  repo: ResolvedRepo,
  edit: { profile: Profile; modularBaseDir: string },
): { override: RepoOverride; repo: ResolvedRepo } {
  const modularBaseDir = edit.modularBaseDir.trim() || DEFAULT_MODULAR_BASE_DIR;
  return {
    override: { profile: edit.profile, modularBaseDir },
    repo: { ...repo, profile: edit.profile, modularBaseDir, source: { profile: 'override' } },
  };
}

/**
 * Funde o auto-detectado com o override do `conf`, aplicando a precedência:
 * perfil/identidade do override vencem o auto (AC 4–5). Sem `override.profile`,
 * o perfil é `modular` sse o diretório base existe, senão `flat`. Identidade
 * manual (`owner/name`) só entra quando o remote não resolveu (`local-only`).
 */
export function mergeOverride(input: {
  parsedIdentity: RepoIdentity;
  hasModularBaseDir: boolean;
  override: RepoOverride;
}): Omit<ResolvedRepo, 'root'> {
  const { parsedIdentity, hasModularBaseDir, override } = input;
  const auto: Profile = hasModularBaseDir ? 'modular' : 'flat';

  const identity: RepoIdentity =
    parsedIdentity.kind === 'github'
      ? parsedIdentity
      : override.owner && override.name
        ? { kind: 'github', owner: override.owner, name: override.name }
        : { kind: 'local-only' };

  return {
    identity,
    profile: override.profile ?? auto,
    modularBaseDir: modularBaseDirFor(override),
    source: { profile: override.profile ? 'override' : 'auto' },
    autoWatch: override.autoWatch ?? false,
  };
}

/**
 * Alterna o **auto-watch** do repo (tecla `[w]`, issue #15): liga ↔ desliga.
 * Updater PURO análogo ao `applyProfileEdit` — devolve o `override` a persistir
 * por path (mapa `path → overrides`, ADR 0005) com o `autoWatch` invertido e o
 * `repo` atualizado para a UI refletir o estado na hora. Pura/testável.
 */
export function toggleAutoWatch(repo: ResolvedRepo): { override: RepoOverride; repo: ResolvedRepo } {
  const autoWatch = !repo.autoWatch;
  return { override: { autoWatch }, repo: { ...repo, autoWatch } };
}
