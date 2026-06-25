# 12 — Distribuição via npm (backlog)

Status: ready-for-human

## Parent

`.scratch/skanner/PRD.md`

## What to build

Empacotar o app para distribuição como CLI Node: `bin` com shebang, build de TS para dist,
campos de publicação no `package.json` e versionamento. Até aqui a v1 roda em dev (`tsx`);
esta issue torna o skanner instalável (`npm i -g` / executável via `npx`) e atualizável por
versão. (Distribuição standalone — ex.: binário único — fica como opção futura, fora da v1.)

## Acceptance criteria

- [ ] `npx skanner` (ou install global) sobe a TUI a partir do pacote publicado.
- [ ] `package.json` tem `bin`, build de dist e metadados de publicação corretos.
- [ ] Bump de versão publica e o usuário atualiza com o gestor de pacotes (sem auto-update próprio).

## Blocked by

- `.scratch/skanner/issues/05-review-grouped-modular.md`
