import { render } from 'ink';
import { App } from './app.js';
import { resolveFromCwd } from './services/repo.js';

// Entrada cwd-primeiro (ADR 0005): resolve o repo ANTES de montar a TUI. Fora de
// um repo git é erro fatal — mensagem limpa, sem stacktrace, sem abrir a tela.
try {
  const repo = await resolveFromCwd();
  render(<App repo={repo} />);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
