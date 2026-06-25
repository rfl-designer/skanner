import { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { ResolvedRepo } from './core/repo.js';
import { WorkingDiffView } from './views/working-diff.js';
import { PrsView } from './views/prs.js';

type Tab = 'local' | 'prs';

export function App({ repo }: { repo: ResolvedRepo }) {
  const { exit } = useApp();
  const [tab, setTab] = useState<Tab>('local');
  const [capturing, setCapturing] = useState(false);

  useInput((input, key) => {
    if (key.tab) {
      setTab((t) => (t === 'local' ? 'prs' : 'local'));
      return;
    }
    // 'q' não encerra enquanto a aba PRs captura o PAT (senão viraria parte do token).
    if (!capturing && input === 'q') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color="cyan" bold>
          Skanner
        </Text>
        <Text>{'   '}</Text>
        <Tabs active={tab} />
      </Box>
      <Text dimColor>[tab] alterna aba{capturing ? '' : ' · [q] sair'}</Text>

      <Box marginTop={1}>
        {tab === 'local' ? (
          <WorkingDiffView repo={repo} />
        ) : (
          <PrsView onCapturingChange={setCapturing} />
        )}
      </Box>
    </Box>
  );
}

function Tabs({ active }: { active: Tab }) {
  return (
    <Box>
      <Text color={active === 'local' ? 'green' : undefined} bold={active === 'local'}>
        Working diff
      </Text>
      <Text dimColor>{'  |  '}</Text>
      <Text color={active === 'prs' ? 'green' : undefined} bold={active === 'prs'}>
        PRs
      </Text>
    </Box>
  );
}
