import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocka o chokidar: o watcher é um EventEmitter falso que o teste dirige à mão.
// `vi.useFakeTimers` controla o debounce. Sem fs nem watcher real.
const { watchMock, fakeWatcher } = vi.hoisted(() => {
  const handlers: Array<(event: string, path: string) => void> = [];
  const fakeWatcher = {
    on: vi.fn((event: string, cb: (event: string, path: string) => void) => {
      if (event === 'all') handlers.push(cb);
      return fakeWatcher;
    }),
    close: vi.fn(() => Promise.resolve()),
    emit: (path: string) => handlers.forEach((h) => h('change', path)),
    reset: () => {
      handlers.length = 0;
    },
  };
  const watchMock = vi.fn(() => fakeWatcher);
  return { watchMock, fakeWatcher };
});
vi.mock('chokidar', () => ({ default: { watch: watchMock } }));

import { watch } from './watch.js';

const REPO = '/repo';
const abs = (rel: string) => `${REPO}/${rel}`;

beforeEach(() => {
  vi.useFakeTimers();
  watchMock.mockClear();
  fakeWatcher.on.mockClear();
  fakeWatcher.close.mockClear();
  fakeWatcher.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watch — debounce + ignore (#15)', () => {
  it('rajada de N eventos vira UM onChange após o debounce (AC1)', () => {
    const onChange = vi.fn();
    const unsub = watch(REPO, onChange);

    for (let i = 0; i < 5; i++) fakeWatcher.emit(abs(`app/File${i}.php`));
    expect(onChange).not.toHaveBeenCalled(); // ainda dentro da janela

    vi.advanceTimersByTime(400);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('evento em diretório ignorado não dispara onChange (AC2)', () => {
    const onChange = vi.fn();
    const unsub = watch(REPO, onChange);

    fakeWatcher.emit(abs('node_modules/react/index.js'));
    fakeWatcher.emit(abs('vendor/autoload.php'));
    vi.advanceTimersByTime(400);

    expect(onChange).not.toHaveBeenCalled();
    unsub();
  });

  it('unsubscribe fecha o watcher e cancela o timer pendente', () => {
    const onChange = vi.fn();
    const unsub = watch(REPO, onChange);

    fakeWatcher.emit(abs('app/File.php'));
    unsub(); // antes do debounce expirar
    vi.advanceTimersByTime(400);

    expect(onChange).not.toHaveBeenCalled();
    expect(fakeWatcher.close).toHaveBeenCalledTimes(1);
  });
});
