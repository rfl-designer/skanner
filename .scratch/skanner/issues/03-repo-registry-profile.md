# 03 — Resolver repo do cwd + perfil

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md` · [ADR 0005](../../../docs/adr/0005-entrada-cwd-primeiro-sem-registry.md)

## What to build

Resolução do repo a partir do **cwd** (cwd-primeiro — não há cadastro nem lista de repos).
`repo.resolveFromCwd()`:

- Acha a raiz do repo com `git rev-parse --show-toplevel`. Se o cwd não estiver num repo git →
  **erro fatal** claro ("não é um repo git").
- Deriva `owner/name` de `git remote get-url origin` (parseia ssh e https do GitHub). Sem
  `origin` ou remote não-GitHub → repo **local-only** (sem `owner/name`); múltiplos remotes →
  prefere `origin`.
- **Auto-detecta o perfil** pelo filesystem da raiz: `modular` se o diretório base modular
  (default `app/Contexts`, configurável) existir, senão `flat`.
- Aplica os **overrides** do mapa `path → { profile, modularBaseDir, owner, name }` (store
  `conf`) por cima do auto-detectado. O override de perfil/baseDir é corrigido **inline** (`[m]`,
  issue 11); o `owner/name` de fallback é pedido lazy na aba PRs (issue 02).

Sem `repos.add/remove/list`, sem tela Repos, sem `localPath` cadastrado — o `localPath` é a
própria raiz do cwd.

## Acceptance criteria

- [ ] `skanner` num repo git resolve a raiz (mesmo rodado de uma subpasta) e abre direto.
- [ ] Fora de um repo git → erro fatal claro, sem stacktrace cru.
- [ ] `owner/name` é derivado do `git remote origin` (ssh e https); sem GitHub → local-only.
- [ ] `concilliun-crm` é detectado como `modular`; `soloboard` como `flat`.
- [ ] Um override de perfil/`modularBaseDir` no mapa sobrescreve o auto-detectado e persiste por path.
- [ ] Nenhuma escrita de lista de repos no `conf` — só overrides quando há correção.

## Blocked by

- `.scratch/skanner/issues/01-scaffold.md`
