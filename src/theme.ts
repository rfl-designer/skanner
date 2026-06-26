/**
 * Tema semântico da TUI (inspirado no `but tui` do GitButler): um **único ponto**
 * onde cada papel visual — marca, acento, seleção, diff, bordas, semântica — é
 * nomeado, em vez das cores espalhadas por componente. Os componentes leem daqui;
 * trocar a paleta é editar só este arquivo. Puro: sem estado, sem IO.
 *
 * Os valores são props de `Text`/`Box` do Ink: ou uma string de cor (`color`/
 * `borderColor`), ou um objeto de props a ser espalhado (`{...theme.selected}`).
 */

/** Marcador do item sob o cursor nas listas/árvores (▶, como o `but tui`). */
export const CURSOR = '▶ ';
/** Espaço de mesma largura do cursor, p/ alinhar os itens não-selecionados. */
export const NO_CURSOR = '  ';
/** Marca de "feito" (revisado / marcado p/ commit). */
export const CHECK = '✓ ';
export const NO_CHECK = '  ';

export const theme = {
  /** Título "Skanner" e cabeçalhos de folha de atalhos. */
  brand: { color: 'cyan', bold: true } as const,
  /** Cor de acento padrão (foco, caminho do arquivo em foco). */
  accent: 'cyan',
  /** Item selecionado na árvore/lista. */
  selected: { color: 'green', bold: true } as const,
  /** Cabeçalho de contexto/grupo na árvore. */
  context: { color: 'cyan', bold: true } as const,
  /** Cabeçalho de camada e metadados em geral. */
  layer: { dimColor: true } as const,
  /** Teclas de atalho ([x]) e números (#NN, contadores). */
  key: 'yellow',
  /** Badges de status do arquivo (criado/binário/draft…). */
  badge: 'magenta',
  /** Borda de painel inativo. */
  border: 'gray',
  /** Borda do painel em foco (espessa). */
  borderFocus: 'cyan',
  /** Adição/remoção/cabeçalho de hunk no diff. */
  add: 'green',
  del: 'red',
  hunk: 'cyan',
  /** Realce intra-linha (a sub-região que de fato mudou), como o `*_rich` do GitButler. */
  addEmph: { color: 'black', backgroundColor: 'green', bold: true } as const,
  delEmph: { color: 'black', backgroundColor: 'red', bold: true } as const,
  /** Semântica de mensagens. */
  success: 'green',
  error: 'red',
  warn: 'yellow',
} as const;
