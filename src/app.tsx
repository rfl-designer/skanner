import { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { getRepoRoot } from './services/repo.js';

export function App() {
  const { exit } = useApp();
  const [root, setRoot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((input) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (input === 'g') {
      getRepoRoot()
        .then((path) => {
          setError(null);
          setRoot(path);
        })
        .catch((err: unknown) => {
          setRoot(null);
          setError(err instanceof Error ? err.message : String(err));
        });
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="cyan" bold>
        Skanner — esqueleto andante
      </Text>
      <Text dimColor>[g] resolver raiz do repo · [q] sair</Text>

      <Box marginTop={1}>
        {root !== null ? (
          <Text color="green">raiz: {root}</Text>
        ) : error !== null ? (
          <Text color="red">erro: {error}</Text>
        ) : (
          <Text dimColor>aperte [g] para chamar o serviço Node…</Text>
        )}
      </Box>
    </Box>
  );
}
