import Conf from 'conf';
import envPaths from 'env-paths';
import type { RepoOverride } from '../core/repo.js';

/**
 * Módulo de serviço `conf` (PRD §5): o store JSON local. A issue #3 só **lê** o
 * mapa `path → overrides`; a escrita (override inline `[m]`, checklist) nasce nas
 * issues #11/#7.
 *
 * `SKANNER_CONFIG_DIR` sobrepõe o dir (mesmo idioma do `auth.ts`) — os testes
 * apontam para um diretório temporário. Construir **sem `defaults`** é write-free:
 * ler um override jamais persiste nada (AC 6).
 */

interface SkannerStore {
  overrides: Record<string, RepoOverride>;
}

function configDir(): string {
  return process.env.SKANNER_CONFIG_DIR ?? envPaths('skanner', { suffix: '' }).config;
}

function store(): Conf<SkannerStore> {
  return new Conf<SkannerStore>({ projectName: 'skanner', cwd: configDir() });
}

/**
 * Override de um repo no mapa `path → overrides` (chave = raiz do git). `{}`
 * quando não há store ou o repo não tem correção — leitura sem efeito colateral.
 */
export function readOverride(root: string): RepoOverride {
  return store().get('overrides')?.[root] ?? {};
}
