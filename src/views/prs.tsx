import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  authenticatedUser,
  clearToken,
  setToken,
  type GitHubUser,
} from '../services/auth.js';
import { list, type PullRequest } from '../services/prs.js';
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
 * Lista de PRs abertas (issue #4). Máquina de estados própria sobre `prs.list`:
 * loading → (empty | ready | error). `[r]` refaz a busca. Montada só quando há
 * identidade GitHub — o repo local-only é barrado pela `PrsView`.
 */
type ListState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; prs: PullRequest[] }
  | { status: 'error'; error: string };

function PrList({ repo }: { repo: ResolvedRepo }) {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    list(repo)
      .then((prs) => {
        if (cancelled) return;
        setState(prs.length === 0 ? { status: 'empty' } : { status: 'ready', prs });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', error: message(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, nonce]);

  // [r] recarrega a lista (refaz a busca), exceto enquanto já carrega.
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
        <Text dimColor>[r] atualizar</Text>
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
      <Text dimColor>[r] atualizar</Text>
    </Box>
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
