# ADR 0004 — Acesso ao GitHub via Octokit + Personal Access Token

Status: aceito · 2026-06-25

## Contexto

O Skanner precisa listar PRs abertas e buscar diffs do GitHub. Há três mecanismos viáveis de
acesso/autenticação, com tradeoffs diferentes — e a escolha interage com o pivot para TUI
([ADR 0001](0001-tui-com-ink-em-vez-de-electron.md)), que tirou de cena o `safeStorage` do
Electron.

Este ADR registra a escolha do **mecanismo de acesso**; *onde* o token é guardado (arquivo
`0600` no dir de config XDG) já está no ADR 0001.

## Decisão

**Octokit (SDK oficial do GitHub) + Personal Access Token**, com escopo mínimo `repo`.

- O PAT é colado uma vez na tela de Settings, validado via `GET /user`, e guardado em arquivo
  `0600` no diretório de config (ver [ADR 0001](0001-tui-com-ink-em-vez-de-electron.md)).
- As chamadas vivem em módulos de serviço Node tipados, invocados direto pela TUI (sem IPC).
- Paginação e requisições condicionais (ETag) ficam encapsuladas nesses módulos.

## Consequências

**Positivas**
- **Autocontido:** não depende do binário `gh` instalado/no PATH — relevante quando o app for
  distribuído via npm (`npx`/global), onde herdar o PATH do `gh` é frágil.
- Roda em Node puro; ensina integração de API de verdade (objetivo de aprendizado).
- Controle fino sobre paginação, mediaType de diff, ETag e rate limit.

**Negativas / custos**
- **PAT manual:** o usuário gera e cola o token (e o renova quando expira) — pior UX que um
  login OAuth "de verdade".
- **Proteção do segredo** é por permissão de arquivo `0600`, mais fraca que o keychain do SO
  (`keytar`/keychain fica como opção futura) — herdado do ADR 0001.
- Sem refresh automático de credencial (um PAT expirado exige recolar).

## Alternativas consideradas

- **Reusar o `gh` CLI** (shell out): zero código de auth e bom para SSO/refresh, mas exige
  `gh` instalado e sofre com PATH ao ser distribuído. Descartado para um app distribuível.
- **OAuth Device Flow:** login sem PAT manual e mais profissional, porém bem mais código para
  a v1. Adiado (pode ser revisitado se o atrito do PAT incomodar).

## Referências

- `.scratch/skanner/PRD.md` §3 (stack), §6 (fluxo de Settings)
- [ADR 0001](0001-tui-com-ink-em-vez-de-electron.md) (armazenamento do PAT em arquivo `0600`)
- Issue: `skanner/02-auth-pat`
