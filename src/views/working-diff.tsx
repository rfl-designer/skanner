import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import * as local from '../services/local.js';
import {
  groupReview,
  LAYER_LABEL,
  NO_CONTEXT_LABEL,
  type ChangedFile,
  type GroupedReview,
  type Layer,
  type LayerGroup,
} from '../core/review.js';
import { detectedLayers, preserveCursor } from '../core/local.js';
import { hunkStarts } from '../core/diff.js';
import type { ResolvedRepo } from '../core/repo.js';
import { FileDiff, useDiffViewport, basename } from './diff-render.js';

/**
 * Aba **Working diff** (modo local, CONTEXT.md §Modo local) — a tela inicial e o
 * uso primário. Lê o [change-set](CONTEXT.md) não-commitado (serviço `local.diff`,
 * via `simple-git`), delega o agrupamento ao núcleo (`groupReview`, que despacha
 * pelo perfil do repo) e renderiza a(s) camada(s) detectada(s) no topo +, abaixo, o
 * diff agrupado, reusando o render de diff compartilhado (`diff-render`). Read-only:
 * nada é escrito no repo (o serviço nunca toca o index). Recarrega ao montar e a
 * cada bump da prop `reload` (issue #37): `[r]` manual reseta ao topo; o auto-watch
 * preserva o cursor/expandido por caminho. Sem botão próprio.
 *
 * Máquina de estados: loading → (empty | error | ready). Sem regra de domínio
 * inline — síntese do untracked, status, camadas e a reseleção do cursor
 * (`preserveCursor`) moram no núcleo; aqui só estado e desenho. Sem checklist nem
 * persistência (efêmero, fora de escopo v1, PRD §3).
 */
type LocalState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; review: GroupedReview; files: ChangedFile[]; layers: Layer[] };

/**
 * Gatilho de reload vindo da fiação (`app.tsx`): `nonce` muda a cada pedido de
 * recarga; `preserve` distingue o auto-watch (preserva o cursor por caminho) do
 * `[r]` manual (reseta ao topo). Issue #37.
 */
export type Reload = { nonce: number; preserve: boolean };

/** Reload inicial (mount): sem preservação — o primeiro load abre no topo. */
const NO_RELOAD: Reload = { nonce: 0, preserve: false };

