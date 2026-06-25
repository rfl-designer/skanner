# 09 — Cache e frescor da lista de PRs (backlog)

Status: ready-for-human

## Parent

`.scratch/skanner/PRD.md`

## What to build

Cachear a lista de PRs por repo (store `conf`) para abertura instantânea, revalidando em
segundo plano (stale-while-revalidate) e usando ETag/`If-None-Match` do GitHub para não gastar
rate limit à toa. Mostrar indicador de "atualizado há X" e permitir refresh forçado.

## Acceptance criteria

- [ ] Reabrir um repo mostra a lista cacheada na hora e revalida em segundo plano.
- [ ] Requisições condicionais (ETag) evitam recontar rate limit quando nada mudou.
- [ ] Indicador de frescor visível; refresh forçado disponível.

## Blocked by

- `.scratch/skanner/issues/04-pr-list.md`
