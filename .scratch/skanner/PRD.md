# PRD — Skanner (v1)

> App de terminal (TUI) pessoal para revisar PRs de repositórios Laravel/Livewire,
> exibindo o diff agrupado como **fatia vertical**: por feature (contexto) e,
> dentro de cada feature, na ordem de construção das camadas (da migration aos testes).

Status: ready-for-human (PRD recém-destilado; pendente quebra em issues)

## 1. Visão

Hoje revisar uma PR no GitHub é uma lista plana de arquivos em ordem alfabética/path,
que não respeita o fluxo em que a feature foi construída. O Skanner reorganiza a PR
para que a leitura siga a **fatia vertical**: primeiro a migration que abre a feature,
depois model, DTOs, actions, … até os testes que a fecham — agrupado por feature quando
a PR toca mais de um contexto.

É uma ferramenta de **uso diário e pessoal**, single-user, e também um projeto de
aprendizado em TypeScript/React/terminal (vindo de PHP/Laravel). Roda no terminal — pensada
para o fluxo tmux/editor que o dono já usa.

## 2. Não-objetivos (v1)

- **Sem IA / análise automática.** O app não opina sobre o código; só organiza e exibe.
- **Sem escrever no GitHub.** Não comenta, não aprova, não faz request changes. Read-only.
- **Sem multi-usuário / deploy.** Roda na máquina do dono.
- **Sem GitLab/Bitbucket.** Só GitHub.
- Nenhuma relação com a skill `pr-diff-review` (que gera MDX no any-doc). São produtos distintos.

## 3. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Shell | **TUI no terminal (Node CLI)** | Vive no fluxo tmux/editor do dono; sem bundle pesado; startup instantâneo |
| UI | **Ink (React + TypeScript)** | React no terminal (`<Box>`/`<Text>`, flexbox, hooks); mantém o aprendizado de React |
| Build/scaffold | **tsx** | Roda TS direto, `--watch` para reload em dev; sem cadeia de bundler |
| Estilo | **Ink (flexbox) + chalk** | Layout e cor no terminal; sem CSS |
| GitHub | **Octokit + Personal Access Token** | Autocontido (sem dep. de `gh`); ensina API; roda em Node puro |
| Segredo | **Arquivo `0600` no dir de config** (XDG) | Sem `safeStorage` fora do Electron; permissão restrita guarda o PAT (keytar fica como opção futura) |
| Persistência | **`conf`** (JSON) | Mesmo autor do electron-store, mas roda fora do Electron; volume pequeno; zero setup |
| Render de diff | **próprio (unified) + highlight** | Sem `react-diff-view` no terminal; render de hunks em Ink, highlight via `cli-highlight` |

### Entrada (cwd-primeiro)

O Skanner abre no estilo `git`/neogit: `skanner` **sem argumentos**, dentro de um repo git,
sobe até a raiz (`git rev-parse --show-toplevel`) e abre **direto no Working diff** do
change-set. Rodar fora de um repo git é **erro fatal**. Não há tela de seleção de repo nem
cadastro manual: `owner/name` vem de `git remote get-url origin`, `localPath` é a raiz, e o
perfil é detectado pelo path. Tudo que é remoto (PAT, e `owner/name` quando o remote não
resolve) é pedido **lazy**, só ao entrar na aba PRs. Ver [ADR 0005](../../docs/adr/0005-entrada-cwd-primeiro-sem-registry.md).

### Arquitetura (processo único)

- **Um processo Node.** A TUI Ink chama Octokit, `simple-git`, lê/escreve o PAT (arquivo
  `0600`) e o store (`conf`) **direto** — não há split main/renderer nem IPC. Os tipos do
  domínio atravessam a fronteira app↔Node como assinaturas de função normais.
- **Camadas internas tipadas** (o que era o "contrato IPC" vira módulos de serviço chamados
  direto pela UI): `repo.resolveFromCwd()`, `prs.list(repo)`, `pr.diff(repo, number)`,
  `local.diff()`, `auth.setToken/hasToken`, `review.getState/setState(prKey)`.
- **Render adaptado ao terminal:** árvore de navegação e diff desenhados com Ink; entrada por
  teclado é o modo primário de navegação (não um extra).

## 4. O coração: agrupamento da PR em fatia vertical

Entrada: o diff unificado da PR (lista de arquivos alterados + hunks).
Saída: árvore `Feature → Camada → [Arquivos]` (repo modular) **ou** `Camada → [Arquivos]`
(repo flat), ordenada.

### 4.0 Perfil do repo (auto-detectado)

