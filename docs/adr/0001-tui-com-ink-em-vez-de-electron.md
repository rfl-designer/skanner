# ADR 0001 — TUI no terminal (Ink) em vez de app desktop (Electron)

Status: aceito · 2026-06-25

## Contexto

O Skanner foi especificado (PRD v1) como app **desktop** em Electron + React + TS + Vite +
Tailwind: dois processos (main/renderer) com contrato **IPC**, PAT no keychain via
`safeStorage`, persistência em `electron-store` e render de diff com `react-diff-view`.

Nada do app foi construído ainda — só existem PRD, issues e as lições de aprendizado
(0001–0003). O dono trabalha o dia inteiro no fluxo **terminal/tmux** e gostou da experiência
de revisão tipo **neogit** (neovim), apesar do lag percebido naquela ferramenta.

O "coração" do produto (PRD §4: `categorize(path)`, `resolveContext(...)` e a árvore
`Feature → Camada → [Arquivos]`) é **agnóstico de UI** — não depende de Electron nem do DOM.

## Decisão

Mudar o alvo de **app desktop (Electron)** para **TUI no terminal**, com a stack:

- **UI:** Ink (React + TypeScript) — `<Box>`/`<Text>`, flexbox, hooks.
- **Execução:** processo único Node; sem split main/renderer e **sem IPC**. A UI chama
  Octokit e o filesystem direto, via módulos de serviço tipados.
- **Build/dev:** `tsx` (`--watch` para reload).
- **Persistência:** `conf` (JSON) — mesmo autor do electron-store, roda fora do Electron.
- **Segredo (PAT):** arquivo `0600` no diretório de config (XDG), em vez de `safeStorage`.
- **Render de diff:** próprio (unified) em Ink + highlight via `cli-highlight`, em vez de
  `react-diff-view`.
- **Distribuição:** publicação npm (`npx` / install global), em vez de empacotamento Electron
  (DMG, assinatura, auto-update).

## Consequências

**Positivas**
- Vive no fluxo tmux/terminal que o dono já usa; startup instantâneo; sem bundle de centenas de MB.
- Distribuição muito mais simples (`npx`) — a issue de empacotamento encolhe drasticamente.
- Aprendizado preservado: **TS a linguagem + React** (via Ink). O coração (§4) e as lições
  0001–0003 ficam intactos.
- Arquitetura mais simples: um processo, sem a fronteira IPC main↔renderer.

**Negativas / custos**
- **Render de diff é a maior incógnita de esforço:** não há widget pronto como `react-diff-view`
  no terminal; hunks são desenhados à mão. Risco de lag mora aqui (re-render de diff grande) —
  mitigado pelas defesas já no PRD §6.5 (colapsar > 1500 linhas, truncado sem corpo).
- Perde-se a lição de **fronteira IPC tipada** (main↔renderer) prevista na MISSION.
- PAT em arquivo `0600` é proteção mais fraca que o keychain do SO. `keytar`/keychain fica como
  opção futura se a permissão de arquivo não bastar.
- Side-by-side e highlight são mais limitados no terminal que no navegador.

## Alternativas consideradas

- **Manter Electron:** descartado — pesado, fora do fluxo do dono, e a lição de IPC não compensa
  o custo de packaging/desktop para uso single-user diário.
- **blessed/neo-blessed** em vez de Ink: descartado — API imperativa; Ink preserva o modelo
  React, alinhado à missão de aprender React.

## Referências

- `.scratch/skanner/PRD.md` §3 (stack), §9 ("Pivot registrado")
- `MISSION.md` (Why / Success / Out of scope)
- Issues afetadas: 01, 02, 03, 05, 07, 08, 09, 11, 12