export function WorkingDiffView({ repo, reload = NO_RELOAD }: { repo: ResolvedRepo; reload?: Reload }) {
  const [state, setState] = useState<LocalState>({ status: 'loading' });
  const [cursor, setCursor] = useState(0);
  // Arquivo entra colapsado; [tab] desdobra/dobra o diff do atual (reseta ao trocar).
  // Acoplado ao foco: expandido ⟺ foco no diff ⟺ sidebar escondida (tela cheia p/ o diff).
  const [expanded, setExpanded] = useState(false);
  // Foco entre painéis: [l] vai ao diff (desdobra, esconde a sidebar), [h] volta (dobra).
  const [focus, setFocus] = useState<'sidebar' | 'diff'>('sidebar');
  // Bloco (hunk) em foco no diff; [j/k] caminha entre eles quando o foco é o diff.
  const [hunkIdx, setHunkIdx] = useState(0);
  const maxRows = useDiffViewport();

  // Seleção atual (caminho + índice + estado de leitura) num ref, para o reload
  // preservado do auto-watch reposicionar por caminho SEM refazer o efeito a cada navegação.
  const selection = useRef<{
    path: string | null;
    index: number;
    expanded: boolean;
    focus: 'sidebar' | 'diff';
    hunkIdx: number;
  }>({ path: null, index: 0, expanded: false, focus: 'sidebar', hunkIdx: 0 });
  selection.current = {
    path: state.status === 'ready' ? state.files[Math.min(cursor, state.files.length - 1)]?.path ?? null : null,
    index: cursor,
    expanded,
    focus,
    hunkIdx,
  };

  useEffect(() => {
    let cancelled = false;
    // Auto-watch preserva a seleção; [r] manual (preserve=false) abre no topo.
    const keep = reload.preserve ? selection.current : null;
    setState({ status: 'loading' });
    local
      .diff(repo.root)
      .then((files) => {
        if (cancelled) return;
        if (files.length === 0) {
          setCursor(0);
          setExpanded(false);
          setFocus('sidebar');
          setHunkIdx(0);
          setState({ status: 'empty' });
          return;
        }
        const review = groupReview(files, repo.profile);
        const flat = flatten(review);
        const nextCursor = keep ? preserveCursor(keep.path, keep.index, flat) : 0;
        // Mantém leitura/foco/bloco só se reaterrissou no MESMO arquivo; senão reseta.
        const samePath = keep !== null && flat[nextCursor]?.path === keep.path;
        setCursor(nextCursor);
        setExpanded(samePath ? keep.expanded : false);
        setFocus(samePath ? keep.focus : 'sidebar');
        setHunkIdx(samePath ? keep.hunkIdx : 0);
        setState({ status: 'ready', review, files: flat, layers: detectedLayers(files) });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, reload]);

  useInput((input, key) => {
    if (state.status !== 'ready') return;
    if (input === 'h') {
      setFocus('sidebar');
      setExpanded(false);
    } else if (input === 'l') {
      setFocus('diff');
      setExpanded(true);
    } else if (key.tab) {
      if (expanded) {
        setExpanded(false);
        setFocus('sidebar');
      } else {
        setExpanded(true);
        setFocus('diff');
      }
    } else if (focus === 'diff') {
      const sel = state.files[Math.min(cursor, state.files.length - 1)];
      const last = (sel.body.kind === 'patch' ? hunkStarts(sel.body.patch).length : 0) - 1;
      if (key.downArrow || input === 'j') setHunkIdx((h) => Math.min(h + 1, Math.max(0, last)));
      else if (key.upArrow || input === 'k') setHunkIdx((h) => Math.max(h - 1, 0));
    } else if (key.downArrow || input === 'j') {
      setCursor((c) => Math.min(c + 1, state.files.length - 1));
      setExpanded(false);
      setHunkIdx(0);
    } else if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(c - 1, 0));
      setExpanded(false);
      setHunkIdx(0);
    }
  });

  if (state.status === 'loading') {
    return <Text dimColor>lendo o diff local…</Text>;
  }

  if (state.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">não deu para ler o diff local: {state.message}</Text>
        <Text dimColor>[r] tentar de novo</Text>
      </Box>
    );
  }

  if (state.status === 'empty') {
    return <Text dimColor>nada para revisar — tudo commitado.</Text>;
  }

  const selected = state.files[Math.min(cursor, state.files.length - 1)];
  const hunks = selected.body.kind === 'patch' ? hunkStarts(selected.body.patch) : [];
  const safeHunk = Math.min(hunkIdx, Math.max(0, hunks.length - 1));
  const scrollTop = expanded && hunks.length > 0 ? hunks[safeHunk] : 0;
  const onDiff = focus === 'diff';
  return (
    <Box flexDirection="column">
      <Text>
        <Text color="yellow">{layerHeader(state.layers)}</Text>
        <Text dimColor> · arquivo {cursor + 1}/{state.files.length}</Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        {!expanded && <LocalTree review={state.review} selectedPath={selected.path} />}
        <Box flexDirection="column" flexShrink={1}>
          <Text>
            {selected.status.kind === 'renamed' ? (
              <Text color={onDiff ? 'cyan' : undefined} dimColor={!onDiff}>
                {selected.status.from} → {selected.path}
              </Text>
            ) : (
              <Text color={onDiff ? 'cyan' : undefined} dimColor={!onDiff}>
                {selected.path}
              </Text>
            )}
            {onDiff && hunks.length > 1 ? <Text dimColor> · bloco {safeHunk + 1}/{hunks.length}</Text> : null}
          </Text>
          <FileDiff file={selected} expanded={expanded} scrollTop={scrollTop} maxRows={maxRows} />
        </Box>
      </Box>
      <Text dimColor>
        {onDiff ? '[j/k] bloco · [h] sidebar · [tab] dobrar' : '[j/k] arquivo · [l] diff · [tab] expandir'}
      </Text>
    </Box>
  );
}

/** Rótulo do topo: a(s) camada(s) presentes no change-set (PRD §6, §7). */
function layerHeader(layers: Layer[]): string {
  const labels = layers.map((l) => LAYER_LABEL[l]);
  if (labels.length <= 1) return `Camada: ${labels[0] ?? '—'}`;
  return `Camadas: ${labels.join(', ')}`;
}

/**
 * Árvore de navegação do modo local: agrupada pela estratégia do perfil
 * (modular: Contexto → Camada → arquivo; flat: só Camada → arquivo), com o cursor
 * marcado. Sem checkbox/agregado — o checklist é do modo remoto (PRD §3).
 */
function LocalTree({ review, selectedPath }: { review: GroupedReview; selectedPath: string }) {
  if (review.profile === 'flat') {
    return (
      <Box flexDirection="column">
        <LayerList layers={review.layers} selectedPath={selectedPath} />
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {review.groups.map((group) => (
        <Box key={group.context ?? NO_CONTEXT_LABEL} flexDirection="column">
          <Text bold color="cyan">
            {group.context ?? NO_CONTEXT_LABEL}
          </Text>
          <LayerList layers={group.layers} selectedPath={selectedPath} />
        </Box>
      ))}
    </Box>
  );
}

/** Nível Camada → arquivo, compartilhado pelos perfis modular e flat. */
function LayerList({ layers, selectedPath }: { layers: LayerGroup[]; selectedPath: string }) {
  return (
    <>
      {layers.map((layer) => (
        <Box key={layer.layer} flexDirection="column">
          <Text dimColor> {LAYER_LABEL[layer.layer]}</Text>
          {layer.files.map((file) => {
            const here = file.path === selectedPath;
            return (
              <Text key={file.path} color={here ? 'green' : undefined}>
                {here ? ' › ' : '   '}
                {basename(file.path)}
              </Text>
            );
          })}
        </Box>
      ))}
    </>
  );
}

function flatten(review: GroupedReview): ChangedFile[] {
  const layers = review.profile === 'flat' ? review.layers : review.groups.flatMap((g) => g.layers);
  return layers.flatMap((l) => l.files);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
