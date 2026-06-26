import { describe, expect, it } from 'vitest';
import { IGNORED_DIRS, isIgnoredPath } from './watch.js';

describe('isIgnoredPath — ruído do auto-watch (AC2 / #15)', () => {
  it.each([
    ['.git no topo', '.git/config'],
    ['node_modules no topo', 'node_modules/react/index.js'],
    ['vendor no topo', 'vendor/autoload.php'],
    ['storage no topo', 'storage/logs/laravel.log'],
    ['vendor aninhado', 'packages/x/vendor/y.php'],
    ['node_modules aninhado', 'a/b/node_modules/c.js'],
  ])('%s → ignorado', (_label, path) => {
    expect(isIgnoredPath(path)).toBe(true);
  });

  it.each([
    ['migration', 'database/migrations/2026_01_01_create_users.php'],
    ['contexto modular', 'app/Contexts/Crm/Models/Lead.php'],
    ['blade', 'resources/views/welcome.blade.php'],
    ['arquivo na raiz', 'composer.json'],
    ['dir parecido mas não igual', 'app/storaged/keep.php'],
  ])('%s → não ignorado', (_label, path) => {
    expect(isIgnoredPath(path)).toBe(false);
  });

  it('normaliza separador do Windows', () => {
    expect(isIgnoredPath('packages\\x\\vendor\\y.php')).toBe(true);
  });

  it('expõe os diretórios ignorados como constante nomeada', () => {
    expect(IGNORED_DIRS).toEqual(['.git', 'node_modules', 'vendor', 'storage']);
  });
});
