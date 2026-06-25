# 01 — Modo local "Working diff"

Status: ready-for-agent

## Parent

`.scratch/local-pre-commit-review/PRD.md`

## What to build

Cada repo cadastrado ganha um **caminho local** opcional e uma aba **"Working diff"** que,
sob refresh manual, lê **tudo que está fora do último commit** (staged + unstaged +
**arquivos novos/untracked**) via `simple-git` e renderiza agrupado conforme a estratégia do
repo (modular → contexto; flat → camada), com o **rótulo de camada** detectado no topo.
Read-only — nenhum commit, nenhum stage permanente que altere a intenção do usuário. Reusa o
motor de agrupamento e o render de diff (Ink + `cli-highlight`). **Arquivos untracked são renderizados sintetizando
o bloco de adição a partir do conteúdo do arquivo — sem `git add -N`, sem tocar o index.**
Funciona também para repo **local-only** (sem owner/name).

## Acceptance criteria

- [ ] Associo um caminho local a um repo cadastrado (ou uso um repo local-only).
- [ ] Com mudanças não-commitadas (incl. uma migration nova/untracked), o refresh mostra **todas** — arquivos novos inclusive.
- [ ] Untracked aparece via bloco de adição sintetizado; o `git status`/index do usuário **não** é alterado.
- [ ] A(s) camada(s) detectada(s) do change-set aparecem no topo; abaixo, agrupado pela estratégia do repo.
- [ ] Nada é escrito no repo.
- [ ] A fonte local produz a mesma estrutura de diff que a review remota consome (motor agnóstico à origem).
- [ ] Change-set vazio mostra estado explícito ("nada para revisar").

## Blocked by

- `.scratch/skanner/issues/03-repo-registry-profile.md`
- `.scratch/skanner/issues/05-review-grouped-modular.md`
