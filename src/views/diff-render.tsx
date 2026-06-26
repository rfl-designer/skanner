import { Box, Text } from 'ink';
import { highlight } from 'cli-highlight';
import { isOversized } from '../core/diff.js';
import type { ChangedFile } from '../core/review.js';

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
export function FileDiff({ file, expanded }: { file: ChangedFile; expanded: boolean }) {
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
      return (
        <Box flexDirection="column">
          {body.patch.split('\n').map((line, i) => (
            <DiffLine key={i} line={line} lang={lang} />
          ))}
        </Box>
      );
    }
  }
}

function DiffLine({ line, lang }: { line: string; lang: string | undefined }) {
  if (line.startsWith('@@')) return <Text color="cyan">{line}</Text>;
  if (line.startsWith('+')) {
    return <Text color="green">+{paint(line.slice(1), lang)}</Text>;
  }
  if (line.startsWith('-')) {
    return <Text color="red">-{paint(line.slice(1), lang)}</Text>;
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

export function basename(path: string): string {
  const segs = path.split('/');
  return segs[segs.length - 1];
}
