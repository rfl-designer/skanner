# 01 — Scaffold (esqueleto andante)

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md`

## What to build

O esqueleto andante do app: uma aplicação Electron com React + TypeScript + Tailwind,
gerada com electron-vite, com main process, preload (contextBridge) e renderer ligados.
Deve existir **um round-trip IPC demonstrável** ponta a ponta (o renderer chama uma ação,
o main responde, a UI mostra o resultado), provando que a espinha main↔renderer funciona.
HMR ativo em desenvolvimento.

## Acceptance criteria

- [ ] `npm run dev` abre uma janela com HMR funcionando.
- [ ] Um botão no renderer dispara uma chamada IPC tratada no main e a resposta aparece na tela.
- [ ] Classes Tailwind aplicam no renderer.
- [ ] O projeto compila em TS sem erros; runner de testes configurado com ao menos 1 teste passando.

## Blocked by

None - can start immediately.
