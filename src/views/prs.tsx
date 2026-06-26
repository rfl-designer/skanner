import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  authenticatedUser,
  clearToken,
  setToken,
  type GitHubUser,
} from '../services/auth.js';
import {
  readCache,
  revalidate,
  readFilters,
  writeFilters,
  type PullRequest,
} from '../services/prs.js';
import { freshness } from '../core/freshness.js';
import {
  applyFilters,
  hasActiveFilter,
  NO_FILTERS,
  type PrFilters,
} from '../core/filterPrs.js';
import { classifyGitHubError, resetLabel, type GitHubError } from '../core/github-error.js';
import type { ResolvedRepo } from '../core/repo.js';

/**
 * Aba **PRs** (modo remoto). Na issue #2 ela hospeda só o fluxo de auth **lazy**
 * (ADR 0005): o launch nunca pede PAT; ele é solicitado aqui, na 1ª entrada sem
 * token válido. A listagem de PRs entra na issue dela.
 *
 * Máquina de estados: loading → (prompt ⇄ validating) → authenticated.
 */
type AuthState =
  | { status: 'loading' }
  | { status: 'prompt'; error?: string }
  | { status: 'validating' }
  | { status: 'authenticated'; user: GitHubUser };

interface PrsViewProps {
  /** Repo resolvido do cwd; sua identidade decide se há `owner/name` p/ listar. */
  repo: ResolvedRepo;
  /** Avisa o shell quando a view captura digitação (p/ desligar atalhos globais). */
  onCapturingChange: (capturing: boolean) => void;
  /** Abre a review de uma PR (roteamento mora no `app.tsx`). */
  onOpenPr: (number: number) => void;
}

