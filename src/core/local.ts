/**
 * Núcleo do **modo local** (Working diff, CONTEXT.md §Modo local, PRD
 * `local-pre-commit-review`): puro, agnóstico de UI e de IO. O serviço
 * `local.diff` (simple-git/fs) só traz os campos crus de cada arquivo do
 * change-set; a decisão de domínio — *como* um arquivo novo/untracked vira um
 * bloco de adição, *qual* [FileStatus](diff.ts)/[DiffBody](diff.ts) cada código
 * do git representa, e *quais* [camadas](review.ts) o change-set contém — mora
 * aqui, nunca na view nem no serviço. Issue #14.
 */

import { categorize, LAYER_ORDER, type Layer } from './review.js';
import type { DiffBody, DiffFile, FileStatus } from './diff.js';

/**
 * Sintetiza o **bloco todo-adições** de um arquivo novo/untracked a partir do seu
 * conteúdo: cabeçalho de hunk `@@ -0,0 +1,N @@` + cada linha prefixada com `+`. É
 * como o untracked entra no diff SEM `git add -N` e SEM tocar o index (PRD §3,
 * decisão fechada). Um `\n` final é o terminador da última linha, não uma linha
 * vazia a mais — por isso é descartado da contagem. Arquivo vazio → patch vazio
 * (não há adição a mostrar).
 */
export function synthesizeAddition(content: string): string {
  if (content.length === 0) return '';
  const trimmed = content.endsWith('\n') ? content.slice(0, -1) : content;
  const lines = trimmed.split('\n');
  const header = `@@ -0,0 +1,${lines.length} @@`;
  return [header, ...lines.map((line) => `+${line}`)].join('\n');
}

/**
 * Arquivo untracked + conteúdo → [DiffFile](diff.ts) todo-adições. Status sempre
 * `added` (é arquivo novo); corpo é o bloco sintetizado; `url` é `null` (modo
 * local não tem origem no GitHub). Coração do ramo untracked do serviço.
 */
export function untrackedDiffFile(path: string, content: string): DiffFile {
  return {
    path,
    status: { kind: 'added' },
    body: { kind: 'patch', patch: synthesizeAddition(content) },
    url: null,
  };
}

/** Códigos de status de um arquivo rastreado, como o `git status` os reporta. */
export interface GitFileCode {
  path: string;
  index: string;
  workingDir: string;
  /** Nome antigo quando renomeado (do `status.renamed`); ausente nos demais. */
  from?: string;
}

/** Untracked é o par `??` do porcelain (sem entrada no index nem na árvore). */
export function isUntracked(index: string, workingDir: string): boolean {
  return index === '?' && workingDir === '?';
}

/**
 * Códigos do `git status` → [FileStatus](diff.ts). União discriminada: rename
 * carrega o nome antigo (`from`), os demais não. Precedência rename → delete →
 * add → modify (um arquivo adicionado-e-modificado conta como adicionado).
 */
export function toLocalStatus(code: GitFileCode): FileStatus {
  const flags = code.index + code.workingDir;
  if (flags.includes('R')) return { kind: 'renamed', from: code.from ?? '?' };
  if (flags.includes('D')) return { kind: 'removed' };
  if (flags.includes('A')) return { kind: 'added' };
  return { kind: 'modified' };
}

/**
 * Saída crua do `git diff HEAD -- <arquivo>` → [DiffBody](diff.ts). Binário vem
 * marcado por linha de texto (sem hunks) → `binary`; havendo hunk, o corpo é do
 * primeiro `@@` em diante (descarta o cabeçalho `diff --git`/`index`/`---`/`+++`,
 * casando o formato que a fonte remota já entrega); sem hunk e sem binário (ex.:
 * rename puro) → `none`.
 */
export function bodyFromPatch(raw: string): DiffBody {
  if (/^Binary files /m.test(raw) || raw.includes('GIT binary patch')) {
    return { kind: 'binary' };
  }
  const hunk = raw.indexOf('@@');
  if (hunk === -1) return { kind: 'none' };
  return { kind: 'patch', patch: raw.slice(hunk).replace(/\n+$/, '') };
}

/**
 * Arquivo rastreado (códigos do status + patch cru do `git diff HEAD`) →
 * [DiffFile](diff.ts). Status e corpo são decisão de domínio (acima); `url` é
 * `null` no modo local.
 */
export function trackedDiffFile(code: GitFileCode, raw: string): DiffFile {
  return {
    path: code.path,
    status: toLocalStatus(code),
    body: bodyFromPatch(raw),
    url: null,
  };
}

/**
 * Camada(s) presentes no change-set, na ordem canônica de exibição
 * ([LAYER_ORDER](review.ts)), reusando `categorize`. É o rótulo do topo do
 * Working diff: uma só camada no caso comum (gate por camada), todas quando o
 * agente produziu mais de uma antes do gate (degradação graciosa, PRD §7).
 */
export function detectedLayers(files: DiffFile[]): Layer[] {
  const present = new Set(files.map((file) => categorize(file.path)));
  return LAYER_ORDER.filter((layer) => present.has(layer));
}
