import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  authenticatedUser,
  clearToken,
  setToken,
  type GitHubUser,
} from '../services/auth.js';

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
  /** Avisa o shell quando a view captura digitação (p/ desligar atalhos globais). */
  onCapturingChange: (capturing: boolean) => void;
}

export function PrsView({ onCapturingChange }: PrsViewProps) {
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
