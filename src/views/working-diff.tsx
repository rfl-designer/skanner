import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { getRepoRoot } from '../services/repo.js';

/**
 * Aba **Working diff** (modo local) — por ora a semente do esqueleto andante:
 * `[g]` resolve a raiz do repo via serviço Node. O change-set em fatia vertical
 * entra nas issues delas.
 */
export function WorkingDiffView() {
  const [root, setRoot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((input) => {
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
    <Box flexDirection="column">
      <Text dimColor>[g] resolver raiz do repo</Text>
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
