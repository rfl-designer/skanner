# 06 — Fallback flat (só por camada)

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md`

## What to build

Para repo de perfil `flat` (sem diretório base modular e sem grafo de fluxo), agrupar a
mesma review **somente por Camada** — sem dimensão de feature — reusando o motor de camadas
e a ordem canônica. A saída compartilha a mesma forma `<grupo> → Camada → arquivos`, com o
grupo ausente.

## Acceptance criteria

- [ ] Abrir uma PR num repo flat (soloboard) agrupa os arquivos só por camada, na ordem migration→tests.
- [ ] A saída usa a mesma estrutura do modo modular (apenas sem o nível de grupo).
- [ ] Alternar entre um repo modular e um flat produz o agrupamento correto para cada um.

## Blocked by

- `.scratch/skanner/issues/05-review-grouped-modular.md`
