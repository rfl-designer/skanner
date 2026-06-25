# 02 — Auth por PAT

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md`

## What to build

Tela de Settings onde o usuário cola um Personal Access Token do GitHub. O main valida o
token chamando `GET /user` (Octokit) e, se válido, guarda-o no keychain do SO via
`safeStorage` (nunca em texto plano). O renderer reflete o estado autenticado (mostra o
usuário do GitHub). O token persiste entre reinícios — não precisa colar de novo. Token
inválido ou vazio mostra erro claro e não persiste.

## Acceptance criteria

- [ ] Colar um PAT válido valida e mostra o usuário autenticado do GitHub.
- [ ] O token é guardado via `safeStorage` (não em electron-store em texto plano).
- [ ] Após reiniciar o app, sigo autenticado sem recolar o token.
- [ ] PAT inválido/vazio mostra erro e não persiste.
- [ ] A tela documenta o escopo mínimo necessário (`repo`).

## Blocked by

- `.scratch/skanner/issues/01-scaffold.md`
