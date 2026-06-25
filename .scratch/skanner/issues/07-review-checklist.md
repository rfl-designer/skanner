# 07 — Checklist de review persistente

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md`

## What to build

Na review da PR, marcar arquivos (e agregado por camada/feature) como **revisados**. O estado
persiste por PR no electron-store e sobrevive a fechar/reabrir a PR. O progresso aparece na
navegação lateral.

## Acceptance criteria

- [ ] Posso marcar um arquivo como revisado; a camada/feature mostra progresso agregado.
- [ ] O estado persiste ao fechar e reabrir a PR.
- [ ] O estado é chaveado por repo+PR e não vaza entre PRs diferentes.

## Blocked by

- `.scratch/skanner/issues/05-review-grouped-modular.md`