A frota é **mista**: alguns repos são modulares (`app/Contexts/<Ctx>/`, ex.: concilliun-crm,
regnt-ai), outros são Laravel **flat** (`app/Models`, `app/Actions`, … sem contexto no path,
ex.: soloboard, meta-uniplus). Nos flat **não há feature no path** — não dá pra agrupar por
feature sem chutar.

Por isso, cada repo tem um **perfil**, resolvido assim:

- **Auto-detecção:** ao abrir o repo (e ao recarregar), o skanner verifica se o diretório
  modular base (default `app/Contexts/`, configurável) existe na raiz do repo.
  - Existe → perfil **`modular`** → agrupa **Feature → Camada** (seção 4.1).
  - Não existe → perfil **`flat`** → ver hierarquia abaixo.
- **Override manual (inline):** o perfil aparece no cabeçalho da árvore e `[m]` alterna
  `modular`/`flat`; o `modularBaseDir` é editável junto do `[m]`. A correção é guardada no mapa
  `path → overrides` (§5). Não há tela de cadastro — ver [ADR 0005](../../docs/adr/0005-entrada-cwd-primeiro-sem-registry.md).

**Hierarquia de estratégia de agrupamento por repo:**

1. **`modular`** (achou `app/Contexts`) → `Feature → Camada`, feature = contexto pelo path (§4.1).
2. **`flat` + grafo laravel-brain disponível** → `Fluxo → Camada`, feature = ponto de
   entrada (rota / componente Livewire / command) pela cadeia de chamada real.
   **Especificado em `.scratch/flow-grouping/PRD.md`.**
3. **`flat` sem grafo** → `Camada` apenas (sem dimensão de feature).

A heurística de feature **por nome** (substantivo raiz) fica **fora da v1** — substituída
pela atribuição por fluxo (nível 2), que usa arestas reais em vez de chute.

A saída de todas as estratégias é a mesma forma: `<grupo> → Camada → [arquivos]`, onde
`<grupo>` é contexto, fluxo, ou ausente.

### 4.1 Resolver o contexto (feature) — apenas perfil `modular`

Em ordem de prioridade (primeira regra que casa vence):

1. **Path direto** — `app/Contexts/<Ctx>/…` → contexto = `<Ctx>`.
2. **Path de teste** — `tests/Feature/**/<Ctx>/…Test.php` → contexto = `<Ctx>`.
3. **Ponte por nome (dentro da PR)** — para arquivos sem contexto no path
   (migrations em `database/migrations/`, componentes em `app/Livewire/<Grupo>/`):
   extrai o "substantivo raiz" (ex.: `..._create_plans_table.php` → `plans`;
   `app/Livewire/Activities/Index.php` → `activities`) e casa, normalizado
   (singular/plural, case-insensitive), **apenas contra o conjunto de contextos já
   resolvidos pelas regras 1–2 nesta mesma PR**. Match único → atribui.
4. **Balde "Sem contexto"** — qualquer arquivo que não resolva vai para um grupo
   especial, exibido por último. (config, composer.json, CI, migrations órfãs, etc.)

> A regra 3 é segura porque a PR limita os candidatos a 2–3 contextos. Não há
> adivinhação global.

### 4.2 Resolver a camada de cada arquivo

Detecção por path/sufixo. **Tests é checado primeiro** (para `*ActionTest.php` não cair
em Actions). Mapa de camadas e **ordem de exibição fixa** dentro da feature:

1. Migration — `database/migrations/`
2. Model — `/Models/`, `database/factories/`, `*Factory.php`, `database/seeders/`, `*Seeder.php`
3. Enums — `/Enums/`, `*Enum.php`
4. DTOs — `/DTOs/`, `/Data/`, `*DTO.php`, `*Data.php`
5. Policies / Authorization — `/Policies/`, `/Authorization/`, `*Policy.php`
6. Actions — `/Actions/`, `*Action.php`
7. Services — `/Services/`, `*Service.php`
8. Jobs — `/Jobs/`, `*Job.php`
9. Events — `/Events/`, `*Event.php`
10. Listeners — `/Listeners/`, `*Listener.php`
11. Observers — `/Observers/`, `*Observer.php`
12. Notifications — `/Notifications/`, `*Notification.php`
13. Livewire — `app/Livewire/`, `*.blade.php` em `resources/views/livewire/`
14. Blade — `*.blade.php`, `resources/views/`
15. Tests — `/tests/`, `*Test.php`
16. Outros (dentro da feature) — auxiliares (`Support`, `Concerns`, `Exceptions`, `Ingestion`)

Camadas vazias são omitidas. A categorização vive numa função pura e testável
(`categorize(path)` + `resolveContext(file, prContextSet)`), isolada da UI.

## 5. Modelo de dados local (`conf`, JSON)

