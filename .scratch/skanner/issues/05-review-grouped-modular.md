# 05 — Review agrupada (modular) — núcleo

Status: ready-for-agent

## Parent

`.scratch/skanner/PRD.md`

## What to build

Abrir uma PR e revisá-la como fatia vertical. Buscar os arquivos alterados + patches da PR,
categorizar cada arquivo numa **camada**, resolver seu **contexto** (path-first em
`app/Contexts/<Ctx>` e `tests/.../<Ctx>`, com ponte por nome da entidade **dentro da PR**
para migrations/Livewire), e renderizar a árvore **Feature → Camada → arquivos** como diff
unified no terminal (render próprio em Ink + highlight via `cli-highlight`), camadas na ordem
canônica e arquivos sem dono no balde **"Sem contexto"** (por último). Navegação por teclado
feature → camada → arquivo (próximo/anterior).

Esta é a fatia que faz nascer o motor compartilhado (`categorize()` + `resolveContext()`),
que as fatias seguintes reusam como adaptadores de fonte por cima.

## Acceptance criteria

- [ ] Abrir uma PR modular mostra arquivos agrupados por contexto, depois por camada, na ordem migration→tests.
- [ ] Uma migration `create_<x>_table` e um componente `app/Livewire/<X>` caem no mesmo contexto que `app/Contexts/<X>` quando esse contexto está na PR.
- [ ] Arquivos sem contexto resolvível aparecem em "Sem contexto", por último.
- [ ] Empate na ponte por nome (dois contextos candidatos) → "Sem contexto", sem chute.
- [ ] Cada arquivo renderiza seu diff (unified, com highlight) no terminal.
- [ ] `categorize()` e `resolveContext()` cobertos por testes unitários com casos reais do concilliun-crm.

## Blocked by

- `.scratch/skanner/issues/04-pr-list.md`
