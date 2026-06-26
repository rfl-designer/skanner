import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { DiffFile } from '../core/diff.js';
import {
  isUntracked,
  trackedDiffFile,
  untrackedDiffFile,
  type GitFileCode,
} from '../core/local.js';

/**
 * Módulo de serviço `local` (CONTEXT.md §Módulo de serviço, PRD
 * `local-pre-commit-review`): a fronteira tipada app↔Node que lê o
 * [change-set](CONTEXT.md) — **tudo fora do último commit** (staged + unstaged +
 * untracked) — via `simple-git`/`fs` e devolve a MESMA estrutura `DiffFile[]` que
 * o modo remoto consome, para o agrupador (`groupReview`) ficar agnóstico à
 * origem. **Read-only**: só `status` e `diff` (HEAD); nunca `add`/`add -N`, o
 * index do dono não é tocado (AC). Sem regra de domínio inline — a síntese do
 * untracked e o mapeamento de status moram no núcleo (`core/local`). Issue #14.
 */

/**
 * Diff do change-set não-commitado de `repoPath`. Para cada arquivo do
 * `git status`: untracked → bloco de adição sintetizado do conteúdo (lido do fs,
 * sem tocar o index); rastreado → patch de `git diff HEAD -- <arquivo>` (que cobre
 * staged+unstaged juntos), classificado pelo núcleo. `url` é sempre `null`.
 */
export async function diff(repoPath: string): Promise<DiffFile[]> {
  const git = simpleGit(repoPath);
  const status = await git.status();

  const files: DiffFile[] = [];
  for (const entry of status.files) {
    if (isUntracked(entry.index, entry.working_dir)) {
      const content = await fs.readFile(path.join(repoPath, entry.path), 'utf8');
      files.push(untrackedDiffFile(entry.path, content));
      continue;
    }
    const code: GitFileCode = {
      path: entry.path,
      index: entry.index,
      workingDir: entry.working_dir,
      from: status.renamed.find((r) => r.to === entry.path)?.from,
    };
    const raw = await git.diff(['HEAD', '--', entry.path]);
    files.push(trackedDiffFile(code, raw));
  }
  return files;
}
