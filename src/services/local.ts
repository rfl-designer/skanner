import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { DiffFile } from '../core/diff.js';
import {
  isDirEntry,
  isUntracked,
  trackedDiffFile,
  untrackedDiffFile,
  untrackedDirFile,
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
 * `git status`: untracked → bytes lidos do fs (sem tocar o index) e classificados
 * pelo núcleo (texto → bloco de adição sintetizado; binário → `binary`);
 * rastreado → patch de `git diff HEAD -- <arquivo>` (que cobre staged+unstaged
 * juntos), classificado pelo núcleo. `url` é sempre `null`.
 */
export async function diff(repoPath: string): Promise<DiffFile[]> {
  const git = simpleGit(repoPath);
  const status = await git.status();
  const hasCommit = await repoHasCommit(git);

  const files: DiffFile[] = [];
  for (const entry of status.files) {
    // Untracked OU repo sem nenhum commit (sem HEAD): num repo recém-criado, todo
    // arquivo é efetivamente novo — sintetiza do fs (sem tocar o index), pois
    // `git diff HEAD` falharia com "bad revision 'HEAD'". Issue #35.
    if (isUntracked(entry.index, entry.working_dir) || !hasCommit) {
      // Diretório colapsado (repo git embarcado): o git não recursiona e devolve
      // a entrada com barra final; lê-la como arquivo daria `EISDIR` e derrubaria
      // o diff inteiro. Vira um DiffFile sem corpo, sem tocar o fs.
      if (isDirEntry(entry.path)) {
        files.push(untrackedDirFile(entry.path));
        continue;
      }
      // Lê os bytes crus (sem encoding): o núcleo decide binário/texto pelo
      // conteúdo (presença de `\0`); decodificar p/ utf8 aqui sintetizaria
      // mojibake de um arquivo binário novo como adições. Issue #34.
      let content: Buffer;
      try {
        content = await fs.readFile(path.join(repoPath, entry.path));
      } catch (err) {
        // A entrada não tem barra final (isDirEntry não pega) mas APONTA para um
        // diretório: um symlink-para-diretório. O git não anexa barra a symlinks,
        // só o fs revela — readFile segue o link até o dir e lança EISDIR. Trata
        // igual ao dir colapsado (added sem corpo) em vez de propagar o erro, que
        // derrubava o Working diff inteiro. Read-only preservado: o read falhou.
        if ((err as NodeJS.ErrnoException).code === 'EISDIR') {
          files.push(untrackedDirFile(entry.path));
          continue;
        }
        throw err;
      }
      files.push(untrackedDiffFile(entry.path, content));
      continue;
    }
    const code: GitFileCode = {
      path: entry.path,
      index: entry.index,
      workingDir: entry.working_dir,
      from: status.renamed.find((r) => r.to === entry.path)?.from,
    };
    // Renomeado precisa dos DOIS caminhos no pathspec — só com o novo, o git não
    // pareia a remoção do antigo e devolve o arquivo inteiro como adições (sem o
    // delta nem a detecção de rename). Com ambos, sai `rename from/to` + o hunk real.
    const paths = code.from ? [code.from, entry.path] : [entry.path];
    const raw = await git.diff(['HEAD', '--', ...paths]);
    files.push(trackedDiffFile(code, raw));
  }
  return files;
}

/**
 * O repo tem ao menos um commit (HEAD resolve)? Num repo recém-criado, antes do 1º
 * commit, não há HEAD e `git diff HEAD` falha — saber disso antes deixa o serviço
 * tratar o caso como "tudo é novo" (sintetiza do fs) em vez de propagar o erro.
 * Issue #35.
 */
async function repoHasCommit(git: SimpleGit): Promise<boolean> {
  try {
    await git.revparse(['--verify', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}
