# 03 — Cadastro de repos + perfil

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md`

## What to build

Gestão dos repositórios acompanhados: adicionar (owner/name), listar e remover, persistindo
no electron-store. Ao adicionar (e sob demanda), o app **auto-detecta o perfil** do repo:
`modular` se o diretório base modular (default `app/Contexts`, configurável) existir na
árvore do repo (via Octokit), senão `flat`. O usuário pode **corrigir manualmente** o perfil
detectado e o diretório base. Também é possível cadastrar um repo **local-only** (só
`localPath`, sem `owner/name`) — nesse caso o perfil é detectado pelo sistema de arquivos e
as funcionalidades remotas (PRs) ficam ocultas.

## Acceptance criteria

- [ ] Adiciono um repo por owner/name; ele aparece na lista e persiste após reiniciar.
- [ ] `concilliun-crm` é detectado como `modular`; `soloboard` como `flat`.
- [ ] Posso sobrescrever manualmente o perfil e o diretório base modular.
- [ ] Posso associar um `localPath` a um repo; posso cadastrar um repo **local-only** (sem owner/name).
- [ ] Em repo local-only, o perfil é detectado pelo filesystem e a UI esconde as partes remotas.
- [ ] Posso remover um repo.

## Blocked by

- `.scratch/skanner/issues/02-auth-pat.md`
