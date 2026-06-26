/**
 * Núcleo do **auto-watch** do modo local (Working diff, CONTEXT.md §Modo local):
 * puro, agnóstico de UI e de IO. Decide o que é RUÍDO ao observar a pasta do repo
 * — salvamentos em diretórios irrelevantes (`.git/`, `node_modules/`, `vendor/`,
 * `storage/`) NÃO devem disparar re-render do change-set. O serviço `watch`
 * (chokidar) só observa e faz debounce; a decisão de domínio mora aqui, nunca
 * inline no watcher. Issue #15.
 */

/** Diretórios cujo conteúdo é ruído para o Working diff — nunca dispara re-render. */
export const IGNORED_DIRS = ['.git', 'node_modules', 'vendor', 'storage'] as const;

const ignored = new Set<string>(IGNORED_DIRS);

/**
 * Um path alterado (relativo à raiz do repo) é ruído a ignorar? `true` quando
 * QUALQUER segmento do path é um [diretório ignorado](#IGNORED_DIRS) — pega tanto
 * o topo (`vendor/autoload.php`) quanto o aninhado (`x/vendor/y`). Normaliza `\` →
 * `/` para casar paths do Windows. Path de código normal (migration, app/Contexts/…)
 * → `false`.
 */
export function isIgnoredPath(relPath: string): boolean {
  return relPath
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => ignored.has(segment));
}
