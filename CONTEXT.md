# CONTEXT — Skanner

Documento único de contexto (glossário / linguagem ubíqua). Quando qualquer artefato — PRD,
issue, ADR, nome de função, teste — nomear um conceito de domínio, **usar o termo como
definido aqui**, sem derivar para sinônimos.

Decisões arquiteturais vivem em [`docs/adr/`](docs/adr/). Visão e aprendizado: `MISSION.md`.

---

## Produto e modos

**Skanner** — App de terminal (TUI) pessoal, single-user, read-only, que reorganiza o diff de
uma PR como [fatia vertical](#fatia-vertical) para revisão. Não opina sobre o código (sem IA),
não escreve no GitHub. Veículo de aprendizado de TypeScript.

**Entrada cwd-primeiro** — O Skanner abre no estilo `git`/neogit: `skanner` **sem argumentos**,
dentro de um repo git, sobe até a raiz e abre direto no [modo local](#produto-e-modos). Fora de
um repo git é erro fatal. O repo se auto-identifica (sem cadastro): `owner/name` vem do `git
remote origin`, perfil pelo path. Ver [ADR 0005](docs/adr/0005-entrada-cwd-primeiro-sem-registry.md).

**Modo local** (*Working diff*) — A **tela inicial** e o uso primário: revisão do
[change-set](#change-set) ainda não-commitado de um repo local, antes do commit. Fonte do diff:
`simple-git`. *Sinônimo canônico:* "Working diff" (a aba) ou "modo local" (o conceito) — evitar
"modo git".

**Modo remoto** — Revisão de uma **PR** aberta do GitHub; aba secundária (`[tab]`), atrás do
[remoto lazy](#remoto-lazy). Fonte do diff: Octokit.

**Gate** — O momento em que o agente para após produzir uma camada e o dono revisa o
[change-set](#change-set) no Skanner antes de mandar commitar. O Skanner só **mostra**; o OK
volta pelo chat, o agente commita.

**PR** (Pull Request) — Unidade de revisão do [modo remoto](#produto-e-modos). Sempre só PRs
abertas na v1.

**Change-set** — Conjunto de mudanças fora do último commit (staged + unstaged + untracked) —
a unidade de revisão do [modo local](#produto-e-modos). Normalmente corresponde a **uma**
[camada](#camada).

---

## Agrupamento (fatia vertical)

**Fatia vertical** — Princípio organizador do Skanner: ler a mudança na ordem em que a feature
foi construída, atravessando as camadas de baixo pra cima (migration → … → tests), agrupada
por feature. Oposto da lista plana alfabética do GitHub. Ver [ADR 0002](docs/adr/0002-agrupamento-fatia-vertical-perfil-por-repo.md).

**Camada** (*Layer*) — Papel arquitetural de um arquivo no fluxo da feature. Conjunto fixo e
ordenado: Migration → Model → Enums → DTOs → Policies → Actions → Services → Jobs → Events →
Listeners → Observers → Notifications → Livewire → Blade → Tests → Outros. Resolvida por
[`categorize`](#funções-coração). *Evitar* "tipo de arquivo".

**Feature** / **Contexto** — A "fatia" do domínio à qual um arquivo pertence. Em repo
[modular](#perfil-do-repo) é o `<Ctx>` do path `app/Contexts/<Ctx>/`. Os dois termos são
intercambiáveis; preferir **Contexto** quando falando do repo modular e **Feature** quando
falando do conceito geral de agrupamento.

**Grupo** — Termo guarda-chuva para o nível superior da árvore de saída
`<grupo> → Camada → [arquivos]`. Um grupo é um [contexto](#feature--contexto), um
[fluxo](#fluxo), ou um dos baldes especiais ("Sem contexto", "Transversal", "Sem fluxo"), ou
ausente (flat sem grafo).

**Balde "Sem contexto"** — Grupo especial (repo modular) para arquivos que não resolvem a
nenhum contexto; exibido por último.

---

## Atribuição e perfis

**Perfil do repo** — Estratégia de agrupamento de um repo, auto-detectada pelo path (com
override manual **inline**, tecla `[m]` no cabeçalho da árvore): **`modular`** (existe o
[diretório base modular](#diretório-base-modular)) ou **`flat`** (não existe). O override é
persistido no [mapa de overrides](#mapa-de-overrides). Define a
[hierarquia de estratégia](#hierarquia-de-estratégia).

**Diretório base modular** — O diretório cuja existência marca o repo como `modular`. Default
`app/Contexts/`, configurável por repo.

**Hierarquia de estratégia** — A ordem de decisão do agrupamento: (1) `modular` →
`Feature → Camada`; (2) `flat` + [grafo](#grafo-do-laravel-brain) → `Fluxo → Camada`; (3)
`flat` sem grafo → `Camada` apenas. Ver [ADR 0002](docs/adr/0002-agrupamento-fatia-vertical-perfil-por-repo.md).

**Ponte por nome** (*name bridge*) — Atribuição de um arquivo sem contexto no path (migration,
componente Livewire) a um contexto, casando o "substantivo raiz" do nome **apenas contra os
contextos já tocados na mesma PR/change-set**. Empate → "Sem contexto" (não chuta). É segura
porque a PR limita o espaço de candidatos.

**Repo local-only** — Repo cujo `git remote origin` falta ou não é GitHub, então não resolve
`owner/name`. O [modo local](#produto-e-modos) funciona normal; ao abrir a aba PRs, o
`owner/name` é pedido uma vez (lazy) e guardado no [mapa de overrides](#mapa-de-overrides).

---

## Integração laravel-brain

**Fluxo** (*flow*) — A "feature" de um repo [flat](#perfil-do-repo): o [ponto de
entrada](#ponto-de-entrada) cuja cadeia de chamada real alcança o arquivo alterado. Derivado
do [grafo do laravel-brain](#grafo-do-laravel-brain), não de heurística de nome. *Evitar*
"request flow".

**Ponto de entrada** (*entry point*) — Origem de um [fluxo](#fluxo): uma rota, um componente
Livewire, um command, um channel ou um schedule. O rótulo legível do fluxo.

**Grafo do laravel-brain** — O JSON de análise estática gerado pelo `brain:scan` em
`storage/app/laravel-brain/`, com nós tipados (incl. `livewire_component`) e arestas de cadeia
de chamada. O Skanner **consome** esse grafo; não reimplementa análise estática. Ver
[ADR 0003](docs/adr/0003-integracao-laravel-brain-consumo-de-grafo.md).

**brainGraphAdapter** — Módulo isolado que traduz o schema do grafo do laravel-brain para o
modelo interno, absorvendo mudanças de versão (pin de versão).

**Rescan** — Rodar `brain:scan` (só no modo local) para atualizar o grafo antes de agrupar,
quando o scan está desatualizado em relação aos arquivos alterados.

**Balde "Transversal"** — Grupo especial para arquivo alcançado por **vários** fluxos (código
compartilhado); exibido uma vez só, separado.

**Balde "Sem fluxo"** — Grupo especial para arquivo não alcançado por nenhum fluxo do grafo.

---

## Funções-coração

Puras, agnósticas de UI e de fonte, testáveis isoladamente. São o "coração" do produto.

**`categorize(path)`** — Path do arquivo → [Camada](#camada).

**`resolveContext(file, scopeContextSet)`** — Arquivo + contextos tocados na PR →
[Contexto](#feature--contexto) (path-first + [ponte por nome](#ponte-por-nome)).

**`resolveFlows(file, graph)`** — Arquivo + [grafo](#grafo-do-laravel-brain) →
[fluxos](#fluxo) que o alcançam (para atribuir grupo / "Transversal" / "Sem fluxo").

---

## Stack e infraestrutura

**TUI** — Terminal UI; o formato do Skanner (não desktop). Ver [ADR 0001](docs/adr/0001-tui-com-ink-em-vez-de-electron.md).

**Ink** — React renderizado no terminal (`<Box>`/`<Text>`, flexbox, hooks). A UI do Skanner.

**tsx** — Runner que roda TypeScript direto (`--watch` em dev). Sem cadeia de bundler.

**Processo único** — Toda a lógica (TUI, Octokit, filesystem, store) num só processo Node,
chamada direto via módulos de serviço tipados. **Sem IPC, sem split main/renderer.**

**Módulo de serviço** — A fronteira tipada app↔Node (o que num app Electron seria o "contrato
IPC"): `repo.resolveFromCwd`, `prs.list`, `pr.diff`, `local.diff`, `auth.setToken/hasToken`,
`review.getState/setState`. Chamado direto pela UI.

**Remoto lazy** — Tudo que depende do GitHub (PAT e `owner/name`-fallback) só é pedido ao
entrar na aba PRs (`[tab]`), nunca no launch. O [modo local](#produto-e-modos) funciona com
zero setup (só precisa ser um repo git). Ver [ADR 0005](docs/adr/0005-entrada-cwd-primeiro-sem-registry.md).

**Octokit** — SDK oficial do GitHub; o cliente de API do [modo remoto](#produto-e-modos). Ver
[ADR 0004](docs/adr/0004-github-via-octokit-e-pat.md).

**PAT** (Personal Access Token) — Credencial do GitHub, escopo mínimo `repo`. Guardado em
**arquivo `0600`** no diretório de config (XDG), não no [store](#conf), não no keychain. Pedido
[lazy](#remoto-lazy) na aba PRs; gerenciado ali (trocar/limpar).

**`conf`** — O store JSON. Persiste só o [mapa de overrides](#mapa-de-overrides) e o estado do
checklist (modo remoto). **Sem lista de repos** — o repo vem do cwd. Roda fora do Electron.

**Mapa de overrides** — `path → { profile, modularBaseDir, owner, name }`: as correções por
repo (chave = raiz do git). Substitui o antigo cadastro de repos. `owner/name` só é gravado
quando o `git remote` não resolve. Ver [ADR 0005](docs/adr/0005-entrada-cwd-primeiro-sem-registry.md).

**Checklist de review** — Estado "revisado" por arquivo (agregado por camada/feature),
persistido no [`conf`](#conf) por PR no modo remoto; efêmero no [modo local](#produto-e-modos).

**Render de diff** — Desenho próprio de hunks unified no terminal (Ink) + highlight via
`cli-highlight`. Não há `react-diff-view` na TUI.
