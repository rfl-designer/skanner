import { defineConfig } from 'vitest/config';

// As views Ink (ink-testing-library) levam ~1–2s cada por causa do raw-mode +
// timers do terminal; sob carga paralela isso estoura o timeout padrão de 5s e
// gera flake. Um teto folgado mantém a suíte determinística sem mudar os testes.
export default defineConfig({
  test: {
    testTimeout: 30000,
  },
});
