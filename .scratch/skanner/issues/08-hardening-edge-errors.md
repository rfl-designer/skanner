# 08 — Hardening: erros, vazios e diffs difíceis

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md`

## What to build

Tornar a review robusta a diffs reais e falhas. Paginar a lista completa de arquivos da PR.
Renderizar diff truncado como cabeçalho + link pro GitHub (sem corpo); arquivo gigante
colapsado por padrão; binário como linha de status; renomeado como `old → new`; criado/
deletado com badge claro. Tratar PAT inválido/ausente (→ Settings), sem rede (retry), rate
limit (mostra reset) e estados vazios (sem PRs / sem arquivos).

## Acceptance criteria

- [ ] Uma PR com diff truncado, binário e arquivo renomeado renderiza sem travar (badges, sem corpo onde não há).
- [ ] Uma PR com mais de 300 arquivos lista todos (paginação completa).
- [ ] PAT inválido leva pra Settings; sem rede mostra erro com retry; rate limit mostra quando reseta.
- [ ] Repo sem PRs / PR sem arquivos mostra estado vazio explícito.

## Blocked by

- `.scratch/skanner/issues/05-review-grouped-modular.md`
