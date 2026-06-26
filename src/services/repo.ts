import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  mergeOverride,
  modularBaseDirFor,
  parseOriginUrl,
  type ResolvedRepo,
} from '../core/repo.js';
import { readOverride } from './conf.js';

const run = promisify(execFile);

/**
 * Módulo de serviço `repo` (CONTEXT.md §Módulo de serviço): a fronteira tipada
 * app↔Node. Faz o IO (git/fs/conf) e compõe as funções-coração; toda regra de
 * parse/precedência mora em `core/repo`. Issue #3 / ADR 0005.
 */

/** Raiz do repo git do `cwd`. Fora de um repo git → erro fatal claro (AC 2). */
async function gitRoot(cwd: string): Promise<string> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--show-toplevel'], { cwd });
    return stdout.trim();
  } catch {
    throw new Error('não é um repo git — rode o skanner dentro de um repositório git.');
  }
}

/** URL do `git remote origin`, ou `null` quando não há origin (→ local-only). */
async function originUrl(root: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['remote', 'get-url', 'origin'], { cwd: root });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function isDir(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve o repo a partir do `cwd` (cwd-primeiro, sem cadastro — ADR 0005):
 * raiz pelo git, `owner/name` do `origin`, perfil auto-detectado pela existência
 * do diretório base modular, tudo sob o override do `conf`. Não escreve no store
 * (AC 6). `cwd` é injetável para teste (e cobre o "rodado de uma subpasta", AC 1).
 */
export async function resolveFromCwd(cwd: string = process.cwd()): Promise<ResolvedRepo> {
  const root = await gitRoot(cwd);
  const override = readOverride(root);
  const [url, hasModularBaseDir] = await Promise.all([
    originUrl(root),
    isDir(path.join(root, modularBaseDirFor(override))),
  ]);
  const merged = mergeOverride({ parsedIdentity: parseOriginUrl(url), hasModularBaseDir, override });
  return { root, ...merged };
}
