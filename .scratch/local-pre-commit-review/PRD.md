# PRD — Skanner · Revisão local pré-commit (modo "Working diff")

> Segunda feature do Skanner. Reusa o motor de agrupamento feature→camada, mas troca a
> fonte de dados: em vez da API do GitHub, lê o **diff local ainda não commitado** —
> a camada que o agente acabou de produzir — pra você dar o OK antes do commit.

Status: ready-for-human (PRD destilado do grilling; pendente quebra em issues)
Relacionado: `.scratch/skanner/PRD.md` (modo remoto — review de PRs do GitHub)

## 1. Contexto e motivação

Fluxo de trabalho do dono:

1. Planeja/grilling a issue no Claude.
2. **Desenvolve em camadas**: a cada camada o agente para; o dono revisa o diff e dá o OK.
3. O **agente** gera o commit daquela camada e segue para a próxima.

Hoje o passo 2 ("ver o diff") acontece no terminal/IDE, plano, fora da ordem da fatia.
Esta feature faz o Skanner ser **a tela onde você lê o diff da camada antes do commit**,
agrupado na mesma lógica de fatia vertical.

## 2. O que muda em relação ao modo remoto

| Aspecto | Modo remoto (PR) | **Modo local (esta feature)** |
|---|---|---|
| Fonte | Octokit (GitHub) | **`simple-git`** (repo local) |
| Escopo | PR inteira (todas as camadas) | **Change-set não-commitado (1 camada)** |
| Dimensão dominante | Feature → Camada | **Feature** (camada é fixa por gate) |
| Checklist | persistente (`conf`) | **efêmero/opcional** (some após o commit) |
| Escrita | nenhuma | nenhuma |

## 3. Escopo da feature

### Inclui
- Cada repo cadastrado ganha um **caminho local opcional**.
- Tela do repo com duas abas: **"PRs abertas"** (já existente) e **"Working diff"** (nova).
- Na aba Working diff: botão **Atualizar** (refresh manual) que lê o estado git e renderiza
  o diff agrupado.
- **Diff = tudo fora do último commit**: staged + unstaged + **arquivos novos (untracked)**.
  (A migration nova é untracked e é a primeira coisa da camada — não pode sumir.)
  **Untracked é renderizado sintetizando o bloco de adição** a partir do conteúdo do arquivo
  (lê o arquivo e monta o diff todo-adições) — **sem** `git add -N`, **sem tocar o index**
  do usuário. Decisão fechada.
- **Rótulo de camada** detectado: roda `categorize()` sobre os arquivos do change-set e
  exibe a(s) camada(s) presentes no topo (ex.: "Camada: Migration").
- **Agrupamento respeita a hierarquia de estratégia** (ver `skanner/PRD.md` §4.0): `modular`
  → por contexto (path); `flat` + grafo laravel-brain → **por fluxo** (o modo local é onde o
  rescan roda; ver `flow-grouping/PRD.md`); `flat` sem grafo → só por camada. O escopo é o
  change-set não-commitado (em vez da PR).
- **Casos de borda** reusam as regras de `skanner/PRD.md` §6.5 (binário → linha de status;
  renomeado → `old → new`; deletado/criado → badge; diff gigante → colapsado).
- **Change-set vazio** (nada fora do último commit): estado vazio explícito
  ("nada para revisar — tudo commitado"), não tela em branco.

### Não inclui (v1)
- **Sem integração com o agente.** Skanner não aprova, não sinaliza, não commita.
  O OK continua sendo dado **no chat do Claude** ("ok, pode commitar"). O agente gera o commit.
- Sem auto-watch (refresh é manual). Watcher fica para depois.
- Sem persistência de estado de review no modo local.

## 4. Decisões técnicas

- **`simple-git`** no processo Node para: detectar o root do repo, listar status (incl.
  untracked) e produzir o diff. **Untracked é sintetizado como bloco todo-adições lendo o
  conteúdo do arquivo — sem `git add -N`, sem tocar o index** (decisão fechada).
- Novo módulo de serviço tipado `local.diff(repoPath)` (chamado direto pela TUI, sem IPC) →
  retorna a mesma estrutura de diff que o modo remoto consome, para o agrupador e o render de
  diff não saberem a origem.
- Reuso integral de `categorize(path)` e `resolveContext(file, scopeContextSet)`.

## 5. Fluxo de uso

1. Agente termina uma camada e para ("camada X pronta").
2. No Skanner, aba **Working diff** do repo → **Atualizar**.
3. Skanner mostra: rótulo da camada + arquivos agrupados por feature, na ordem da fatia,
   cada um renderizado como diff unified no terminal (Ink + `cli-highlight`).
4. Dono revisa. Se OK, volta ao chat e diz "pode commitar". Agente commita e segue.

## 6. Critérios de aceite (v1)

- [ ] Associo um caminho local a um repo cadastrado.
- [ ] Com mudanças não-commitadas (incl. uma migration nova/untracked), clico Atualizar e
      vejo **todas** elas — arquivos novos inclusive.
- [ ] O topo mostra a camada detectada do change-set; abaixo, agrupado por feature.
- [ ] Nada é escrito no repo (nem commit, nem stage permanente que altere a intenção do dono).
- [ ] `local.diff` produz a mesma estrutura que o modo remoto (agrupador agnóstico à fonte).

## 7. Riscos e pontos em aberto

- **Change-set multi-camada**: se o agente produzir mais de uma camada antes do gate, o
  rótulo mostra todas as camadas presentes e o agrupamento volta a ser feature→camada
  (igual ao remoto). É degradação graciosa, não erro.

### Decisões fechadas (antes em aberto)

- **Untracked**: sintetiza o bloco de adição a partir do conteúdo do arquivo, **sem tocar o
  index** (sem `add -N`). Ver §3.
- **Repo local-only**: o cadastro **permite** repo só com caminho local (sem `owner/name`).
  Nesse caso a aba "PRs abertas" fica oculta e só "Working diff" funciona. Ver
  `skanner/PRD.md` §5 (campos opcionais) e a issue de cadastro.

## 8. Decisões registradas (do grilling)

Feature local do skanner · fonte = git local via `simple-git` · diff = tudo fora do último
commit (staged+unstaged+untracked) · escopo = uma camada por gate, agrupa por feature ·
skanner é só visor (OK no chat, agente commita) · refresh manual · aba "Working diff" por
repo · reusa `categorize()`/`resolveContext()` · checklist efêmero.