Sem lista `repos[]` navegável (ver [ADR 0005](../../docs/adr/0005-entrada-cwd-primeiro-sem-registry.md)):
o repo é resolvido do cwd a cada launch. Só persistem o **checklist** (modo remoto) e um mapa
**`path → overrides`** com as correções por repo (perfil, `modularBaseDir`, `owner/name` de
fallback quando o remote não resolve).

```
{
  "token": "<no arquivo 0600 do dir de config, não aqui>",
  "overrides": {
    "/Volumes/rfl/Work/projects/concilliun-crm": {   // chave = raiz do repo (git toplevel)
      "profile": "modular",          // override do auto-detectado: "modular" | "flat"
      "modularBaseDir": "app/Contexts", // só relevante em modular; configurável
      "owner": "rfl-designer",       // só preenchido quando o git remote não resolve (lazy, na aba PRs)
      "name": "concilliun-crm"
    }
  },
  "review": {
    "<owner>/<name>#<pr>": {         // checklist persiste só no modo remoto; efêmero no local
      "checked": { "<path-do-arquivo>": true },
      "updatedAt": "..."
    }
  }
}
```

## 6. Telas e fluxo

`skanner` (sem args) num repo git → abre **direto** no Working diff (§ Entrada). Não há tela de
seleção de repo. Tudo que é remoto é **lazy**, atrás da aba PRs.

1. **Working diff** (tela inicial) — change-set local (staged+unstaged+untracked) lido via
   `simple-git`, agrupado em fatia vertical. Snapshot no launch; `[r]` recarrega; `[q]` sai.
   Perfil no cabeçalho, `[m]` alterna (incl. `modularBaseDir`). Checklist efêmero. `[tab]` → PRs.
2. **PRs abertas** (lazy) — ao entrar pela 1ª vez: se não houver PAT válido, pede o PAT
   (validado via `GET /user`, guardado em `0600`); se o `git remote` não resolver `owner/name`,
   pede uma vez e guarda. Gerencia o PAT aqui (trocar/limpar). Lista PRs abertas (`#`, título,
   autor, branch, +add/-del, data).
3. **Review da PR** — abre uma PR da lista:
   - Navegação lateral por teclado: **Feature → Camada → Arquivo** (com contadores).
   - Conteúdo: arquivos na ordem da fatia, cada um renderizado como diff unified no terminal
     (render próprio em Ink + highlight via `cli-highlight`).
   - **Checklist:** marca por arquivo (e estado agregado por camada/feature) de "revisado";
     persistido em `conf` (`owner/name#pr`). Scroll livre por teclado (não é modo guiado um-a-um).

## 6.5 Casos de borda e fallbacks (regras da v1)

