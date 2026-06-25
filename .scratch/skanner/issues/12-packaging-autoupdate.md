# 12 — Empacotamento e auto-update (backlog)

Status: ready-for-human

## Parent

`.scratch/skanner/PRD.md`

## What to build

Empacotar o app para distribuição (electron-builder): ícones, artefato para macOS (DMG),
assinatura/notarização, e auto-update. Até aqui a v1 roda em dev (`electron-vite dev`); esta
issue torna o skanner um app instalável e atualizável.

## Acceptance criteria

- [ ] Gera um instalável para macOS com ícone próprio.
- [ ] App assinado/notarizado (ou caminho documentado para rodar sem assinatura).
- [ ] Auto-update funcional a partir de um canal de releases.

## Blocked by

- `.scratch/skanner/issues/05-review-grouped-modular.md`
