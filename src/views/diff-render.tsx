import type { ReactNode } from 'react';
import { Box, Text, useStdout } from 'ink';
import { highlight } from 'cli-highlight';
import { isOversized, refineIntraline, type IntralineRange } from '../core/diff.js';
import type { ChangedFile } from '../core/review.js';
import { theme } from '../theme.js';

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
 * Painel emoldurado com **sinalização de foco** (estilo `but tui` do GitButler): o
 * painel em foco ganha borda espessa e acentuada; o inativo, borda fina e apagada.
 * `grow` faz o painel ocupar o espaço restante da linha (a coluna do diff). Puro.
 */
export function Pane({
  focused,
  grow,
  children,
}: {
  focused: boolean;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      flexDirection="column"
      flexShrink={1}
      flexGrow={grow ? 1 : 0}
      paddingX={1}
      borderStyle={focused ? 'bold' : 'round'}
      borderColor={focused ? theme.borderFocus : theme.border}
      borderDimColor={!focused}
    >
      {children}
    </Box>
  );
}

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
      // Refino intra-linha computado sobre o patch INTEIRO (pareamento −/+ não pode
      // depender da fatia visível); o viewport só seleciona quais índices desenhar.
      const ranges = refineIntraline(lines);
      const top = Math.min(Math.max(0, scrollTop), Math.max(0, lines.length - 1));
      const end = maxRows === undefined ? lines.length : Math.min(lines.length, top + maxRows);
      return (
        <Box flexDirection="column">
          {top > 0 ? (
            <Text color={theme.hunk} dimColor>
              ▲ {top} linha{top > 1 ? 's' : ''} acima
            </Text>
          ) : null}
          {lines.slice(top, end).map((line, i) => (
            <DiffLine key={top + i} line={line} lang={lang} range={ranges.get(top + i)} />
          ))}
          {end < lines.length ? (
            <Text color={theme.hunk} dimColor>
              ▼ {lines.length - end} linha{lines.length - end > 1 ? 's' : ''} abaixo
            </Text>
          ) : null}
        </Box>
      );
    }
  }
}

/**
 * Modal de **arquivo completo** ([z], issues #53/#54): caixa com borda ocupando a
 * tela, mostrando o conteúdo da working tree do arquivo (não o diff). `content ===
 * null` é o estado "carregando…" enquanto o serviço lê o disco. Cada linha vem com
 * número (calha dimColor) e syntax highlight pela extensão do path, reusando o
 * `paint` do diff. O título traz o caminho + `linha X/N`; o rodapé, os atalhos.
 * Fatiamento idêntico ao `FileDiff` (viewport por `scrollTop`/`maxRows`,
 * indicadores ▲/▼). Puramente presentacional — o scroll e a leitura moram na view.
 */
export function FileViewer({
  path,
  content,
  scrollTop,
  maxRows,
}: {
  path: string;
  content: string | null;
  scrollTop: number;
  maxRows: number;
}) {
  if (content === null) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor={theme.border} paddingX={1} flexDirection="column">
          <Text wrap="truncate-start">
            <Text {...theme.brand}>{path}</Text>
          </Text>
          <Text dimColor>carregando…</Text>
        </Box>
        <ViewerFooter />
      </Box>
    );
  }
  const lang = languageOf(path);
  const lines = content.split('\n');
  const top = Math.min(Math.max(0, scrollTop), Math.max(0, lines.length - 1));
  const end = Math.min(lines.length, top + maxRows);
  // Largura da calha pelo maior número de linha do arquivo (alinhamento à direita).
  const gutter = String(lines.length).length;
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={theme.border} paddingX={1} flexDirection="column">
        <Text wrap="truncate-start">
          <Text {...theme.brand}>{path}</Text>
          <Text dimColor>
            {' '}
            · linha {top + 1}/{lines.length}
          </Text>
        </Text>
        {top > 0 ? (
          <Text color={theme.hunk} dimColor>
            ▲ {top} linha{top > 1 ? 's' : ''} acima
          </Text>
        ) : null}
        {lines.slice(top, end).map((line, i) => (
          <Text key={top + i} wrap="truncate-end">
            <Text dimColor>{String(top + i + 1).padStart(gutter, ' ')} </Text>
            {paint(line, lang)}
          </Text>
        ))}
        {end < lines.length ? (
          <Text color={theme.hunk} dimColor>
            ▼ {lines.length - end} linha{lines.length - end > 1 ? 's' : ''} abaixo
          </Text>
        ) : null}
      </Box>
      <ViewerFooter />
    </Box>
  );
}

/** Rodapé de ajuda do modal de arquivo ([z], #54). */
function ViewerFooter() {
  return (
    <Text dimColor wrap="truncate-end">
      [j/k] linha · [g/G] topo/fim · [z/esc] fechar
    </Text>
  );
}

function DiffLine({ line, lang, range }: { line: string; lang: string | undefined; range?: IntralineRange }) {
  // `truncate-end`: cada linha ocupa UMA linha de tela mesmo em painel estreito
  // (tmux) — sem quebra que estoure o viewport. Marcador +/− em bold p/ contraste.
  if (line.startsWith('@@'))
    return (
      <Text color={theme.hunk} bold wrap="truncate-end">
        {line}
      </Text>
    );
  if (line.startsWith('+')) {
    return (
      <Text color={theme.add} wrap="truncate-end">
        <Text bold>+</Text>
        {body(line.slice(1), lang, range, theme.addEmph)}
      </Text>
    );
  }
  if (line.startsWith('-')) {
    return (
      <Text color={theme.del} wrap="truncate-end">
        <Text bold>-</Text>
        {body(line.slice(1), lang, range, theme.delEmph)}
      </Text>
    );
  }
  return (
    <Text dimColor wrap="truncate-end">
      {paint(line, lang)}
    </Text>
  );
}

/**
 * Conteúdo de uma linha +/− do diff. Sem refino (`range` ausente), mantém o
 * highlight de sintaxe. Com refino, parte em prefixo · meio · sufixo e realça só o
 * **meio** que mudou (fundo da cor do lado, estilo `*_rich` do GitButler) — o
 * prefixo/sufixo herdam a cor +/− do pai. O highlight de sintaxe é trocado pela
 * ênfase nessas linhas: na sub-região alterada, o destaque importa mais que a cor da sintaxe.
 */
function body(content: string, lang: string | undefined, range: IntralineRange | undefined, emph: { color: string; backgroundColor: string; bold: boolean }) {
  if (!range) return paint(content, lang);
  return (
    <Text>
      {content.slice(0, range.start)}
      <Text {...emph}>{content.slice(range.start, range.end)}</Text>
      {content.slice(range.end)}
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
