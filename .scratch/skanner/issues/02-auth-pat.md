# 02 — Auth por PAT

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md`

## What to build

Autenticação por PAT, pedida **lazy** (ver [ADR 0005](../../../docs/adr/0005-entrada-cwd-primeiro-sem-registry.md)):
o launch nunca pede PAT; ele só é solicitado ao entrar na aba **PRs** (`[tab]`) sem um token
válido. Um prompt dentro da própria aba PRs onde o usuário cola o Personal Access Token. O app
valida chamando `GET /user` (Octokit) e, se válido, guarda-o num **arquivo `0600`** no diretório
de config (XDG), nunca no store JSON em texto plano. A UI reflete o estado autenticado (mostra o
usuário do GitHub). O token persiste entre reinícios. Token inválido/vazio mostra erro claro e
não persiste. Na aba PRs, o usuário pode **trocar/limpar** o PAT (não há tela de Settings global).

## Acceptance criteria

- [ ] O launch (Working diff) nunca pede PAT; só ao entrar em PRs sem token válido.
- [ ] Colar um PAT válido valida e mostra o usuário autenticado do GitHub.
- [ ] O token é guardado em arquivo `0600` (não no store `conf` em texto plano).
- [ ] Após reiniciar o app, sigo autenticado sem recolar o token.
- [ ] PAT inválido/vazio mostra erro e não persiste.
- [ ] Posso trocar/limpar o PAT dentro da aba PRs.
- [ ] O prompt documenta o escopo mínimo necessário (`repo`).

## Blocked by

- `.scratch/skanner/issues/01-scaffold.md`
