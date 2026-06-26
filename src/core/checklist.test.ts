import { describe, expect, it } from 'vitest';
import { buildReviewTree, type DiffFile } from './review.js';
import type { ResolvedRepo } from './repo.js';
import {
  checkedRecord,
  checkedSet,
  prKey,
  reviewProgress,
  type ReviewState,
} from './checklist.js';

const file = (path: string, patch: string | null = null): DiffFile => ({ path, patch });

const repo = (identity: ResolvedRepo['identity']): ResolvedRepo => ({
  root: '/repo',
  identity,
  profile: 'modular',
  modularBaseDir: 'app/Contexts',
  source: { profile: 'auto' },
});

describe('prKey — chave repo+PR (PRD §5)', () => {
  it('github → <owner>/<name>#<pr>', () => {
    expect(prKey(repo({ kind: 'github', owner: 'rfl-designer', name: 'concilliun-crm' }), 42)).toBe(
      'rfl-designer/concilliun-crm#42',
    );
  });

  it('PRs distintas e repos distintos geram chaves distintas (não vaza)', () => {
    const a = repo({ kind: 'github', owner: 'rfl-designer', name: 'concilliun-crm' });
    const b = repo({ kind: 'github', owner: 'rfl-designer', name: 'soloboard' });
    expect(prKey(a, 1)).not.toBe(prKey(a, 2));
    expect(prKey(a, 1)).not.toBe(prKey(b, 1));
  });

  it('local-only → null (sem PR remota)', () => {
    expect(prKey(repo({ kind: 'local-only' }), 1)).toBeNull();
  });
});

describe('checkedSet / checkedRecord — roundtrip modelo↔domínio', () => {
  it('estado persistido → set de paths', () => {
    const state: ReviewState = { checked: { 'a.php': true, 'b.php': true }, updatedAt: 'x' };
    expect(checkedSet(state)).toEqual(new Set(['a.php', 'b.php']));
  });

  it('set → mapa path→true', () => {
    expect(checkedRecord(new Set(['a.php', 'b.php']))).toEqual({ 'a.php': true, 'b.php': true });
  });

  it('vazio em ambos os sentidos', () => {
    expect(checkedSet({ checked: {}, updatedAt: '' })).toEqual(new Set());
    expect(checkedRecord(new Set())).toEqual({});
  });
});

describe('reviewProgress — agregado por camada e feature', () => {
  const tree = buildReviewTree([
    file('app/Contexts/Crm/Models/Contact.php'),
    file('app/Contexts/Crm/Actions/CreateContact.php'),
    file('app/Contexts/Crm/Services/ContactService.php'),
    file('composer.json'),
  ]);

  it('sem nada checado → tudo 0/total', () => {
    const p = reviewProgress(tree, new Set());
    expect(p.overall).toEqual({ reviewed: 0, total: 4 });
    const crm = p.contexts.find((c) => c.context === 'Crm');
    expect(crm?.progress).toEqual({ reviewed: 0, total: 3 });
  });

  it('marcar um arquivo agrega na camada e na feature', () => {
    const p = reviewProgress(tree, new Set(['app/Contexts/Crm/Models/Contact.php']));
    const crm = p.contexts.find((c) => c.context === 'Crm');
    expect(crm?.progress).toEqual({ reviewed: 1, total: 3 });
    const model = crm?.layers.find((l) => l.layer === 'model');
    expect(model?.progress).toEqual({ reviewed: 1, total: 1 });
    const action = crm?.layers.find((l) => l.layer === 'action');
    expect(action?.progress).toEqual({ reviewed: 0, total: 1 });
    expect(p.overall).toEqual({ reviewed: 1, total: 4 });
  });

  it('contagem da feature soma as camadas; total geral soma as features', () => {
    const p = reviewProgress(
      tree,
      new Set(['app/Contexts/Crm/Models/Contact.php', 'composer.json']),
    );
    const crm = p.contexts.find((c) => c.context === 'Crm');
    const semCtx = p.contexts.find((c) => c.context === null);
    expect(crm?.progress).toEqual({ reviewed: 1, total: 3 });
    expect(semCtx?.progress).toEqual({ reviewed: 1, total: 1 });
    expect(p.overall).toEqual({ reviewed: 2, total: 4 });
  });

  it('contexts/layers saem na mesma ordem dos nós da árvore', () => {
    const p = reviewProgress(tree, new Set());
    expect(p.contexts.map((c) => c.context)).toEqual(tree.groups.map((g) => g.context));
    p.contexts.forEach((c, i) => {
      expect(c.layers.map((l) => l.layer)).toEqual(tree.groups[i].layers.map((l) => l.layer));
    });
  });
});
