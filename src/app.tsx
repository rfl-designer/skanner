import { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import {
  applyProfileEdit,
  toggleProfile,
  type Profile,
  type ResolvedRepo,
} from './core/repo.js';
import { saveOverride } from './services/repo.js';
import { WorkingDiffView } from './views/working-diff.js';
import { PrsView } from './views/prs.js';
import { ReviewView } from './views/review.js';

type Tab = 'local' | 'prs';

/** Edição inline do `[m]` (issue #11): perfil já alternado + `modularBaseDir` em edição. */
type Editing = { profile: Profile; dir: string };

/**
 * Shell da TUI (fiação, sem regra de domínio): título, roteamento de abas e os
 * atalhos globais do modelo cwd-primeiro (ADR 0005) — `[tab]` Working diff ⇄ PRs,
 * `[r]` recarrega o Working diff, `[m]` alterna o perfil e edita o `modularBaseDir`
 * inline (persistido por path no `conf`), `[q]` sai, `?` abre a folha de atalhos.
 * O repo resolvido vive em estado local para o `[m]` refletir a correção na hora.
 */
export function App({ repo: initialRepo }: { repo: ResolvedRepo }) {
  const { exit } = useApp();
  const [repo, setRepo] = useState<ResolvedRepo>(initialRepo);
  const [tab, setTab] = useState<Tab>('local');
  const [capturing, setCapturing] = useState(false);
  // PR aberta para review (sub-tela da aba PRs); `null` = navegação por abas.
  const [openPr, setOpenPr] = useState<number | null>(null);
  // Geração do snapshot do Working diff; `[r]` incrementa e remonta a view.
  const [localNonce, setLocalNonce] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  /** `[m]`: alterna o perfil e abre a edição inline do `modularBaseDir`. */
  function startEdit() {
    setEditing({ profile: toggleProfile(repo.profile), dir: repo.modularBaseDir });
  }

  /** `[enter]` na edição: aplica a regra do núcleo, persiste por path e atualiza a UI. */
  function commitEdit(dir: string) {
    if (editing === null) return;
    const { override, repo: next } = applyProfileEdit(repo, { profile: editing.profile, modularBaseDir: dir });
    saveOverride(next.root, override);
    setRepo(next);
    setEditing(null);
  }

  useInput((input, key) => {
    // Na review, os atalhos globais ficam suspensos: a `ReviewView` trata a própria
    // navegação, o retorno ([esc]/[b]) e a sua folha de atalhos.
    if (openPr !== null) return;

    // Folha de atalhos global: `?` abre/fecha; enquanto aberta, só [esc] fecha.
    if (input === '?') {
      setShowHelp((h) => !h);
      return;
    }
    if (showHelp) {
      if (key.escape) setShowHelp(false);
      return;
    }

    // Edição do `[m]`: o `TextInput` captura a digitação; aqui só o cancelar.
    if (editing !== null) {
      if (key.escape) setEditing(null);
      return;
    }

    if (key.tab) {
      setTab((t) => (t === 'local' ? 'prs' : 'local'));
      return;
    }
    // `[m]`/`[r]` são contextuais à aba local (perfil e snapshot do Working diff).
    if (tab === 'local' && input === 'm') {
      startEdit();
      return;
    }
    if (tab === 'local' && input === 'r') {
      setLocalNonce((n) => n + 1);
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
      {openPr === null && tab === 'local' ? <ProfileLine repo={repo} editing={editing} onCommit={commitEdit} onChange={setEditing} /> : null}
      {openPr === null ? (
        <Text dimColor>{footer({ capturing, editing: editing !== null, tab })}</Text>
      ) : null}

      <Box marginTop={1}>
        {showHelp ? (
          <AppHelp />
        ) : openPr !== null ? (
          <ReviewView repo={repo} number={openPr} onBack={() => setOpenPr(null)} />
        ) : tab === 'local' ? (
          <WorkingDiffView key={localNonce} repo={repo} />
        ) : (
          <PrsView repo={repo} onCapturingChange={setCapturing} onOpenPr={setOpenPr} />
        )}
      </Box>
    </Box>
  );
}

/** Cabeçalho do perfil do repo: leitura, ou a edição inline do `[m]` (#11). */
function ProfileLine({
  repo,
  editing,
  onCommit,
  onChange,
}: {
  repo: ResolvedRepo;
  editing: Editing | null;
  onCommit: (dir: string) => void;
  onChange: (next: Editing) => void;
}) {
  if (editing === null) {
    return (
      <Text dimColor>
        perfil {repo.profile} · {repo.modularBaseDir}
      </Text>
    );
  }
  return (
    <Box>
      <Text dimColor>perfil </Text>
      <Text color="yellow">{editing.profile}</Text>
      <Text dimColor> · modularBaseDir: </Text>
      <TextInput value={editing.dir} onChange={(dir) => onChange({ ...editing, dir })} onSubmit={onCommit} />
    </Box>
  );
}

function footer({ capturing, editing, tab }: { capturing: boolean; editing: boolean; tab: Tab }): string {
  if (editing) return '[enter] salva · [esc] cancela';
  if (capturing) return '[tab] alterna aba · [?] atalhos';
  const local = tab === 'local' ? ' · [r] recarregar · [m] perfil' : '';
  return `[tab] alterna aba${local} · [?] atalhos · [q] sair`;
}

/** Folha de atalhos global (`?`), AC 5 da issue #11. */
function AppHelp() {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Atalhos — Skanner
      </Text>
      <Shortcut keys="tab" desc="alterna Working diff ⇄ PRs" />
      <Shortcut keys="r" desc="recarrega o Working diff" />
      <Shortcut keys="m" desc="alterna perfil e edita o modularBaseDir" />
      <Shortcut keys="q" desc="sai do Skanner" />
      <Shortcut keys="?" desc="fecha esta ajuda" />
    </Box>
  );
}

/** Uma linha "tecla → ação" da folha de atalhos. */
function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <Text>
      <Text color="yellow">{keys.padEnd(6)}</Text>
      {desc}
    </Text>
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
