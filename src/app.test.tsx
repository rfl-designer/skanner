import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { App } from './app.js';

describe('App', () => {
  it('renderiza título e linha de ajuda no frame inicial', () => {
    const { lastFrame, unmount } = render(<App />);

    expect(lastFrame()).toContain('Skanner');
    expect(lastFrame()).toContain('[g] resolver raiz do repo');

    unmount();
  });
});
