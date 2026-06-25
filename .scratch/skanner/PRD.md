# PRD — Skanner (v1)

> App desktop pessoal para revisar PRs de repositórios Laravel/Livewire,
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
aprendizado em TypeScript/React/desktop (vindo de PHP/Laravel).

## 2. Não-objetivos (v1)

- **Sem IA / análise automática.** O app não opina sobre o código; só organiza e exibe.
- **Sem escrever no GitHub.** Não comenta, não aprova, não faz request changes. Read-only.
- **Sem multi-usuário / deploy.** Roda na máquina do dono.
- **Sem GitLab/Bitbucket.** Só GitHub.
- Nenhuma relação com a skill `pr-diff-review` (que gera MDX no any-doc). São produtos distintos.

## 3. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Shell desktop | **Electron** | Uma linguagem só (TS ponta a ponta); momentum sobre Tauri/Rust |
| UI | **React + TypeScript** | Aprendizado transferível; ecossistema |
| Build/scaffold | **electron-vite** | Vite + HMR + Electron prontos |
| Estilo | **Tailwind CSS** | Baixa fricção; igual ao any-doc |
| GitHub | **Octokit + Personal Access Token** | Autocontido (sem dep. de `gh`); funciona empacotado; ensina API |
| Segredo | **`safeStorage`** (Electron) | Guarda o PAT no keychain do SO |
| Persistência | **electron-store** (JSON) | Volume pequeno (repos, settings, checklist); zero setup |
| Render de diff | **react-diff-view** | Parse + render + highlight em React; não reinventa o widget |

### Arquitetura Electron

- **Main process (Node):** toda chamada ao GitHub (Octokit), leitura/escrita do PAT
  (`safeStorage`) e do `electron-store`. Nada de segredo no renderer.
- **Renderer (React):** UI pura; fala com o main via **IPC** (`ipcRenderer.invoke` /
  `ipcMain.handle`) através de um `preload` com `contextBridge`.
- Contrato IPC mínimo: `repos.list/add/remove`, `prs.list(repo)`, `pr.diff(repo, number)`,
  `auth.setToken/hasToken`, `review.getState/setState(prKey)`.

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

- **Auto-detecção:** ao cadastrar (e ao atualizar), o skanner verifica se o diretório
  modular base (default `app/Contexts/`, configurável) existe no repo.
  - Existe → perfil **`modular`** → agrupa **Feature → Camada** (seção 4.1).
  - Não existe → perfil **`flat`** → ver hierarquia abaixo.
- **Override manual:** o perfil detectado pode ser corrigido no cadastro do repo (incl. o
  diretório base modular).

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

## 5. Modelo de dados local (electron-store)

```
{
  "token": "<no safeStorage, não aqui>",
  "repos": [ {
    "owner": "rfl-designer", "name": "concilliun-crm", "addedAt": "...",
    // owner/name são OPCIONAIS: repo "local-only" tem só localPath (sem GitHub).
    // Nesse caso a aba "PRs abertas" fica oculta; só "Working diff" funciona.
    "localPath": "/Volumes/rfl/Work/projects/concilliun-crm", // opcional; exigido p/ modo local
    "profile": "modular",          // "modular" | "flat" (auto-detectado, override manual)
    "modularBaseDir": "app/Contexts" // só relevante em modular; configurável
  } ],
  "review": {
    "<owner>/<name>#<pr>": {
      "checked": { "<path-do-arquivo>": true },
      "updatedAt": "..."
    }
  }
}
```

## 6. Telas e fluxo

1. **Onboarding / Settings** — colar o PAT (validado via `GET /user`); guardado no `safeStorage`.
2. **Repos** — lista de repos cadastrados; adicionar (`owner/name`) e remover.
3. **Lista de PRs** — para o repo selecionado: PRs abertas (`#`, título, autor, branch,
   +add/-del, data). Um repo por vez na v1.
4. **Review da PR** (núcleo):
   - Navegação fixa lateral: **Feature → Camada → Arquivo** (com contadores).
   - Conteúdo: arquivos na ordem da fatia, cada um renderizado com `react-diff-view`.
   - **Checklist:** checkbox por arquivo (e estado agregado por camada/feature) marcando
     "revisado"; persistido em `electron-store`. Scroll livre (não é modo guiado um-a-um).

## 6.5 Casos de borda e fallbacks (regras da v1)

**PRs / diffs grandes (#2)**
- A listagem de arquivos da PR usa o endpoint paginado do GitHub (300 arquivos/página) —
  paginar até o fim antes de agrupar.
- Quando o GitHub marca um arquivo como `truncated` (patch grande demais) ou o patch vem
  vazio: renderizar o cabeçalho do arquivo com badge **"diff truncado"** + link pro arquivo
  no GitHub, **sem** corpo. Não travar a tela tentando renderizar.
- Arquivo individual acima de um teto de linhas (ex.: > 1500 linhas de patch): renderizar
  **colapsado por padrão**, expande sob clique (protege o `react-diff-view`).

**Tipos de arquivo no diff (#3)**
- **Binário:** uma linha de status (`+/-`, "binário") sem corpo de diff.
- **Renomeado:** mostrar `old → new` no cabeçalho; corpo só se houver mudança de conteúdo.
- **Deletado / criado:** badge claro; criado entra como bloco todo-adições.

**Estados de erro/vazio (#3)**
- **Sem PAT / PAT inválido** (`401`): manda pra tela de Settings com mensagem clara.
- **Sem rede / timeout:** estado de erro com botão "tentar de novo"; não quebra a navegação.
- **Rate limit** (`403` + headers): mostra quando reseta; não fica em loop de retry.
- **Repo sem PRs abertas / PR sem arquivos:** estado vazio explícito, não tela em branco.

**PAT:** escopo mínimo `repo` (cobre repos privados da frota). Documentar na tela de Settings.

## 7. Critérios de aceite (v1)

- [ ] Colo um PAT, ele é validado e guardado no keychain; ao reabrir o app, sigo logado.
- [ ] Cadastro `rfl-designer/concilliun-crm` e vejo suas PRs abertas.
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
- [ ] Posso corrigir o perfil/diretório base no cadastro se a auto-detecção errar.
- [ ] Uma PR com diff truncado, binário e arquivo renomeado renderiza sem travar (badges,
      sem corpo onde não há).
- [ ] PAT inválido leva pra Settings; sem rede mostra erro com retry; repo sem PR mostra
      estado vazio.

## 8. Riscos e pontos em aberto

- **Ponte por nome com colisão** (dois contextos candidatos casam o mesmo nome): na v1,
  empate → "Sem contexto" (não chuta). Reavaliar se acontecer na prática.
- **Variações de path entre repos** (`tests/Feature/Actions/<Ctx>` vs outros layouts):
  validado só no concilliun-crm; ao adicionar outro repo modular, conferir as regras.
- **Empacotamento Electron** (ícones, auto-update, assinatura) fora do escopo da v1;
  rodar via `electron-vite` em dev é suficiente para "uso diário" inicial.

## 9. Decisões registradas (do grilling)

Núcleo = visualizador desktop (não IA, não a skill) · Electron+React+TS+Vite ·
organização por feature→camada · atribuição path-first + ponte-por-nome-na-PR + balde
"Sem contexto" · ordem de camadas canônica fixa · Octokit+PAT no safeStorage via IPC ·
electron-store · react-diff-view · v1 read-only + checklist local.
