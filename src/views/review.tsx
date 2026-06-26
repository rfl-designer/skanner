import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { highlight } from 'cli-highlight';
import { diff } from '../services/pr.js';
import {
  groupReview,
  LAYER_LABEL,
  NO_CONTEXT_LABEL,
  type ChangedFile,
  type GroupedReview,
  type LayerGroup,
} from '../core/review.js';
import type { ResolvedRepo } from '../core/repo.js';

/**
 * Tela **Review da PR** (modo remoto, PRD §6.3). Abre uma PR como fatia vertical:
 * busca o diff (serviço `pr.diff`), delega o agrupamento ao núcleo (`groupReview`,
 * que despacha pelo perfil do repo) e renderiza a árvore Contexto → Camada → arquivo
 * (modular) ou só Camada → arquivo (flat, sem o nível de grupo) + o diff unified do
 * arquivo selecionado (render próprio em Ink + highlight via `cli-highlight`).
 * Navegação básica próximo/anterior (atalhos ricos são da #11).
 *
 * Máquina de estados: loading → (empty | error | ready). Sem regra de domínio
 * inline — categorização e árvore moram no núcleo; aqui só estado e desenho.
 */
type ReviewState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; error: string }
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

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setCursor(0);
    diff(repo, number)
      .then((pr) => {
        if (cancelled) return;
        if (pr.files.length === 0) {
          setState({ status: 'empty' });
          return;
        }
        const review = groupReview(pr.files, repo.profile);
        const files = flatten(review);
        setState({ status: 'ready', review, files });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', error: message(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, number]);

  const fileCount = state.status === 'ready' ? state.files.length : 0;
  useInput((input, key) => {
    if (key.escape || input === 'b') {
      onBack();
      return;
    }
    if (fileCount === 0) return;
    if (key.downArrow || input === 'j' || input === 'n') {
      setCursor((c) => Math.min(c + 1, fileCount - 1));
    } else if (key.upArrow || input === 'k' || input === 'p') {
      setCursor((c) => Math.max(c - 1, 0));
    }
  });

  if (state.status === 'loading') {
    return <Text dimColor>carregando diff da PR #{number}…</Text>;
  }

  if (state.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">erro: {state.error}</Text>
        <Text dimColor>[esc] voltar</Text>
      </Box>
    );
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
  return (
    <Box flexDirection="column">
      <Text>
        <Text color="yellow">PR #{number}</Text>
        <Text dimColor> · arquivo {cursor + 1}/{state.files.length}</Text>
      </Text>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Tree review={state.review} selectedPath={selected.path} />
        <Box flexDirection="column" flexShrink={1}>
          <Text dimColor>{selected.path}</Text>
          <DiffBody file={selected} />
        </Box>
      </Box>
      <Text dimColor>[↑/↓] arquivo · [esc] voltar</Text>
    </Box>
  );
}

/**
 * Árvore de navegação com o cursor marcado. Modular: Contexto → Camada → arquivo.
 * Flat: só Camada → arquivo, SEM o cabeçalho de grupo (PRD §4.0 estratégia 3).
 */
function Tree({ review, selectedPath }: { review: GroupedReview; selectedPath: string }) {
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

/** Diff unified do arquivo, colorido por prefixo e com highlight do conteúdo. */
function DiffBody({ file }: { file: ChangedFile }) {
  if (file.patch === null) {
    return <Text dimColor>(sem diff — patch indisponível)</Text>;
  }
  const lang = languageOf(file.path);
  return (
    <Box flexDirection="column">
      {file.patch.split('\n').map((line, i) => (
        <DiffLine key={i} line={line} lang={lang} />
      ))}
    </Box>
  );
}

function DiffLine({ line, lang }: { line: string; lang: string | undefined }) {
  if (line.startsWith('@@')) return <Text color="cyan">{line}</Text>;
  if (line.startsWith('+')) {
    return (
      <Text color="green">
        +{paint(line.slice(1), lang)}
      </Text>
    );
  }
  if (line.startsWith('-')) {
    return (
      <Text color="red">
        -{paint(line.slice(1), lang)}
      </Text>
    );
  }
  return <Text dimColor>{paint(line, lang)}</Text>;
}

/** Aplica o highlight de sintaxe, tolerando trechos parciais de hunk. */
function paint(code: string, lang: string | undefined): string {
  if (code.length === 0) return code;
  try {
    return highlight(code, lang ? { language: lang, ignoreIllegals: true } : { ignoreIllegals: true });
  } catch {
    return code;
  }
}

function languageOf(path: string): string | undefined {
  if (path.endsWith('.blade.php')) return 'php';
  if (path.endsWith('.php')) return 'php';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
  return undefined;
}

function flatten(review: GroupedReview): ChangedFile[] {
  const layers = review.profile === 'flat' ? review.layers : review.groups.flatMap((g) => g.layers);
  return layers.flatMap((l) => l.files);
}

function basename(path: string): string {
  const segs = path.split('/');
  return segs[segs.length - 1];
}

function message(err: unknown): string {
  if (
    err !== null &&
    typeof err === 'object' &&
    'status' in err &&
    (err as { status?: number }).status === 401
  ) {
    return 'PAT inválido ou expirado (401).';
  }
  return err instanceof Error ? err.message : String(err);
}
