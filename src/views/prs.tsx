import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  authenticatedUser,
  clearToken,
  setToken,
  type GitHubUser,
} from '../services/auth.js';
import { readCache, revalidate, type PullRequest } from '../services/prs.js';
import { freshness } from '../core/freshness.js';
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
}

export function PrsView({ repo, onCapturingChange }: PrsViewProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [value, setValue] = useState('');

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

  // Enquanto digitamos o PAT, o shell precisa parar de tratar 'q' como "sair".
  const capturing = state.status === 'prompt';
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
            <PrList repo={repo} />
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
 * Lista de PRs abertas com cache e frescor (issue #4 + #9). Máquina de estados
 * sobre o cache do `conf` (`readCache`) + `revalidate` (stale-while-revalidate):
 * `readCache` pinta a lista na hora; `revalidate` traz o fresco em segundo plano.
 * `[r]` força a revalidação. Montada só com identidade GitHub — o repo local-only
 * é barrado pela `PrsView`.
 */
type ListState =
  | { status: 'loading' }
  | { status: 'revalidating'; prs: PullRequest[]; fetchedAt: string }
  | { status: 'ready'; prs: PullRequest[]; fetchedAt: string }
  | { status: 'empty'; fetchedAt: string | null }
  | { status: 'error'; error: string };

function PrList({ repo }: { repo: ResolvedRepo }) {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
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
        if (!cancelled) setState({ status: 'error', error: message(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, nonce]);

  // [r] força a revalidação, exceto enquanto a primeira carga ainda roda.
  useInput((input) => {
    if (input === 'r') setNonce((n) => n + 1);
  }, { isActive: state.status !== 'loading' });

  if (state.status === 'loading') {
    return <Text dimColor>carregando PRs abertas…</Text>;
  }

  if (state.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">erro: {state.error}</Text>
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
      {state.prs.map((pr) => (
        <Text key={pr.number}>
          <Text color="yellow">#{pr.number}</Text> {pr.title}{' '}
          <Text dimColor>· @{pr.author} · {pr.branch} · </Text>
          <Text color="green">+{pr.additions}</Text>
          <Text dimColor>/</Text>
          <Text color="red">-{pr.deletions}</Text>
          <Text dimColor> · {pr.updatedAt.slice(0, 10)}</Text>
        </Text>
      ))}
      <FreshnessLine
        fetchedAt={state.fetchedAt}
        revalidating={state.status === 'revalidating'}
      />
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
