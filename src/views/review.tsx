import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { diff } from '../services/pr.js';
import * as review from '../services/review.js';
import {
  groupReview,
  groupStarts,
  jumpGroup,
  LAYER_LABEL,
  NO_CONTEXT_LABEL,
  type ChangedFile,
  type GroupedReview,
  type LayerGroup,
} from '../core/review.js';
import { checkedRecord, checkedSet, prKey, progressOf } from '../core/checklist.js';
import { badgesFor, hunkStarts, hunkAt, maxScrollTop, nextHunkStart, prevHunkStart } from '../core/diff.js';
import { classifyGitHubError, resetLabel, type GitHubError } from '../core/github-error.js';
import type { ResolvedRepo } from '../core/repo.js';
import { FileDiff, Pane, useDiffViewport, basename } from './diff-render.js';
import { theme, CURSOR, NO_CURSOR, CHECK, NO_CHECK } from '../theme.js';

/**
 * Tela **Review da PR** (modo remoto, PRD §6.3). Abre uma PR como fatia vertical:
 * busca o diff (serviço `pr.diff`), delega o agrupamento ao núcleo (`groupReview`,
 * que despacha pelo perfil do repo) e renderiza a árvore Contexto → Camada → arquivo
 * (modular) ou só Camada → arquivo (flat, sem o nível de grupo) + o diff unified do
 * arquivo selecionado (render próprio em Ink + highlight via `cli-highlight`).
 * Navegação básica próximo/anterior (atalhos ricos são da #11).
 *
 * Máquina de estados: loading → (empty | error | ready). Sem regra de domínio
 * inline — categorização, árvore, badge/colapso (#8) e o agregado do checklist (#7)
 * moram no núcleo; aqui só estado e desenho. O checklist carrega do `conf` ao abrir a
 * PR (serviço `review.getState`) e persiste a cada `[espaço]` (`review.setState`); o
 * agregado revisado/total por camada/contexto vem do núcleo (`progressOf`). Os
 * estados de erro são variantes tipadas (`GitHubError`), não strings.
 */
type ReviewState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; error: GitHubError }
  | { status: 'ready'; review: GroupedReview; files: ChangedFile[] };

interface ReviewViewProps {
  repo: ResolvedRepo;
  number: number;
  /** Volta para a lista de PRs (`[esc]`/`[b]`). */
  onBack: () => void;
}

