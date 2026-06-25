# Progresso: base do sistema de tipos coberta (0001–0003)

Sessão 1 cobriu, em sequência, as três primeiras lições — fundação do sistema de tipos
ancorada na função `categorize` do Skanner.

- **0001** — union/literal types: tipo `Layer` (as 16 camadas) + assinatura tipada.
- **0002** — corpo de `categorize`: regra "primeira que casa vence", garantia de retorno total
  do compilador (ts 2366), e a fronteira **tipo (formato) × teste (comportamento)**.
- **0003** — `interface ChangedFile`, arrays `T[]`, e composição com `.map()` (string[] → ChangedFile[]).

**Sinal de engajamento (não é ainda "domínio comprovado"):** o usuário puxou ativamente os
fios plantados nas lições — perguntou sobre `const` vs `let`, e sobre exhaustiveness
(`never`/`assertNever`), pedindo inclusive uma analogia. Curiosidade que vai além do exposto.

**Pendente de evidência:** ainda não há confirmação de exercícios da Playground feitos nem de
quizzes respondidos. Antes de marcar o **checkpoint formal** rumo à issue 01 (ver mapa em
[[MISSION.md]]), pedir/observar essa evidência — idealmente o usuário escrevendo `categorize`
+ `ChangedFile[]` sozinho e provando com `expectLayer`.

**Próximo (0004):** agrupar `ChangedFile[]` em `Feature → Camada` (a árvore do §4 do PRD) —
provável veículo para `Record<Layer, ...>` e a primeira modelagem de estrutura aninhada.
Depois disso: módulos (`import`/`export`) + rodar via `tsc`/`npm` = checkpoint 4 → issue 01.
