import path from 'node:path';
import chokidar from 'chokidar';
import { isIgnoredPath } from '../core/watch.js';

/**
 * Módulo de serviço `watch` (CONTEXT.md §Módulo de serviço): a fronteira tipada
 * app↔Node do **auto-watch** do Working diff (issue #15). Observa a pasta do repo
 * via `chokidar` e avisa quando o [change-set](CONTEXT.md) pode ter mudado. Faz só
 * IO + debounce; a decisão de domínio — *quais* paths são ruído — é delegada ao
 * coração (`isIgnoredPath`), nunca hardcoded aqui. Read-only: nunca escreve no repo.
 */

/** Janela de debounce: junta uma rajada de saves intermediários num único aviso. */
const DEBOUNCE_MS = 300;

/**
 * Assina mudanças em `repoPath` e chama `onChange` (já com debounce) a cada rajada
 * de salvamentos relevante. Eventos em [diretórios ignorados](../core/watch.ts) são
 * descartados (passados ao chokidar como `ignored` e refiltrados no handler, ambos
 * via a função-coração). Devolve a função de **unsubscribe** que fecha o watcher e
 * cancela o timer pendente — sem leak.
 */
export function watch(repoPath: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, DEBOUNCE_MS);
  };

  const watcher = chokidar.watch(repoPath, {
    ignoreInitial: true,
    ignored: (target) => isIgnoredPath(path.relative(repoPath, target)),
  });

  watcher.on('all', (_event, changedPath) => {
    if (!isIgnoredPath(path.relative(repoPath, changedPath))) fire();
  });

  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void watcher.close();
  };
}
