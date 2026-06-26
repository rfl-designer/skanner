import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import * as local from '../services/local.js';
import { generate } from '../services/commit-message.js';
import { issueBody as fetchIssueBody } from '../services/issue.js';
import {
  groupReview,
  LAYER_LABEL,
  NO_CONTEXT_LABEL,
  type ChangedFile,
  type GroupedReview,
  type Layer,
  type LayerGroup,
} from '../core/review.js';
import {
  assembleMessage,
  buildPrompt,
  COMMIT_TYPES,
  parseIssueInput,
  pathsToReset,
  type CommitType,
  type IssueContext,
} from '../core/commit.js';
import { detectedLayers, preserveCursor } from '../core/local.js';
import { hunkStarts, hunkAt, isViewable, maxScrollTop, nextHunkStart, prevHunkStart } from '../core/diff.js';
import type { ResolvedRepo } from '../core/repo.js';
import { FileDiff, FileViewer, useDiffViewport, basename } from './diff-render.js';

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
 * Sub-fluxo do **portão de commit** (issue #47), sobreposto ao `ready`. `idle` é
 * navegação normal; `[c]` (com ≥1 marcado) entra em `type` → `issue` → `staging`
 * → `generating` → `preview`. `toReset` (capturado pós-stage) são só os paths que
 * o portão stageou — o que o cancelamento desfaz, nunca o pré-staged (#47).
 */
type Gate =
  | { phase: 'idle' }
  | { phase: 'type' }
  | { phase: 'issue'; type: CommitType }
  | { phase: 'generating'; toReset: string[] }
  | { phase: 'preview'; type: CommitType; issue: IssueContext; body: string; aiAssisted: boolean; toReset: string[]; error?: string }
  | { phase: 'editing'; type: CommitType; issue: IssueContext; aiAssisted: boolean; toReset: string[]; draft: string }
  | { phase: 'committing' };

/**
 * Sub-fluxo do **modal de arquivo completo** ([z], issue #53), sobreposto ao
 * `ready`. `closed` é navegação normal; `[z]` no diff de um arquivo exibível lê o
 * conteúdo da working tree (`loading` → `ready`). Erro de leitura volta a `closed`
 * (no-op silencioso). `esc` fecha; o diff por baixo fica intacto.
 */
type Viewer =
  | { phase: 'closed' }
  | { phase: 'loading' }
  | { phase: 'ready'; content: string; scrollTop: number };

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
  // Linha do topo do viewport do diff: [j/k] rolam linha-a-linha, [J/K] saltam de hunk.
  const [scrollTop, setScrollTop] = useState(0);
  // Arquivos marcados para o commit ([espaço]). Efêmero: NÃO persiste no conf
  // (diferente do checklist de PR) e zera a cada reload. Issue #46.
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set());
  // Sub-fluxo do portão de commit (#47) e o handle de abort do claude -p.
  const [gate, setGate] = useState<Gate>({ phase: 'idle' });
  const [issueInput, setIssueInput] = useState('');
  const gateAbort = useRef<AbortController | null>(null);
  // Reload interno disparado após um commit (some o que foi commitado).
  const [selfReload, setSelfReload] = useState(0);
  // Modal de arquivo completo ([z], #53). `viewerReq` ignora leituras obsoletas
  // (abre/fecha rápido) — só a leitura mais recente assenta o conteúdo.
  const [viewer, setViewer] = useState<Viewer>({ phase: 'closed' });
  const viewerReq = useRef(0);
  const maxRows = useDiffViewport();

  // Seleção atual (caminho + índice + estado de leitura) num ref, para o reload
  // preservado do auto-watch reposicionar por caminho SEM refazer o efeito a cada navegação.
  const selection = useRef<{
    path: string | null;
    index: number;
    expanded: boolean;
    focus: 'sidebar' | 'diff';
    scrollTop: number;
  }>({ path: null, index: 0, expanded: false, focus: 'sidebar', scrollTop: 0 });
  selection.current = {
    path: state.status === 'ready' ? state.files[Math.min(cursor, state.files.length - 1)]?.path ?? null : null,
    index: cursor,
    expanded,
    focus,
    scrollTop,
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
          setScrollTop(0);
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
        setScrollTop(samePath ? keep.scrollTop : 0);
        setMarked(new Set()); // marcação é efêmera: some ao recarregar (AC #46).
        setState({ status: 'ready', review, files: flat, layers: detectedLayers(files) });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, reload, selfReload]);

  /**
   * Abre o modal de arquivo completo ([z], #53) no `file` selecionado: no-op
   * silencioso se não for texto no disco (`isViewable`: binário/deletado/dir). Lê
   * a working tree a cada abertura (sem cache); erro de leitura (race) volta a
   * `closed`. `viewerReq` descarta leituras obsoletas.
   */
  function openViewer(file: ChangedFile) {
    if (!isViewable(file)) return;
    const id = ++viewerReq.current;
    setViewer({ phase: 'loading' });
    local
      .fileContent(repo.root, file.path)
      .then((content) => {
        if (viewerReq.current === id) setViewer({ phase: 'ready', content, scrollTop: 0 });
      })
      .catch(() => {
        if (viewerReq.current === id) setViewer({ phase: 'closed' });
      });
  }

  /** Marca/desmarca o arquivo sob o cursor para o commit. Sem persistência (#46). */
  function toggleMarked() {
    if (state.status !== 'ready') return;
    const path = state.files[Math.min(cursor, state.files.length - 1)].path;
    const next = new Set(marked);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setMarked(next);
  }

  /**
   * Inicia o portão: stage dos marcados (capturando o pré-staged p/ o reset
   * seguro), monta o prompt (diff staged + issue/intenção) e dispara o claude -p
   * abortável. Falha da IA degrada p/ o preview editável (#47).
   */
  async function runGate(type: CommitType, raw: string) {
    const issue = parseIssueInput(raw);
    const paths = [...marked];
    let toReset: string[] = [];
    try {
      const before = await local.stagedPaths(repo.root);
      await local.stage(repo.root, paths);
      toReset = pathsToReset(paths, before);
    } catch (err) {
      setGate({ phase: 'idle' });
      setState({ status: 'error', message: errorMessage(err) });
      return;
    }
    setGate({ phase: 'generating', toReset });

    const controller = new AbortController();
    gateAbort.current = controller;
    const stagedDiff = await local.stagedDiff(repo.root, paths);
    const body = issue.kind === 'issue' ? await fetchIssueBody(repo, issue.number) : null;
    const intent = issue.kind === 'intent' ? issue.text : null;
    const result = await generate({
      prompt: buildPrompt({ stagedDiff, issueBody: body, intent }),
      signal: controller.signal,
    });
    if (controller.signal.aborted) return; // cancelado no spinner: o cancelGate já reverteu.
    gateAbort.current = null;

    if (result.kind === 'ok') {
      setGate({ phase: 'preview', type, issue, body: result.message, aiAssisted: true, toReset });
    } else {
      // IA indisponível/lixo: cai no preview manual com o prefixo já montado (#47).
      setGate({ phase: 'preview', type, issue, body: '', aiAssisted: false, toReset });
    }
  }

  /** Cancela o portão: aborta o claude -p (se rodando) e desfaz só o que stageou. */
  async function cancelGate(toReset: string[]) {
    gateAbort.current?.abort();
    gateAbort.current = null;
    setGate({ phase: 'idle' });
    setIssueInput('');
    await local.unstage(repo.root, toReset);
  }

  /** Commita a mensagem montada; sucesso zera a marcação e recarrega. */
  async function doCommit(
    message: string,
    ctx: { type: CommitType; issue: IssueContext; body: string; aiAssisted: boolean; toReset: string[] },
  ) {
    setGate({ phase: 'committing' });
    try {
      await local.commit(repo.root, message);
    } catch (err) {
      // Hook barrou etc.: volta ao preview com o erro; o staging fica de pé.
      setGate({ phase: 'preview', ...ctx, error: errorMessage(err) });
      return;
    }
    setGate({ phase: 'idle' });
    setIssueInput('');
    setSelfReload((n) => n + 1); // recarrega: marcação zera no efeito, o commitado some.
  }

  /** Input do portão por fase. Os campos de texto (`issue`/`editing`) são do TextInput; aqui só esc/enter/seleção. */
  function handleGateInput(input: string, key: { escape: boolean; return: boolean }) {
    if (gate.phase === 'type') {
      if (key.escape) setGate({ phase: 'idle' });
      else {
        const idx = Number(input) - 1; // seleção 1-based por dígito
        if (Number.isInteger(idx) && idx >= 0 && idx < COMMIT_TYPES.length) {
          setIssueInput('');
          setGate({ phase: 'issue', type: COMMIT_TYPES[idx] });
        }
      }
      return;
    }
    if (gate.phase === 'issue') {
      if (key.escape) {
        setIssueInput('');
        setGate({ phase: 'idle' });
      }
      return; // chars + enter: TextInput (onSubmit dispara runGate).
    }
    if (gate.phase === 'generating') {
      if (key.escape) void cancelGate(gate.toReset);
      return;
    }
    if (gate.phase === 'preview') {
      const ctx = { type: gate.type, issue: gate.issue, body: gate.body, aiAssisted: gate.aiAssisted, toReset: gate.toReset };
      if (key.return && gate.body.trim().length > 0) {
        void doCommit(assembleMessage({ type: gate.type, issue: gate.issue, body: gate.body, aiAssisted: gate.aiAssisted }), ctx);
      } else if (input === 'e') {
        setGate({ phase: 'editing', type: gate.type, issue: gate.issue, aiAssisted: gate.aiAssisted, toReset: gate.toReset, draft: gate.body });
      } else if (key.escape) {
        void cancelGate(gate.toReset);
      }
      return;
    }
    if (gate.phase === 'editing') {
      if (key.escape)
        setGate({ phase: 'preview', type: gate.type, issue: gate.issue, body: gate.draft, aiAssisted: gate.aiAssisted, toReset: gate.toReset });
      return; // chars + enter: TextInput (onSubmit aplica o draft).
    }
    // committing: sem input enquanto o git roda.
  }

  useInput((input, key) => {
    // Modal de arquivo aberto: captura o input (commit/navegação suspensos). [esc]
    // fecha; [j/k]/setas rolam linha a linha, clampado pela última página (#53).
    if (viewer.phase !== 'closed') {
      if (key.escape) {
        setViewer({ phase: 'closed' });
      } else if (viewer.phase === 'ready') {
        const ceil = maxScrollTop(viewer.content.split('\n').length, maxRows);
        if (key.downArrow || input === 'j')
          setViewer((v) => (v.phase === 'ready' ? { ...v, scrollTop: Math.min(v.scrollTop + 1, ceil) } : v));
        else if (key.upArrow || input === 'k')
          setViewer((v) => (v.phase === 'ready' ? { ...v, scrollTop: Math.max(v.scrollTop - 1, 0) } : v));
      }
      return;
    }
    // Portão ativo: rota própria de input (o resto da navegação fica suspenso).
    if (gate.phase !== 'idle') {
      handleGateInput(input, key);
      return;
    }
    if (state.status !== 'ready') return;
    if (input === 'c' && marked.size > 0) {
      setGate({ phase: 'type' });
    } else if (input === ' ') {
      toggleMarked();
    } else if (input === 'h') {
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
      if (input === 'z') {
        openViewer(sel);
      } else if (sel.body.kind === 'patch') {
        const ceil = maxScrollTop(sel.body.patch.split('\n').length, maxRows);
        const starts = hunkStarts(sel.body.patch);
        if (input === 'J') setScrollTop(Math.min(nextHunkStart(starts, scrollTop), ceil));
        else if (input === 'K') setScrollTop(prevHunkStart(starts, scrollTop));
        else if (key.downArrow || input === 'j') setScrollTop((s) => Math.min(s + 1, ceil));
        else if (key.upArrow || input === 'k') setScrollTop((s) => Math.max(s - 1, 0));
      }
    } else if (key.downArrow || input === 'j') {
      setCursor((c) => Math.min(c + 1, state.files.length - 1));
      setExpanded(false);
      setScrollTop(0);
    } else if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(c - 1, 0));
      setExpanded(false);
      setScrollTop(0);
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

  // Modal de arquivo completo ([z], #53): substitui a tela enquanto aberto; ao
  // fechar, o Working diff volta como estava (cursor/expandido/scroll intactos).
  if (viewer.phase !== 'closed') {
    return (
      <FileViewer
        content={viewer.phase === 'ready' ? viewer.content : null}
        scrollTop={viewer.phase === 'ready' ? viewer.scrollTop : 0}
        maxRows={maxRows}
      />
    );
  }

  if (gate.phase !== 'idle') {
    return (
      <Box flexDirection="column">
        <Text bold color="cyan">
          Commit — {marked.size} arquivo(s) marcado(s)
        </Text>
        {gate.phase === 'type' && (
          <Box marginTop={1} flexDirection="column">
            <Text>Tipo do commit:</Text>
            {COMMIT_TYPES.map((t, i) => (
              <Text key={t}>
                <Text color="yellow">{`  ${i + 1}`}</Text> {t}
              </Text>
            ))}
            <Text dimColor>[1-{COMMIT_TYPES.length}] escolher · [esc] cancelar</Text>
          </Box>
        )}
        {gate.phase === 'issue' && (
          <Box marginTop={1} flexDirection="column">
            <Text>
              <Text color="green">{gate.type}</Text> · issue ou intenção:
            </Text>
            <Box>
              <Text>{'  › '}</Text>
              <TextInput
                value={issueInput}
                onChange={setIssueInput}
                onSubmit={(v) => void runGate(gate.type, v)}
                placeholder="número (#NN) ou uma linha de intenção; vazio = sem issue"
              />
            </Box>
            <Text dimColor>[enter] gerar · [esc] cancelar</Text>
          </Box>
        )}
        {gate.phase === 'generating' && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>gerando a mensagem com o claude…</Text>
            <Text dimColor>[esc] cancelar (desfaz o staging)</Text>
          </Box>
        )}
        {gate.phase === 'committing' && <Text dimColor>commitando…</Text>}
        {gate.phase === 'editing' && (
          <Box marginTop={1} flexDirection="column">
            <Text>Editar a mensagem:</Text>
            <Box>
              <Text>{'  › '}</Text>
              <TextInput
                value={gate.draft}
                onChange={(v) => setGate({ ...gate, draft: v })}
                onSubmit={(v) =>
                  setGate({
                    phase: 'preview',
                    type: gate.type,
                    issue: gate.issue,
                    body: v,
                    aiAssisted: gate.aiAssisted,
                    toReset: gate.toReset,
                  })
                }
              />
            </Box>
            <Text dimColor>[enter] aplicar · [esc] descartar a edição</Text>
          </Box>
        )}
        {gate.phase === 'preview' && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>mensagem:</Text>
            {gate.body.trim().length > 0 ? (
              <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
                {assembleMessage({ type: gate.type, issue: gate.issue, body: gate.body, aiAssisted: gate.aiAssisted })
                  .split('\n')
                  .map((line, i) => (
                    <Text key={i}>{line}</Text>
                  ))}
              </Box>
            ) : (
              <Text color="yellow">
                IA indisponível — o prefixo é {assembleMessage({ type: gate.type, issue: gate.issue, body: '', aiAssisted: false })}; [e] para escrever à mão.
              </Text>
            )}
            {gate.error ? <Text color="red">commit falhou: {gate.error}</Text> : null}
            <Text dimColor>
              {gate.body.trim().length > 0 ? '[enter] commitar · ' : ''}[e] editar · [esc] cancelar (desfaz o staging)
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  const selected = state.files[Math.min(cursor, state.files.length - 1)];
  const hunks = selected.body.kind === 'patch' ? hunkStarts(selected.body.patch) : [];
  const totalLines = selected.body.kind === 'patch' ? selected.body.patch.split('\n').length : 0;
  const safeScroll = expanded ? Math.min(scrollTop, maxScrollTop(totalLines, maxRows)) : 0;
  const safeHunk = hunkAt(hunks, safeScroll);
  const onDiff = focus === 'diff';
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text color="yellow" bold>
          {layerHeader(state.layers)}
        </Text>
        <Text dimColor> · arquivo {cursor + 1}/{state.files.length}</Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        {!expanded && <LocalTree review={state.review} selectedPath={selected.path} marked={marked} />}
        <Box flexDirection="column" flexShrink={1}>
          <Text wrap="truncate-start">
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
          <FileDiff file={selected} expanded={expanded} scrollTop={safeScroll} maxRows={maxRows} />
        </Box>
      </Box>
      <Text dimColor wrap="truncate-end">
        {onDiff
          ? '[j/k] rolar · [J/K] bloco · [h] sidebar · [tab] dobrar'
          : `[j/k] arquivo · [l] diff · [espaço] marcar${marked.size > 0 ? ' · [c] commitar' : ''} · [tab] expandir`}
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
function LocalTree({
  review,
  selectedPath,
  marked,
}: {
  review: GroupedReview;
  selectedPath: string;
  marked: ReadonlySet<string>;
}) {
  if (review.profile === 'flat') {
    return (
      <Box flexDirection="column">
        <LayerList layers={review.layers} selectedPath={selectedPath} marked={marked} />
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
          <LayerList layers={group.layers} selectedPath={selectedPath} marked={marked} />
        </Box>
      ))}
    </Box>
  );
}

/** Nível Camada → arquivo, compartilhado pelos perfis modular e flat. */
function LayerList({
  layers,
  selectedPath,
  marked,
}: {
  layers: LayerGroup[];
  selectedPath: string;
  marked: ReadonlySet<string>;
}) {
  return (
    <>
      {layers.map((layer) => (
        <Box key={layer.layer} flexDirection="column">
          <Text dimColor> {LAYER_LABEL[layer.layer]}</Text>
          {layer.files.map((file) => {
            const here = file.path === selectedPath;
            const isMarked = marked.has(file.path);
            return (
              <Text key={file.path} color={here ? 'green' : undefined} bold={here} wrap="truncate-end">
                {here ? ' › ' : '   '}
                {isMarked ? '✓ ' : '  '}
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
