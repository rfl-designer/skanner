# 02 — Fluxo no modo remoto (clone + scan) (backlog)

Status: ready-for-human

## Parent

`.scratch/flow-grouping/PRD.md`

## What to build

Habilitar o agrupamento por fluxo também no **modo remoto** (review de PR do GitHub) quando o
repo não commita o JSON do laravel-brain: clonar/atualizar o repo no ref da PR num cache
local, rodar `composer install` + `brain:scan`, e consumir o grafo resultante. Pesado — por
isso é opt-in por repo, com cache e indicação de custo/progresso.

## Acceptance criteria

- [ ] Para um repo flat opt-in, abrir uma PR remota agrupa por fluxo usando um scan gerado a partir do ref da PR.
- [ ] O clone/scan é cacheado e reaproveitado entre PRs do mesmo repo.
- [ ] Sem opt-in (ou se o scan falhar), cai graciosamente para o fallback só-por-camada.

## Blocked by

- `.scratch/flow-grouping/issues/01-flow-grouping-brain.md`
