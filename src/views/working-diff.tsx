import { Box, Text } from 'ink';
import type { ResolvedRepo } from '../core/repo.js';

/**
 * Aba **Working diff** (modo local) — a tela inicial. Por ora mostra o repo já
 * resolvido do cwd (raiz, identidade, perfil); o change-set em fatia vertical
 * entra nas issues delas.
 */
export function WorkingDiffView({ repo }: { repo: ResolvedRepo }) {
  const origin =
    repo.identity.kind === 'github'
      ? `${repo.identity.owner}/${repo.identity.name}`
      : 'local-only';

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>repo </Text>
        <Text color="green">{repo.root}</Text>
      </Text>
      <Text dimColor>
        origin {origin} · perfil {repo.profile}
      </Text>
      <Box marginTop={1}>
        <Text dimColor>change-set em fatia vertical entra nas issues delas…</Text>
      </Box>
    </Box>
  );
}
