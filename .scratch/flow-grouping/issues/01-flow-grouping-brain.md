# 01 — Agrupamento por fluxo (laravel-brain)

Status: ready-for-agent

## Parent

`.scratch/flow-grouping/PRD.md`

## What to build

Para repos **flat**, agrupar por **fluxo de requisição** usando o grafo JSON do laravel-brain.
Ler o grafo do storage local do laravel-brain do repo (adaptador isolado, para absorver
mudanças de schema). Pré-computar a alcançabilidade nó→fluxos. Para cada arquivo alterado,
atribuir ao fluxo: alcançado por **um** fluxo tocado → sob ele; por **vários** → balde
**"Transversal"**; por **nenhum** → **"Sem fluxo"**. Ordenar por camada dentro de cada fluxo.
No modo local, oferecer botão **rescan** que roda `brain:scan`, avisando quando o scan está
desatualizado em relação aos arquivos alterados. Cair pro fallback só-por-camada quando não
há grafo disponível.

## Acceptance criteria

- [ ] Num repo flat com laravel-brain escaneado, um change-set agrupa por fluxo (ex.: um componente Livewire como ponto de entrada), camada dentro.
- [ ] Um Model alterado alcançado por 2+ fluxos cai em "Transversal", uma vez só.
- [ ] Arquivo não alcançado por nenhum fluxo cai em "Sem fluxo".
- [ ] O botão rescan (modo local) atualiza o JSON e o agrupamento reflete a camada nova.
- [ ] Sem grafo disponível, o repo flat cai graciosamente pro agrupamento só-por-camada.
- [ ] `resolveFlows()` coberto por testes com um grafo de exemplo.

## Blocked by

- `.scratch/skanner/issues/06-flat-layer-only.md`
- `.scratch/local-pre-commit-review/issues/01-working-diff-local.md`
