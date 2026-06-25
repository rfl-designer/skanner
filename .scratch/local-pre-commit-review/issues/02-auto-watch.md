# 02 — Auto-watch do diff local (backlog)

Status: ready-for-human

## Parent

`.scratch/local-pre-commit-review/PRD.md`

## What to build

Observar a pasta do repo local (file watcher com debounce) para que o diff da camada apareça
sozinho quando o agente termina de escrever, sem o usuário clicar "atualizar". Deve ignorar
ruído de salvamentos intermediários e diretórios irrelevantes (`vendor/`, `node_modules/`,
`storage/`, etc.). Um toggle liga/desliga o auto-watch por repo; o refresh manual continua
existindo.

## Acceptance criteria

- [ ] Com auto-watch ligado, alterar arquivos no repo atualiza a aba Working diff sem clique (após debounce).
- [ ] Salvamentos em diretórios ignorados não disparam re-render.
- [ ] Posso ligar/desligar o auto-watch por repo; com ele desligado, vale o refresh manual.

## Blocked by

- `.scratch/local-pre-commit-review/issues/01-working-diff-local.md`
