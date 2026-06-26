import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake do child_process: um EventEmitter com stdout/stderr emissores e um stdin
// que captura o prompt — driblamos os eventos close/error nos testes.
class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { end: vi.fn() };
}

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

import { generate } from './commit-message.js';

let child: FakeChild;

beforeEach(() => {
  child = new FakeChild();
  spawn.mockReset();
  spawn.mockReturnValue(child);
});

describe('commit-message.generate', () => {
  it('invoca claude -p --output-format text e escreve o prompt no stdin', async () => {
    const p = generate({ prompt: 'PROMPT' });
    child.stdout.emit('data', Buffer.from('miolo da mensagem'));
    child.emit('close', 0);
    expect(await p).toEqual({ kind: 'ok', message: 'miolo da mensagem' });
    expect(spawn).toHaveBeenCalledWith('claude', ['-p', '--output-format', 'text'], expect.anything());
    expect(child.stdin.end).toHaveBeenCalledWith('PROMPT');
  });

  it('apara o stdout', async () => {
    const p = generate({ prompt: 'x' });
    child.stdout.emit('data', Buffer.from('  com espaços  \n'));
    child.emit('close', 0);
    expect(await p).toEqual({ kind: 'ok', message: 'com espaços' });
  });

  it('exit 0 com saída vazia → failed', async () => {
    const p = generate({ prompt: 'x' });
    child.stdout.emit('data', Buffer.from('   '));
    child.emit('close', 0);
    expect(await p).toEqual({ kind: 'failed', reason: 'claude devolveu saída vazia' });
  });

  it('exit ≠ 0 → failed com o stderr', async () => {
    const p = generate({ prompt: 'x' });
    child.stderr.emit('data', Buffer.from('boom'));
    child.emit('close', 1);
    expect(await p).toEqual({ kind: 'failed', reason: 'boom' });
  });

  it('binário ausente (ENOENT) → failed amigável', async () => {
    const p = generate({ prompt: 'x' });
    child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));
    expect(await p).toEqual({ kind: 'failed', reason: 'claude não encontrado no PATH' });
  });

  it('abortado (AbortError) → failed: abortado', async () => {
    const p = generate({ prompt: 'x' });
    child.emit('error', Object.assign(new Error('aborted'), { name: 'AbortError' }));
    expect(await p).toEqual({ kind: 'failed', reason: 'abortado' });
  });

  it('falha ao iniciar o spawn → failed, sem rejeitar', async () => {
    spawn.mockImplementation(() => {
      throw new Error('nope');
    });
    expect(await generate({ prompt: 'x' })).toEqual({
      kind: 'failed',
      reason: 'não foi possível iniciar o claude',
    });
  });
});