**PRs / diffs grandes (#2)**
- A listagem de arquivos da PR usa o endpoint paginado do GitHub (300 arquivos/página) —
  paginar até o fim antes de agrupar.
- Quando o GitHub marca um arquivo como `truncated` (patch grande demais) ou o patch vem
  vazio: renderizar o cabeçalho do arquivo com badge **"diff truncado"** + a URL do arquivo
  no GitHub, **sem** corpo. Não travar a tela tentando renderizar.
- Arquivo individual acima de um teto de linhas (ex.: > 1500 linhas de patch): renderizar
  **colapsado por padrão**, expande sob tecla (evita re-render pesado no terminal — o risco
  de "travar" da TUI mora aqui).

**Tipos de arquivo no diff (#3)**
- **Binário:** uma linha de status (`+/-`, "binário") sem corpo de diff.
- **Renomeado:** mostrar `old → new` no cabeçalho; corpo só se houver mudança de conteúdo.
- **Deletado / criado:** badge claro; criado entra como bloco todo-adições.

**Entrada / repo (#3)**
- **Fora de um repo git:** erro fatal claro ("não é um repo git"), igual `git`.
- **`origin` ausente ou não-GitHub:** cai em **local-only** — a aba PRs pede `owner/name` ao
  ser aberta; o Working diff funciona normal. Múltiplos remotes → prefere `origin`.

**Estados de erro/vazio (#3)**
- **Sem PAT / PAT inválido** (`401`): pede o PAT na própria aba PRs (lazy), com mensagem clara.
- **Sem rede / timeout:** estado de erro com botão "tentar de novo"; não quebra a navegação.
- **Rate limit** (`403` + headers): mostra quando reseta; não fica em loop de retry.
- **Repo sem PRs abertas / PR sem arquivos:** estado vazio explícito, não tela em branco.

**PAT:** escopo mínimo `repo` (cobre repos privados da frota). Documentar na aba PRs (onde é pedido).

## 7. Critérios de aceite (v1)

- [ ] `cd` num repo git e rodo `skanner` (sem args) → abre direto no Working diff do change-set,
      sem tela de seleção. Fora de um repo git → erro fatal claro.
- [ ] `owner/name` é derivado do `git remote origin`; ao apertar `[tab]` (PRs), o PAT é pedido
      lazy, validado e guardado em `0600`. Reabrindo, sigo logado.
- [ ] Repo sem remote GitHub abre normal (Working diff); a aba PRs pede `owner/name` uma vez.
- [ ] Abro uma PR e vejo os arquivos **agrupados por contexto, depois por camada**, na
      ordem migration→tests.
- [ ] Uma migration `create_<x>_table` e um componente `app/Livewire/<X>/…` caem no mesmo
      contexto que o respectivo `app/Contexts/<X>/` **quando esse contexto está na PR**.
- [ ] Arquivos sem contexto resolvível aparecem em "Sem contexto", por último.
- [ ] Marco arquivos como revisados; o estado persiste ao fechar/reabrir a PR.
- [ ] Nenhuma escrita é feita no GitHub.
- [ ] `categorize()`/`resolveContext()` cobertos por testes unitários com casos reais do
      concilliun-crm.
- [ ] Um repo modular (concilliun) é detectado como `modular` e agrupa Feature→Camada; um
      repo flat (soloboard) é detectado como `flat` e agrupa só por Camada.
- [ ] Posso corrigir o perfil/diretório base inline (`[m]`) se a auto-detecção errar; persiste por path.
- [ ] Uma PR com diff truncado, binário e arquivo renomeado renderiza sem travar (badges,
      sem corpo onde não há).
- [ ] PAT inválido é repedido na própria aba PRs; sem rede mostra erro com retry; repo sem PR
      mostra estado vazio.

## 8. Riscos e pontos em aberto

- **Ponte por nome com colisão** (dois contextos candidatos casam o mesmo nome): na v1,
  empate → "Sem contexto" (não chuta). Reavaliar se acontecer na prática.
- **Variações de path entre repos** (`tests/Feature/Actions/<Ctx>` vs outros layouts):
  validado só no concilliun-crm; ao adicionar outro repo modular, conferir as regras.
- **Distribuição via npm** (`npx`/global install, versionamento) fora do escopo da v1;
  rodar via `tsx` em dev é suficiente para "uso diário" inicial.
- **Render de diff no terminal** é a peça sem widget pronto (não há `react-diff-view` na TUI):
  hunks desenhados à mão em Ink + highlight via `cli-highlight`. Maior incógnita de esforço.
- **PAT em arquivo `0600`** (não no keychain do SO): mais simples que `keytar` nativo;
  reavaliar `keytar`/keychain se a proteção por permissão de arquivo não bastar.

## 9. Decisões registradas (do grilling)

Núcleo = visualizador no terminal (não IA, não a skill) · TUI Ink (React+TS) em processo único ·
organização por feature→camada · atribuição path-first + ponte-por-nome-na-PR + balde
"Sem contexto" · ordem de camadas canônica fixa · Octokit+PAT em arquivo `0600` (chamado direto,
sem IPC) · `conf` · render de diff próprio (unified) + `cli-highlight` · v1 read-only + checklist local.

> **Pivot registrado:** alvo mudou de **app desktop (Electron+React+Vite+Tailwind, IPC main↔renderer,
> safeStorage, electron-store, react-diff-view)** para **TUI no terminal (Ink, processo único, `conf`,
> PAT em arquivo `0600`, render de diff próprio)**. Motivo: o dono trabalha no fluxo tmux/terminal e
> gostou da experiência tipo neogit; o "coração" (§4: `categorize`/`resolveContext` e a árvore
> Feature→Camada) é agnóstico de UI e não muda. Aprendizado preservado: TS + React (via Ink);
> abrimos mão da lição de fronteira IPC tipada em troca de um processo único mais simples.

> **Pivot registrado (entrada):** porta de entrada mudou de **registry-primeiro** (tela Repos,
> cadastro manual de `owner/name`, onboarding do PAT como 1ª tela) para **cwd-primeiro**
> (`skanner` no cwd abre direto no Working diff; `owner/name` do `git remote`; sem registry;
> PAT e `owner/name`-fallback pedidos lazy na aba PRs; perfil corrigido inline com `[m]`).
> Motivo: casa com o fluxo `git`/tmux e o Gate (revisar o change-set local antes do commit). O
> "coração" (§4) e os ADRs 0002–0004 ficam intactos. Ver [ADR 0005](../../docs/adr/0005-entrada-cwd-primeiro-sem-registry.md).
