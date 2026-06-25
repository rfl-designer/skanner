# 11 — Navegação por teclado na review (backlog)

Status: ready-for-human

## Parent

`.scratch/skanner/PRD.md`

## What to build

Numa TUI o teclado é o modo primário: a navegação básica (próximo/anterior arquivo) já nasce
no núcleo (issue 05). Esta issue cobre o **conjunto rico** de atalhos: próximo/anterior grupo
(feature/fluxo/camada), marcar arquivo como revisado, colapsar/expandir diff, foco na
navegação lateral, e uma folha de atalhos acessível (ex.: tecla `?`).

Inclui os atalhos do modelo cwd-primeiro ([ADR 0005](../../../docs/adr/0005-entrada-cwd-primeiro-sem-registry.md)):
`[tab]` alterna Working diff ↔ PRs; `[m]` alterna o perfil `modular`/`flat` no cabeçalho (e
edita o `modularBaseDir`); `[r]` recarrega o snapshot do Working diff; `[q]` sai.

## Acceptance criteria

- [ ] Navego entre arquivos e grupos por teclado (próximo/anterior).
- [ ] Marco "revisado" por teclado.
- [ ] `[tab]` alterna entre Working diff e PRs; `[r]` recarrega o Working diff; `[q]` sai.
- [ ] `[m]` alterna o perfil e edita o `modularBaseDir` inline.
- [ ] `?` mostra a lista de atalhos.

## Blocked by

- `.scratch/skanner/issues/07-review-checklist.md`
