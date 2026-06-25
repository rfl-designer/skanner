# 01 — Scaffold (esqueleto andante)

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md`

## What to build

O esqueleto andante do app: uma TUI em **Ink (React + TypeScript)**, rodada via **tsx**, em
**processo único** (sem main/renderer, sem IPC). Deve existir **um round-trip demonstrável**
ponta a ponta: a UI dispara uma ação que chama um módulo de serviço Node, e o resultado
aparece no terminal — provando a fronteira app↔Node tipada. Reload em dev via `tsx --watch`.

## Acceptance criteria

- [ ] `npm run dev` (`tsx --watch`) sobe a TUI no terminal e recarrega ao salvar.
- [ ] Uma tecla na UI dispara uma chamada a um módulo de serviço Node e a resposta aparece na tela.
- [ ] O layout usa componentes Ink (`<Box>`/`<Text>`, flexbox) e cor.
- [ ] O projeto compila em TS sem erros; runner de testes configurado com ao menos 1 teste passando.

## Blocked by

None - can start immediately.
