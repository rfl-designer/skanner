import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODULAR_BASE_DIR,
  mergeOverride,
  modularBaseDirFor,
  parseOriginUrl,
  type RepoIdentity,
} from './repo.js';

const github = (owner: string, name: string): RepoIdentity => ({ kind: 'github', owner, name });
const local: RepoIdentity = { kind: 'local-only' };

describe('parseOriginUrl — AC 3 (ssh+https, sem GitHub → local-only)', () => {
  it.each([
    ['ssh scp', 'git@github.com:rfl-designer/skanner.git'],
    ['ssh scp sem .git', 'git@github.com:rfl-designer/skanner'],
    ['https', 'https://github.com/rfl-designer/skanner.git'],
    ['https sem .git', 'https://github.com/rfl-designer/skanner'],
    ['ssh://', 'ssh://git@github.com/rfl-designer/skanner.git'],
    ['https com token', 'https://x-access-token:tok@github.com/rfl-designer/skanner.git'],
    ['host maiúsculo', 'git@GitHub.com:rfl-designer/skanner.git'],
  ])('%s → github owner/name', (_label, url) => {
    expect(parseOriginUrl(url)).toEqual(github('rfl-designer', 'skanner'));
  });

  it('preserva ponto no nome (não confunde com .git)', () => {
    expect(parseOriginUrl('git@github.com:rfl-designer/my.repo.git')).toEqual(
      github('rfl-designer', 'my.repo'),
    );
  });

  it.each([
    ['gitlab', 'git@gitlab.com:o/n.git'],
    ['bitbucket https', 'https://bitbucket.org/o/n.git'],
    ['null', null],
    ['vazio', '   '],
    ['lixo', 'not a url'],
  ])('%s → local-only', (_label, url) => {
    expect(parseOriginUrl(url)).toEqual(local);
  });
});

describe('modularBaseDirFor — AC 5', () => {
  it('default sem override', () => {
    expect(modularBaseDirFor({})).toBe(DEFAULT_MODULAR_BASE_DIR);
  });
  it('honra o override', () => {
    expect(modularBaseDirFor({ modularBaseDir: 'src/Modules' })).toBe('src/Modules');
  });
});

describe('mergeOverride — AC 4 (auto) e AC 5 (override vence)', () => {
  it('tem diretório base → modular/auto (caso concilliun-crm)', () => {
    const r = mergeOverride({ parsedIdentity: github('rfl-designer', 'concilliun-crm'), hasModularBaseDir: true, override: {} });
    expect(r.profile).toBe('modular');
    expect(r.source.profile).toBe('auto');
  });

  it('sem diretório base → flat/auto (caso soloboard)', () => {
    const r = mergeOverride({ parsedIdentity: github('rfl-designer', 'soloboard'), hasModularBaseDir: false, override: {} });
    expect(r.profile).toBe('flat');
    expect(r.source.profile).toBe('auto');
  });

  it('override de perfil sobrescreve o auto-detectado', () => {
    const r = mergeOverride({ parsedIdentity: local, hasModularBaseDir: true, override: { profile: 'flat' } });
    expect(r.profile).toBe('flat');
    expect(r.source.profile).toBe('override');
  });

  it('identidade manual (owner/name) só entra quando o remote é local-only', () => {
    const r = mergeOverride({ parsedIdentity: local, hasModularBaseDir: false, override: { owner: 'rfl-designer', name: 'soloboard' } });
    expect(r.identity).toEqual(github('rfl-designer', 'soloboard'));
  });

  it('remote GitHub vence o owner/name manual do override', () => {
    const r = mergeOverride({ parsedIdentity: github('rfl-designer', 'skanner'), hasModularBaseDir: false, override: { owner: 'outro', name: 'errado' } });
    expect(r.identity).toEqual(github('rfl-designer', 'skanner'));
  });

  it('sem remote e sem override → local-only', () => {
    const r = mergeOverride({ parsedIdentity: local, hasModularBaseDir: false, override: {} });
    expect(r.identity).toEqual(local);
  });
});
