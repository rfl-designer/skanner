# ADR 0005 — Entrada cwd-primeiro, sem registry, remoto lazy

Status: aceito · 2026-06-25

## Contexto

O PRD v1 (§6) desenha o Skanner como um **hub multi-repo**: ao abrir, o app mostra a tela
**Repos** (lista de repositórios cadastrados manualmente com `owner/name` + `localPath`),
você seleciona um e navega *para dentro* dele. A primeira tela é o onboarding do PAT. O perfil
do repo (`modular`/`flat`) é corrigido "no cadastro do repo" (§4.0).

O dono trabalha o dia inteiro no fluxo **terminal/tmux** e usa o Skanner principalmente no
[modo local](../../CONTEXT.md) (Working diff), no momento do **Gate**: o agente para após uma
camada, o dono revisa o change-set e só então manda commitar. Nesse fluxo, o `git` já opera no
diretório atual — você `cd` num projeto e roda o comando, sem selecionar nada. O modelo
registry-primeiro contradiz esse hábito: faz você escolher um repo numa lista mesmo já estando
dentro de um.

## Decisão

Inverter a porta de entrada de **registry-primeiro** para **cwd-primeiro**, no estilo
`git`/neogit. Nada do app foi construído ainda — só PRD, issues e ADRs.

- **Entrada:** `skanner` **sem argumentos**, dentro de um repo git, sobe até a raiz
  (`git rev-parse --show-toplevel`) e abre **direto no Working diff** do change-set, em
  [fatia vertical](../../CONTEXT.md). Rodar **fora** de um repo git é **erro fatal** (igual
  `git`). A CLI não aceita outros argumentos na v1 (`cd` para trocar de repo).
- **Identidade sem cadastro:** `owner/name` é derivado de `git remote get-url origin` (ssh ou
  https). `localPath` é a raiz do repo; o perfil é detectado pelo path. Nenhum cadastro manual
  no caso comum.
- **Registry eliminado:** sem lista `repos[]` navegável, sem tela **Repos**, sem fluxo
  "adicionar/remover repo". Persiste apenas: o **checklist** (modo remoto, keyed por
  `owner/name#pr`) e um mapa **`path → overrides`** (perfil, `modularBaseDir`, `owner/name`
  manual de fallback).
- **Remoto é lazy:** o launch nunca pede nada — o Working diff funciona com zero setup (só
  precisa ser um repo git). O **PAT** e o **`owner/name`** (quando o remote não resolve) só são
  solicitados ao entrar na aba **PRs** (`[tab]`), uma vez cada, e guardados.
- **Sem remote GitHub:** repo git válido cujo `origin` falta ou não é GitHub cai em
  **local-only** — a aba PRs pede o `owner/name` ao ser aberta; o Working diff funciona normal.
  Múltiplos remotes → prefere `origin`.
- **Config contextual (sem tela global):** o perfil aparece no cabeçalho da árvore e `[m]`
  alterna `modular`/`flat`; o `modularBaseDir` é editável junto do `[m]`. O PAT é gerenciado
  dentro da aba PRs (trocar/limpar).
- **Working diff:** snapshot lido uma vez no launch + `[r]` para recarregar sob demanda. **Sem
  fs watcher** — o modelo é lança-por-Gate, revisa, `[q]` sai.

## Consequências

**Positivas**
- Casa com o hábito tmux/`git`: `cd` + `skanner`, sem seleção. O Gate fica sem atrito.
- Superfície muito menor: somem a tela Repos, o cadastro manual e a tela de Settings global.
  O app fica "sem chrome" — você está num repo, eis o diff.
- Zero setup para o uso primário (local). Todo o custo de configuração (PAT, owner/name) é
  diferido para quem realmente abre PRs.
- O "coração" (§4: `categorize`/`resolveContext`) e os ADRs 0002–0004 ficam **intactos** — só
  muda *como* o repo entra em cena, não como o diff é agrupado.

**Negativas / custos**
- O modo remoto (PRs) deixa de ser o "núcleo" do PRD e vira aba secundária — o centro de
  gravidade migra para o modo local.
- `owner/name` manual de fallback reintroduz um pouco de estado por-path (mas no mesmo mapa de
  overrides que já existia, não num registry navegável).
- Sem watcher, o Working diff não reflete mudanças automáticas — exige `[r]`. Aceitável no
  modelo lança-por-Gate.
- Perde-se a visão multi-repo de uma vez só (era um hub); revisar outro repo exige `cd`.

## Alternativas consideradas

- **Manter registry-primeiro (PRD original):** descartado — contradiz o fluxo `git`/tmux e
  obriga a selecionar um repo já estando dentro dele.
- **Híbrido (cadastro manual + atalho cwd coexistindo):** descartado — dois caminhos para a
  mesma coisa, mais superfície e código sem ganho para uso single-user.
- **CLI rica (`skanner <path>`, `skanner --pr N`):** adiada — o mínimo `skanner` (cwd) basta;
  path e pulo-pra-PR acoplam o launch ao remoto e adicionam bordas de parsing.
- **Watch ao vivo do filesystem:** descartado na v1 — re-render de diff no terminal é a maior
  incógnita de esforço (ADR 0001) e a árvore mudando no meio da leitura confunde.

## Referências

- `.scratch/skanner/PRD.md` §3 (arquitetura), §4.0 (perfil), §5 (modelo de dados), §6 (telas)
- `CONTEXT.md` (modo local, Gate, perfil do repo, ponte por nome)
- [ADR 0001](0001-tui-com-ink-em-vez-de-electron.md) (TUI/processo único; PAT em arquivo `0600`)
- [ADR 0004](0004-github-via-octokit-e-pat.md) (Octokit + PAT — onboarding agora lazy)
- Issues afetadas: 02-auth-pat (PAT lazy), 03-repo-registry-profile (registry eliminado),
  11-keyboard-nav (`[tab]`/`[m]`/`[r]`)