export function ReviewView({ repo, number, onBack }: ReviewViewProps) {
  const [state, setState] = useState<ReviewState>({ status: 'loading' });
  const [cursor, setCursor] = useState(0);
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  // Arquivo entra colapsado; [tab] desdobra/dobra o diff do atual (reseta ao trocar).
  // Acoplado ao foco: expandido ⟺ foco no diff ⟺ sidebar escondida (tela cheia p/ o diff).
  const [expanded, setExpanded] = useState(false);
  // Foco entre painéis: [l] vai ao diff (desdobra, esconde a sidebar), [h] volta (dobra).
  const [focus, setFocus] = useState<'sidebar' | 'diff'>('sidebar');
  // Linha do topo do viewport do diff: [j/k] rolam linha-a-linha, [J/K] saltam de hunk.
  const [scrollTop, setScrollTop] = useState(0);
  const maxRows = useDiffViewport();
  // [r] refaz a busca após erro recuperável (sem rede / falha genérica).
  const [nonce, setNonce] = useState(0);
  // Folha de atalhos (?) sobreposta (#11).
  const [showHelp, setShowHelp] = useState(false);

  // Chave repo+PR do checklist; `null` em repo local-only (sem PR a persistir).
  const key = prKey(repo, number);

  // Carrega o checklist persistido ao abrir/reabrir a PR (PRD §6.3).
  useEffect(() => {
    setChecked(key === null ? new Set() : checkedSet(review.getState(key)));
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setCursor(0);
    setExpanded(false);
    setFocus('sidebar');
    setScrollTop(0);
    diff(repo, number)
      .then((pr) => {
        if (cancelled) return;
        if (pr.files.length === 0) {
          setState({ status: 'empty' });
          return;
        }
        const grouped = groupReview(pr.files, repo.profile);
        const files = flatten(grouped);
        setState({ status: 'ready', review: grouped, files });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', error: classifyGitHubError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, number, nonce]);

  /** Alterna "revisado" no arquivo sob o cursor e persiste no `conf` (#7). */
  function toggleReviewed() {
    if (state.status !== 'ready' || key === null) return;
    const path = state.files[Math.min(cursor, state.files.length - 1)].path;
    const next = new Set(checked);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setChecked(next);
    review.setState(key, { checked: checkedRecord(next), updatedAt: new Date().toISOString() });
  }

  // Fronteiras de grupo (1º arquivo de cada grupo) p/ a navegação por grupo (#11).
  const starts = state.status === 'ready' ? groupStarts(state.review) : [];

  useInput((input, inputKey) => {
    if (input === '?') {
      setShowHelp((h) => !h);
      return;
    }
    if (showHelp) {
      if (inputKey.escape) setShowHelp(false);
      return;
    }
    if (inputKey.escape || input === 'b') {
      onBack();
      return;
    }
    if (state.status === 'error') {
      if (input === 'r' && canRetry(state.error)) setNonce((n) => n + 1);
      return;
    }
    if (state.status !== 'ready') return;
    if (input === ' ') {
      toggleReviewed();
    } else if (input === 'h') {
      setFocus('sidebar');
      setExpanded(false);
    } else if (input === 'l') {
      setFocus('diff');
      setExpanded(true);
    } else if (inputKey.tab) {
      if (expanded) {
        setExpanded(false);
        setFocus('sidebar');
      } else {
        setExpanded(true);
        setFocus('diff');
      }
    } else if (focus === 'diff') {
      const sel = state.files[Math.min(cursor, state.files.length - 1)];
      if (sel.body.kind === 'patch') {
        const ceil = maxScrollTop(sel.body.patch.split('\n').length, maxRows);
        const hunkLines = hunkStarts(sel.body.patch);
        if (input === 'J') setScrollTop(Math.min(nextHunkStart(hunkLines, scrollTop), ceil));
        else if (input === 'K') setScrollTop(prevHunkStart(hunkLines, scrollTop));
        else if (inputKey.downArrow || input === 'j' || input === 'n') setScrollTop((s) => Math.min(s + 1, ceil));
        else if (inputKey.upArrow || input === 'k' || input === 'p') setScrollTop((s) => Math.max(s - 1, 0));
      }
    } else if (inputKey.downArrow || input === 'j' || input === 'n') {
      setCursor((c) => Math.min(c + 1, state.files.length - 1));
      setExpanded(false);
      setScrollTop(0);
    } else if (inputKey.upArrow || input === 'k' || input === 'p') {
      setCursor((c) => Math.max(c - 1, 0));
      setExpanded(false);
      setScrollTop(0);
    } else if (input === ']') {
      setCursor((c) => jumpGroup(starts, c, 'next'));
      setExpanded(false);
      setScrollTop(0);
    } else if (input === '[') {
      setCursor((c) => jumpGroup(starts, c, 'prev'));
      setExpanded(false);
      setScrollTop(0);
    }
  });

  if (showHelp) return <HelpSheet />;

  if (state.status === 'loading') {
    return <Text dimColor>carregando diff da PR #{number}…</Text>;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  if (state.status === 'empty') {
    return (
      <Box flexDirection="column">
        <Text dimColor>PR #{number} sem arquivos.</Text>
        <Text dimColor>[esc] voltar</Text>
      </Box>
    );
  }

  const selected = state.files[Math.min(cursor, state.files.length - 1)];
  const overall = progressOf(allLayers(state.review), checked);
  const badges = badgesFor(selected);
  const hunks = selected.body.kind === 'patch' ? hunkStarts(selected.body.patch) : [];
  const totalLines = selected.body.kind === 'patch' ? selected.body.patch.split('\n').length : 0;
  const safeScroll = expanded ? Math.min(scrollTop, maxScrollTop(totalLines, maxRows)) : 0;
  const safeHunk = hunkAt(hunks, safeScroll);
  const onDiff = focus === 'diff';
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text color={theme.key} bold>
          PR #{number}
        </Text>
        <Text dimColor> · arquivo {cursor + 1}/{state.files.length}</Text>
        <Text dimColor> · revisados {overall.reviewed}/{overall.total}</Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={1}>
        {!expanded && (
          <Pane focused={!onDiff}>
            <Tree review={state.review} checked={checked} selectedPath={selected.path} />
          </Pane>
        )}
        <Pane focused={onDiff} grow>
          <Text wrap="truncate-start">
            {selected.status.kind === 'renamed' ? (
              <Text color={onDiff ? theme.accent : undefined} dimColor={!onDiff}>
                {selected.status.from} → {selected.path}
              </Text>
            ) : (
              <Text color={onDiff ? theme.accent : undefined} dimColor={!onDiff}>
                {selected.path}
              </Text>
            )}
            {badges.map((b) => (
              <Text key={b} color={theme.badge}>
                {' '}
                [{b}]
              </Text>
            ))}
            {onDiff && hunks.length > 1 ? <Text dimColor> · bloco {safeHunk + 1}/{hunks.length}</Text> : null}
          </Text>
          <FileDiff file={selected} expanded={expanded} scrollTop={safeScroll} maxRows={maxRows} />
        </Pane>
      </Box>
      <Text dimColor wrap="truncate-end">
        {onDiff
          ? '[j/k] rolar · [J/K] bloco · [h] sidebar · [espaço] revisado · [tab] dobrar · [?] ajuda · [esc] voltar'
          : '[j/k] arquivo · ]/[ grupo · [l] diff · [espaço] revisado · [tab] expandir · [?] ajuda · [esc] voltar'}
      </Text>
    </Box>
  );
}

/** Estado de erro como máquina de variantes (PRD §6.5): cada `kind` rende sua saída. */
function ErrorState({ error }: { error: GitHubError }) {
  switch (error.kind) {
    case 'invalid-pat':
      return (
        <Box flexDirection="column">
          <Text color={theme.error}>PAT inválido ou expirado.</Text>
          <Text dimColor>volte à aba PRs ([esc]) para recolar o token (Settings).</Text>
          <Text dimColor>[esc] voltar</Text>
        </Box>
      );
    case 'network':
      return (
        <Box flexDirection="column">
          <Text color={theme.error}>sem rede — não deu para buscar o diff.</Text>
          <Text dimColor>[r] tentar de novo · [esc] voltar</Text>
        </Box>
      );
    case 'rate-limit':
      return (
        <Box flexDirection="column">
          <Text color={theme.error}>rate limit do GitHub — reseta às {resetLabel(error.resetAt)}.</Text>
          <Text dimColor>[esc] voltar</Text>
        </Box>
      );
    case 'unknown':
      return (
        <Box flexDirection="column">
          <Text color={theme.error}>erro: {error.message}</Text>
          <Text dimColor>[r] tentar de novo · [esc] voltar</Text>
        </Box>
      );
  }
}

/** Só erros recuperáveis oferecem retry; rate limit não entra em loop, PAT inválido vai a Settings. */
function canRetry(error: GitHubError): boolean {
  return error.kind === 'network' || error.kind === 'unknown';
}

/** Folha de atalhos da review (`?`), AC 5 da issue #11. */
function HelpSheet() {
  return (
    <Box flexDirection="column">
      <Text {...theme.brand}>Atalhos — Review</Text>
      <Shortcut keys="↑/↓ j/k" desc="arquivo anterior/próximo (sidebar) · rolar linha (diff)" />
      <Shortcut keys="J/K" desc="bloco anterior/próximo (diff)" />
      <Shortcut keys="l / h" desc="entra no diff (desdobra) / volta à sidebar" />
      <Shortcut keys="] / [" desc="grupo próximo/anterior" />
      <Shortcut keys="espaço" desc="marca/desmarca revisado" />
      <Shortcut keys="tab" desc="desdobra/dobra o diff" />
      <Shortcut keys="esc / b" desc="voltar para a lista" />
      <Shortcut keys="?" desc="fecha esta ajuda" />
    </Box>
  );
}

/** Uma linha "tecla → ação" da folha de atalhos. */
function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <Text>
      <Text color={theme.key}>{keys.padEnd(10)}</Text>
      {desc}
    </Text>
  );
}

/**
 * Árvore de navegação com o cursor marcado, o ✓ no arquivo revisado e o agregado
 * revisado/total por contexto e por camada (#7). Modular: Contexto → Camada →
 * arquivo. Flat: só Camada → arquivo, SEM o cabeçalho de grupo (PRD §4.0
 * estratégia 3). As contagens vêm do núcleo (`progressOf`), por nó.
 */
function Tree({
  review,
  checked,
  selectedPath,
}: {
  review: GroupedReview;
  checked: ReadonlySet<string>;
  selectedPath: string;
}) {
  if (review.profile === 'flat') {
    return (
      <Box flexDirection="column">
        <LayerList layers={review.layers} checked={checked} selectedPath={selectedPath} />
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {review.groups.map((group) => {
        const ctx = progressOf(group.layers, checked);
        return (
          <Box key={group.context ?? NO_CONTEXT_LABEL} flexDirection="column">
            <Text {...theme.context}>
              {group.context ?? NO_CONTEXT_LABEL} ({ctx.reviewed}/{ctx.total})
            </Text>
            <LayerList layers={group.layers} checked={checked} selectedPath={selectedPath} />
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Nível Camada → arquivo, compartilhado pelos perfis modular e flat. Mostra o
 * agregado revisado/total da camada e o ✓ no arquivo revisado (#7).
 */
function LayerList({
  layers,
  checked,
  selectedPath,
}: {
  layers: LayerGroup[];
  checked: ReadonlySet<string>;
  selectedPath: string;
}) {
  return (
    <>
      {layers.map((layer) => {
        const lp = progressOf([layer], checked);
        return (
          <Box key={layer.layer} flexDirection="column">
            <Text {...theme.layer}>
              {' '}
              {LAYER_LABEL[layer.layer]} ({lp.reviewed}/{lp.total})
            </Text>
            {layer.files.map((file) => {
              const here = file.path === selectedPath;
              const done = checked.has(file.path);
              return (
                <Text key={file.path} {...(here ? theme.selected : {})} wrap="truncate-end">
                  {here ? CURSOR : NO_CURSOR}
                  {done ? CHECK : NO_CHECK}
                  {basename(file.path)}
                </Text>
              );
            })}
          </Box>
        );
      })}
    </>
  );
}

function flatten(review: GroupedReview): ChangedFile[] {
  return allLayers(review).flatMap((l) => l.files);
}

/** Camadas da review, achatadas (flat: diretas; modular: de todos os contextos). */
function allLayers(review: GroupedReview): LayerGroup[] {
  return review.profile === 'flat' ? review.layers : review.groups.flatMap((g) => g.layers);
}
