import { Box, Text, useStdout } from 'ink';
import { highlight } from 'cli-highlight';
import { isOversized } from '../core/diff.js';
import type { ChangedFile } from '../core/review.js';

/**
 * Altura do viewport do diff em linhas, derivada das `rows` do terminal com folga
 * para cabeçalho, rótulo do arquivo, indicadores de scroll e rodapé. Fallback 24
 * (terminal sem `rows`, ex.: testes) — o diff inteiro raramente excede isso.
 *
 * Responsividade (uso em tmux): a folga é a única conta de altura; a largura é
 * tratada por truncamento ANSI-aware (`wrap="truncate-*"`) nas linhas, então cada
 * linha de diff ocupa exatamente uma linha de tela mesmo em painel estreito — sem
 * quebra que estoure o viewport ao reduzir a coluna.
 */
export function useDiffViewport(): number {
  const { stdout } = useStdout();
  return Math.max(5, (stdout?.rows ?? 24) - 9);
}

/**
 * Render de diff compartilhado (CONTEXT.md §Render de diff): componentes
 * **puramente presentacionais** do corpo de um arquivo, reusados pela review
 * remota (`review.tsx`) e pelo Working diff local (`working-diff.tsx`) — DRY que o
 * PRD pede. Sem estado, sem IO, sem regra de domínio: recebem o `ChangedFile` já
 * resolvido pelo núcleo e desenham hunks unified em Ink + highlight via
 * `cli-highlight`. O colapso por teto de linhas é decisão do núcleo (`isOversized`).
 */

/**
 * Corpo do arquivo como máquina sobre o `body` (PRD §6.5): binário e
 * renomeado-puro viram linha de status; truncado mostra aviso + URL no GitHub,
 * sem corpo. Patch só desenha hunks quando `expanded`; dobrado vira placeholder
 * ([tab] alterna) — o gigante distingue o aviso pelo nº de linhas.
 */
export function FileDiff({
  file,
  expanded,
  scrollTop = 0,
  maxRows,
}: {
  file: ChangedFile;
  expanded: boolean;
  /** Primeira linha do patch a desenhar — âncora do hunk em foco (navegação [j/k]). */
  scrollTop?: number;
  /** Altura do viewport em linhas; sem ela, desenha o patch inteiro (sem scroll). */
  maxRows?: number;
}) {
  const body = file.body;
  switch (body.kind) {
    case 'binary':
      return <Text dimColor>(binário — sem diff){file.url ? ` · ${file.url}` : ''}</Text>;
    case 'none':
      return <Text dimColor>(sem mudança de conteúdo)</Text>;
    case 'truncated':
      return (
        <Box flexDirection="column">
          <Text dimColor>(diff truncado — grande demais para exibir)</Text>
          {file.url ? <Text dimColor>ver no GitHub: {file.url}</Text> : null}
        </Box>
      );
    case 'patch': {
      if (!expanded) {
        if (isOversized(body)) {
          const lines = body.patch.split('\n').length;
          return <Text dimColor>(arquivo grande: {lines} linhas — [tab] expandir)</Text>;
        }
        return <Text dimColor>(diff dobrado — [tab] expandir)</Text>;
      }
      const lang = languageOf(file.path);
      const lines = body.patch.split('\n');
      const top = Math.min(Math.max(0, scrollTop), Math.max(0, lines.length - 1));
      const end = maxRows === undefined ? lines.length : Math.min(lines.length, top + maxRows);
      return (
        <Box flexDirection="column">
          {top > 0 ? (
            <Text color="cyan" dimColor>
              ▲ {top} linha{top > 1 ? 's' : ''} acima
            </Text>
          ) : null}
          {lines.slice(top, end).map((line, i) => (
            <DiffLine key={top + i} line={line} lang={lang} />
          ))}
          {end < lines.length ? (
            <Text color="cyan" dimColor>
              ▼ {lines.length - end} linha{lines.length - end > 1 ? 's' : ''} abaixo
            </Text>
          ) : null}
        </Box>
      );
    }
  }
}

function DiffLine({ line, lang }: { line: string; lang: string | undefined }) {
  // `truncate-end`: cada linha ocupa UMA linha de tela mesmo em painel estreito
  // (tmux) — sem quebra que estoure o viewport. Marcador +/− em bold p/ contraste.
  if (line.startsWith('@@'))
    return (
      <Text color="cyan" bold wrap="truncate-end">
        {line}
      </Text>
    );
  if (line.startsWith('+')) {
    return (
      <Text color="green" wrap="truncate-end">
        <Text bold>+</Text>
        {paint(line.slice(1), lang)}
      </Text>
    );
  }
  if (line.startsWith('-')) {
    return (
      <Text color="red" wrap="truncate-end">
        <Text bold>-</Text>
        {paint(line.slice(1), lang)}
      </Text>
    );
  }
  return (
    <Text dimColor wrap="truncate-end">
      {paint(line, lang)}
    </Text>
  );
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

export function basename(path: string): string {
  const segs = path.split('/');
  return segs[segs.length - 1];
}
