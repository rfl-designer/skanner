# NOTES — preferências e working notes

## Como o usuário quer aprender
- **Base de JS:** básica. Sabe se virar, nunca estudou a fundo. Pouco ES moderno
  (módulos, `async/await`, arrow). → Preencher buracos de JS *no momento* em que a lição
  encosta neles, sem assumir conhecimento prévio.
- **Vem de PHP/Laravel.** Usar pontes: type hints PHP ↔ tipos TS; backed enums ↔ union de
  literais; `interface`/contratos; namespaces ↔ módulos. A bagagem é ativo, não passivo.
- **Ancoragem:** cada lição constrói **uma peça real do Skanner**. Nada de `foo`/`bar`
  genérico — exemplos sempre do domínio (camadas, PRs, repos, paths Laravel).
- **Primeiro foco:** TypeScript *a linguagem* (sistema de tipos) antes de React/Electron.

## Decisões de sequência (zona de desenvolvimento proximal)
- Entrada pela função pura `categorize(path)` (§4.2 do PRD): pura, testável, sem Electron/
  React/async — ideal para quem tem JS básico e quer o sistema de tipos primeiro.
- Sequência provável: 0001 union/literal (`Layer`) → 0002 narrowing (decidir a camada por
  path, `if`/ordem) → 0003 arrays/objetos tipados (a árvore Feature→Camada→Arquivo) →
  depois `interface`/generics → só então React tipado → fronteira IPC tipada.

## Convenções do workspace
- Componentes compartilhados em `./assets/` (`styles.css`, `quiz.js`). Reuso é o padrão:
  ler `./assets/` antes de criar qualquer lição; nada de inline duplicado.
- Lições rodam **na Playground** enquanto não há scaffold do app. Quando a issue 01
  (scaffold) for feita, migrar a prática para o repo real com runner de testes.

## Fios plantados (revisitar quando o app pedir)
- **Garantir que uma lista cobre uma union inteira** (ex.: `LAYER_ORDER` com as 16 camadas,
  sem esquecer nenhuma). Resposta "Jeito 2" usa tipos condicionais + `Exclude` + `satisfies` +
  indexed access `(typeof x)[number]`. Adiado a pedido do usuário (0005) — vira lição própria de
  **tipos condicionais/utility types**, provavelmente depois de `resolveContext`.
