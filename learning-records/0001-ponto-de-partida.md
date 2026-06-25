# Ponto de partida: JS básico, vindo de PHP/Laravel, ensino ancorado no Skanner

Estabelecido na abertura do workspace (sessão 1). Define o piso da zona de desenvolvimento proximal.

- **Base de JavaScript:** básica — sabe se virar, nunca estudou a fundo, pouco contato com ES
  moderno (módulos, `async/await`, arrow functions). Implicação: lições não podem assumir JS
  moderno; quando uma encostar nisso, preencher o buraco antes de seguir.
- **Bagagem forte:** PHP/Laravel. Usar como ponte (type hints, backed enums, interfaces,
  contratos) — acelera a intuição de tipos.
- **Estilo de ensino confirmado:** cada lição constrói uma peça real do Skanner; exemplos
  sempre do domínio (camadas, PRs, repos, paths Laravel). Sem `foo`/`bar`.
- **Sequência escolhida:** TypeScript *a linguagem* (sistema de tipos) antes de React/Electron.
  Entrada por `categorize(path)` (função pura, §4.2 do PRD) — sem Electron/React/async.

Implicação para as próximas sessões: 0002 = narrowing (decidir a camada por path, ordem das
regras); só introduzir `async`/módulos/React quando a construção do app genuinamente exigir,
e sempre com a ponte de JS feita na hora. Ver [[MISSION.md]].
