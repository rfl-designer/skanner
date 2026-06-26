import { useEffect, useState } from 'react';
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
import { detectedLayers } from '../core/local.js';
import { isOversized } from '../core/diff.js';
import type { ResolvedRepo } from '../core/repo.js';
import { FileDiff, basename } from './diff-render.js';

/**
 * Aba **Working diff** (modo local, CONTEXT.md §Modo local) — a tela inicial e o
 * uso primário. Lê o [change-set](CONTEXT.md) não-commitado (serviço `local.diff`,
 * via `simple-git`), delega o agrupamento ao núcleo (`groupReview`, que despacha
 * pelo perfil do repo) e renderiza a(s) camada(s) detectada(s) no topo +, abaixo, o
 * diff agrupado, reusando o render de diff compartilhado (`diff-render`). Read-only:
 * nada é escrito no repo (o serviço nunca toca o index). Recarrega ao montar — o
 * `[r]` global remonta a view (key={localNonce} no `app.tsx`); sem botão próprio.
 *
 * Máquina de estados: loading → (empty | error | ready). Sem regra de domínio
 * inline — síntese do untracked, status e camadas moram no núcleo; aqui só estado
 * e desenho. Sem checklist nem persistência (efêmero, fora de escopo v1, PRD §3).
 */
type LocalState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; review: GroupedReview; files: ChangedFile[]; layers: Layer[] };

export function WorkingDiffView({ repo }: { repo: ResolvedRepo }) {
  const [state, setState] = useState<LocalState>({ status: 'loading' });
  const [cursor, setCursor] = useState(0);
  // Arquivo gigante abre colapsado; [e] expande o atual (reseta ao trocar de arquivo).
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setCursor(0);
    setExpanded(false);
    local
      .diff(repo.root)
      .then((files) => {
        if (cancelled) return;
        if (files.length === 0) {
          setState({ status: 'empty' });
          return;
        }
        const review = groupReview(files, repo.profile);
        setState({ status: 'ready', review, files: flatten(review), layers: detectedLayers(files) });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  useInput((input, key) => {
    if (state.status !== 'ready') return;
    if (key.downArrow || input === 'j') {
      setCursor((c) => Math.min(c + 1, state.files.length - 1));
      setExpanded(false);
    } else if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(c - 1, 0));
      setExpanded(false);
    } else if (input === 'e') {
      const file = state.files[Math.min(cursor, state.files.length - 1)];
      if (isOversized(file.body)) setExpanded((e) => !e);
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
  return (
    <Box flexDirection="column">
      <Text>
        <Text color="yellow">{layerHeader(state.layers)}</Text>
        <Text dimColor> · arquivo {cursor + 1}/{state.files.length}</Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <LocalTree review={state.review} selectedPath={selected.path} />
        <Box flexDirection="column" flexShrink={1}>
          <Text>
            {selected.status.kind === 'renamed' ? (
              <Text dimColor>
                {selected.status.from} → {selected.path}
              </Text>
            ) : (
              <Text dimColor>{selected.path}</Text>
            )}
          </Text>
          <FileDiff file={selected} expanded={expanded} />
        </Box>
      </Box>
      <Text dimColor>[↑/↓] arquivo · [e] expandir · [r] recarregar</Text>
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