export function PrsView({ repo, onCapturingChange, onOpenPr }: PrsViewProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [value, setValue] = useState('');
  // A lista também captura digitação (busca textual): some os atalhos globais.
  const [listCapturing, setListCapturing] = useState(false);

  // Ao entrar na aba: retoma a sessão a partir do PAT persistido (revalidando).
  useEffect(() => {
    let cancelled = false;
    authenticatedUser()
      .then((user) => {
        if (cancelled) return;
        setState(user ? { status: 'authenticated', user } : { status: 'prompt' });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'prompt', error: message(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Enquanto digitamos o PAT (ou a busca da lista), 'q' não pode encerrar.
  const capturing = state.status === 'prompt' || listCapturing;
  useEffect(() => {
    onCapturingChange(capturing);
    return () => onCapturingChange(false);
  }, [capturing, onCapturingChange]);

  function submit(raw: string) {
    setValue('');
    setState({ status: 'validating' });
    setToken(raw)
      .then((user) => setState({ status: 'authenticated', user }))
      .catch((err: unknown) => setState({ status: 'prompt', error: message(err) }));
  }

  // Estado autenticado: trocar (novo PAT) ou limpar o PAT — aqui, sem Settings global.
  useInput(
    (input) => {
      if (input === 'c') {
        setValue('');
        setState({ status: 'prompt' });
      } else if (input === 'x') {
        clearToken()
          .then(() => setState({ status: 'prompt' }))
          .catch((err: unknown) => setState({ status: 'prompt', error: message(err) }));
      }
    },
    { isActive: state.status === 'authenticated' },
  );

  if (state.status === 'loading') {
    return <Text dimColor>verificando credencial…</Text>;
  }

  if (state.status === 'validating') {
    return <Text dimColor>validando PAT no GitHub…</Text>;
  }

  if (state.status === 'authenticated') {
    return (
      <Box flexDirection="column">
        <Text color="green">✓ autenticado como {state.user.login}</Text>
        <Text dimColor>[c] trocar PAT · [x] limpar PAT</Text>
        {repo.identity.kind === 'github' ? (
          <Box marginTop={1}>
            <PrList
              repo={repo}
              onCapturingChange={setListCapturing}
              onOpenPr={onOpenPr}
              onReauth={(reason) => setState({ status: 'prompt', error: reason })}
            />
          </Box>
        ) : (
          <Text color="yellow">owner/name não resolvido — repo local-only.</Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>
        Cole um Personal Access Token do GitHub (escopo mínimo: <Text bold>repo</Text>).
      </Text>
      <Box>
        <Text>PAT: </Text>
        <TextInput value={value} onChange={setValue} onSubmit={submit} mask="*" />
      </Box>
      {state.error ? <Text color="red">erro: {state.error}</Text> : null}
    </Box>
  );
}

/**
 * Lista de PRs abertas com cache e frescor (issue #4 + #9 + #10). Máquina de estados
 * sobre o cache do `conf` (`readCache`) + `revalidate` (stale-while-revalidate):
 * `readCache` pinta a lista na hora; `revalidate` traz o fresco em segundo plano;
 * `[r]` força a revalidação. Montada só com identidade GitHub — o repo local-only é
 * barrado pela `PrsView`. Erros viram variantes tipadas (#8): PAT inválido devolve ao
 * prompt (Settings) via `onReauth`, sem rede oferece retry, rate limit mostra o reset.
 */
type ListState =
  | { status: 'loading' }
  | { status: 'revalidating'; prs: PullRequest[]; fetchedAt: string }
  | { status: 'ready'; prs: PullRequest[]; fetchedAt: string }
  | { status: 'empty'; fetchedAt: string | null }
  // PAT inválido nunca fica retido aqui — vai pro prompt (Settings) via `onReauth`.
  | { status: 'error'; error: Exclude<GitHubError, { kind: 'invalid-pat' }> };

function PrList({
  repo,
  onCapturingChange,
  onOpenPr,
  onReauth,
}: {
  repo: ResolvedRepo;
  onCapturingChange: (capturing: boolean) => void;
  onOpenPr: (number: number) => void;
  onReauth: (reason: string) => void;
}) {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  // Filtros lembrados por repo (issue #10): restaura na montagem, persiste ao mudar.
  const [filters, setFilters] = useState<PrFilters>(() => readFilters(repo) ?? NO_FILTERS);
  // Modo de busca textual: enquanto ativo, captura digitação (some 'q'/'r'/atalhos).
  const [searching, setSearching] = useState(false);
  // Cursor da lista visível (issue #5): navega e abre a review com [enter].
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    onCapturingChange(searching);
    return () => onCapturingChange(false);
  }, [searching, onCapturingChange]);

  // Toda mudança de filtro persiste no conf por repo, via serviço.
  function updateFilters(next: PrFilters) {
    setFilters(next);
    writeFilters(repo, next);
  }

  useEffect(() => {
    let cancelled = false;
    setCursor(0);
    // Abertura instantânea: pinta o cache (se houver) e revalida em 2º plano.
    const cached = readCache(repo);
    setState(
      cached
        ? { status: 'revalidating', prs: cached.prs, fetchedAt: cached.fetchedAt }
        : { status: 'loading' },
    );
    revalidate(repo)
      .then((fresh) => {
        if (cancelled) return;
        setState(
          fresh.prs.length === 0
            ? { status: 'empty', fetchedAt: fresh.fetchedAt }
            : { status: 'ready', prs: fresh.prs, fetchedAt: fresh.fetchedAt },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = classifyGitHubError(err);
        // PAT revogado/expirado: volta ao prompt da aba (Settings) p/ recolar.
        if (error.kind === 'invalid-pat') onReauth('PAT inválido ou expirado — recole o token.');
        else setState({ status: 'error', error });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, nonce, onReauth]);

  // PRs disponíveis p/ derivar as opções de ciclagem (base/autor presentes).
  const prs = state.status === 'ready' || state.status === 'revalidating' ? state.prs : [];
  const baseBranches = [...new Set(prs.map((p) => p.baseBranch))].sort();
  const authors = [...new Set(prs.map((p) => p.author))].sort();
  // Lista efetivamente exibida (após filtros): o cursor e o [enter] indexam ESTA.
  const visible = applyFilters(prs, filters);

  // [d/b/a/] alternam os filtros; [/] entra na busca textual. Inativos na busca.
  useInput(
    (input) => {
      if (input === 'd') updateFilters({ ...filters, hideDrafts: !filters.hideDrafts });
      else if (input === 'b') updateFilters({ ...filters, baseBranch: cycle(filters.baseBranch, baseBranches) });
      else if (input === 'a') updateFilters({ ...filters, author: cycle(filters.author, authors) });
      else if (input === '/') setSearching(true);
    },
    { isActive: !searching && prs.length > 0 },
  );

  // [esc] cancela a busca textual (mantém o que já filtrou ao vivo).
  useInput((_, key) => {
    if (key.escape) setSearching(false);
  }, { isActive: searching });

  // [r] revalida; [↑/↓] move o cursor na lista visível; [enter] abre a review.
  useInput(
    (input, key) => {
      if (input === 'r') {
        setNonce((n) => n + 1);
        return;
      }
      if (key.downArrow) setCursor((c) => Math.min(c + 1, Math.max(visible.length - 1, 0)));
      else if (key.upArrow) setCursor((c) => Math.max(c - 1, 0));
      else if (key.return && visible.length > 0) {
        onOpenPr(visible[Math.min(cursor, visible.length - 1)].number);
      }
    },
    { isActive: state.status !== 'loading' && !searching },
  );

  if (state.status === 'loading') {
    return <Text dimColor>carregando PRs abertas…</Text>;
  }

  if (state.status === 'error') {
    const error = state.error;
    if (error.kind === 'rate-limit') {
      return (
        <Box flexDirection="column">
          <Text color="red">rate limit do GitHub — reseta às {resetLabel(error.resetAt)}.</Text>
          <Text dimColor>[r] atualizar</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Text color="red">
          {error.kind === 'network' ? 'sem rede — falha ao listar PRs.' : `erro: ${error.message}`}
        </Text>
        <Text dimColor>[r] tentar de novo</Text>
      </Box>
    );
  }

  if (state.status === 'empty') {
    return (
      <Box flexDirection="column">
        <Text dimColor>nenhuma PR aberta.</Text>
        <FreshnessLine fetchedAt={state.fetchedAt} revalidating={false} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <FilterBar
        filters={filters}
        searching={searching}
        onQueryChange={(query) => setFilters({ ...filters, query })}
        onQuerySubmit={(query) => {
          updateFilters({ ...filters, query });
          setSearching(false);
        }}
      />
      {visible.length === 0 ? (
        <Text dimColor>nenhuma PR com os filtros atuais.</Text>
      ) : (
        visible.map((pr, i) => {
          const here = i === cursor;
          return (
            <Text key={pr.number} color={here ? 'green' : undefined} wrap="truncate-end">
              {here ? '› ' : '  '}
              <Text color="yellow">#{pr.number}</Text> {pr.title}{' '}
              {pr.draft ? <Text color="magenta">[draft] </Text> : null}
              <Text dimColor>· @{pr.author} · {pr.branch} → {pr.baseBranch} · </Text>
              <Text color="green">+{pr.additions}</Text>
              <Text dimColor>/</Text>
              <Text color="red">-{pr.deletions}</Text>
              <Text dimColor> · {pr.updatedAt.slice(0, 10)}</Text>
            </Text>
          );
        })
      )}
      <FreshnessLine
        fetchedAt={state.fetchedAt}
        revalidating={state.status === 'revalidating'}
      />
      <Text dimColor>[↑/↓] navegar · [enter] abrir</Text>
    </Box>
  );
}

/** Próximo valor do ciclo `null → opções… → null` (filtro de base/autor). */
function cycle(current: string | null, options: string[]): string | null {
  if (options.length === 0) return null;
  if (current === null) return options[0] ?? null;
  const i = options.indexOf(current);
  if (i === -1 || i === options.length - 1) return null;
  return options[i + 1] ?? null;
}

/**
 * Barra de filtros (issue #10): mostra o estado de cada eixo e suas teclas, e —
 * em modo busca — o campo de texto do título. A regra de filtragem não mora aqui
 * (é da função-coração `applyFilters`); a barra só reflete e edita o `PrFilters`.
 */
function FilterBar({
  filters,
  searching,
  onQueryChange,
  onQuerySubmit,
}: {
  filters: PrFilters;
  searching: boolean;
  onQueryChange: (query: string) => void;
  onQuerySubmit: (query: string) => void;
}) {
  const active = hasActiveFilter(filters);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>
        [d] drafts: {filters.hideDrafts ? 'ocultos' : 'todos'} · [b] base:{' '}
        {filters.baseBranch ?? 'todas'} · [a] autor: {filters.author ?? 'todos'} · [/]
        título: {filters.query.trim() || '—'}
        {active ? <Text color="cyan"> · filtros ativos</Text> : null}
      </Text>
      {searching ? (
        <Box>
          <Text>buscar título: </Text>
          <TextInput value={filters.query} onChange={onQueryChange} onSubmit={onQuerySubmit} />
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Rodapé de frescor: rótulo "atualizado há X" (regra no coração `freshness`),
 * marca de "revalidando…" enquanto o 2º plano roda, e a dica de refresh forçado.
 */
function FreshnessLine({
  fetchedAt,
  revalidating,
}: {
  fetchedAt: string | null;
  revalidating: boolean;
}) {
  const fresh = fetchedAt ? freshness(fetchedAt, new Date()) : null;
  return (
    <Text dimColor>
      {fresh ? (
        <Text color={fresh.stale ? 'yellow' : undefined} dimColor={!fresh.stale}>
          {fresh.label}
        </Text>
      ) : null}
      {fresh ? ' · ' : ''}
      {revalidating ? 'revalidando… · ' : ''}[r] atualizar
    </Text>
  );
}

function message(err: unknown): string {
  if (
    err !== null &&
    typeof err === 'object' &&
    'status' in err &&
    (err as { status?: number }).status === 401
  ) {
    return 'PAT inválido ou expirado (401).';
  }
  return err instanceof Error ? err.message : String(err);
}
