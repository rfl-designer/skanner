import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRepoRoot } from './repo.js';

describe('getRepoRoot', () => {
  it('resolve a raiz absoluta do repo git (que contém package.json)', async () => {
    const root = await getRepoRoot();

    expect(isAbsolute(root)).toBe(true);
    expect(existsSync(join(root, 'package.json'))).toBe(true);
  });
});
