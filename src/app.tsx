import { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { ResolvedRepo } from './core/repo.js';
import { WorkingDiffView } from './views/working-diff.js';
import { PrsView } from './views/prs.js';
import { ReviewView } from './views/review.js';

type Tab = 'local' | 'prs';

export function App({ repo }: { repo: ResolvedRepo }) {
  const { exit } = useApp();
  const [tab, setTab] = useState<Tab>('local');
  const [capturing, setCapturing] = useState(false);
  // PR aberta para review (sub-tela da aba PRs); `null` = navegação por abas.
  const [openPr, setOpenPr] = useState<number | null>(null);

  useInput((input, key) => {
    // Na review, os atalhos globais (tab/q) ficam suspensos: a `ReviewView` trata
    // a própria navegação e o retorno ([esc]/[b]).
    if (openPr !== null) return;
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
        {openPr === null ? <Tabs active={tab} /> : <Text color="green">Review</Text>}
      </Box>
      {openPr === null ? (
        <Text dimColor>[tab] alterna aba{capturing ? '' : ' · [q] sair'}</Text>
      ) : null}

      <Box marginTop={1}>
        {openPr !== null ? (
          <ReviewView repo={repo} number={openPr} onBack={() => setOpenPr(null)} />
        ) : tab === 'local' ? (
          <WorkingDiffView repo={repo} />
        ) : (
          <PrsView repo={repo} onCapturingChange={setCapturing} onOpenPr={setOpenPr} />
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
