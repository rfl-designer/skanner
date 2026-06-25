# PRD — Skanner · Agrupamento por fluxo (integração laravel-brain)

> Terceira feature do Skanner. Resolve o agrupamento por feature em repos **flat**
> (sem `app/Contexts`) usando o **fluxo real da requisição** — não heurística de nome.
> Consome o grafo de chamadas gerado pelo [laravel-brain](https://github.com/laramint/laravel-brain).

Status: ready-for-human (PRD destilado do grilling; pendente quebra em issues)
Relacionado: `.scratch/skanner/PRD.md` §4.0 (hierarquia de estratégia) · `.scratch/local-pre-commit-review/PRD.md`

## 1. Motivação

Em repos flat não há contexto no path, então "agrupar por feature" não tem sinal — e a
heurística por nome foi rejeitada (frágil). O laravel-brain já resolve isso de outra forma:
faz **análise estática** e traça a cadeia de cada ponto de entrada
(`rota → controller / componente Livewire → action → service → model → events/jobs/...`),
gravando um **grafo em JSON** em `storage/app/laravel-brain/`. Livewire é nó de primeira
classe (`livewire_component`), o que cobre a stack do dono.

A "feature" de um repo flat passa a ser o **fluxo**: o ponto de entrada cuja cadeia de
chamada alcança o arquivo alterado.

## 2. Referência (o que reusamos do laravel-brain)

- Pacote Composer **dev** instalado no repo Laravel; `php artisan brain:scan` gera o JSON.
- Nós tipados: `route`, `livewire_component`, `controller`, `action`, `service`, `model`,
  `event`, `job`, `command`, `channel`, `view`, etc. Arestas = cadeia de chamada.
- Saídas consumíveis: arquivos JSON em `storage/app/laravel-brain/`, API
  `GET /_laravel-brain/api/context`, e `brain:export-context`. **Skanner lê o JSON** (não
  reimplementa análise estática).

## 3. Escopo

### Inclui
- **Fonte do grafo:** skanner lê `storage/app/laravel-brain/*.json` do caminho local do repo
  (file read puro, sem acoplar runtime PHP).
- **Botão "rescan" (só modo local):** roda `php artisan brain:scan` no repo pra atualizar o
  JSON antes de agrupar (a camada nova precisa estar no scan). Mostra estado de "scan
  desatualizado" se o JSON for mais antigo que o último arquivo alterado.
- **Atribuição arquivo → fluxo:** para cada arquivo alterado, encontra os pontos de entrada
  cuja cadeia o alcança (lendo as arestas do grafo).
  - Alcançado por **exatamente um** fluxo tocado na PR/change-set → fica sob esse fluxo.
  - Alcançado por **vários** → balde **"Transversal / Compartilhado"** (separado, exibido por
    último). Cada diff aparece **uma vez só**.
  - **Não alcançado** por nenhum nó do grafo (arquivo órfão: config novo, etc.) → "Sem fluxo".
- **Dentro de cada fluxo:** ordena por **Camada** (mesma ordem canônica do skanner §4.1).
- **Rótulo do fluxo:** o ponto de entrada legível — `GET /invoices`,
  `App\Livewire\Invoices\Create`, `php artisan x`.

### Não inclui (v1)
- **Sem reimplementar análise estática.** Se não há JSON e o rescan não roda, cai pro
  fallback nível 3 (só por camada).
- **Sem fluxo no modo remoto sem JSON.** Remoto só usa fluxo se o JSON estiver disponível
  (commitado/artefato CI). Sem clonar+escanear repo remoto na v1.
- **Sem aplicar fluxo a repos modulares** (continuam por contexto). Toggle "ver por fluxo"
  em repo modular fica pra depois.

## 4. Algoritmo

```
entrada: changedFiles[], graph(nodes, edges)
1. entryNodes = nós do grafo com type ∈ {route, livewire_component, command, channel, schedule}
2. para cada arquivo f em changedFiles:
     flowsOf(f) = { e ∈ entryNodes | existe caminho e → ... → nó(f) no grafo }
3. agrupa:
     |flowsOf(f)| == 1            → grupo = aquele fluxo
     |flowsOf(f)| >  1            → grupo = "Transversal"
     |flowsOf(f)| == 0            → grupo = "Sem fluxo"
4. dentro de cada grupo, ordena arquivos por camada (categorize())
saída: <fluxo|Transversal|Sem fluxo> → Camada → [arquivos]
```

Reuso de `categorize()` do skanner. Novo: `resolveFlows(file, graph)` (puro, testável).

## 5. Dados / config

- Por repo: `flowGraphPath` (default `storage/app/laravel-brain/`, derivado do caminho local),
  e `flowGroupingEnabled` (auto: ligado se há JSON; desligável).
- O parser do JSON do laravel-brain fica isolado num adaptador (`brainGraphAdapter`) pra
  absorver mudanças de schema entre versões.

## 6. Critérios de aceite (v1)

- [ ] Num repo flat com laravel-brain escaneado, abro um change-set e vejo os arquivos
      agrupados por **fluxo** (ex.: `App\Livewire\Invoices\Create`), camada dentro.
- [ ] Um Model alterado alcançado por 2+ fluxos cai em **"Transversal"**, uma vez só.
- [ ] Arquivo não alcançado por nenhum fluxo cai em **"Sem fluxo"**.
- [ ] Botão rescan (modo local) atualiza o JSON e o agrupamento reflete a camada nova.
- [ ] Sem JSON disponível, o repo flat cai graciosamente pro agrupamento só-por-camada.
- [ ] `resolveFlows()` coberto por testes com um grafo de exemplo.

## 7. Riscos e pontos em aberto

- **Acoplamento ao schema JSON do laravel-brain** — mitigar com adaptador + pin de versão do
  pacote. Validar com a versão atual antes de codar o parser.
- **Custo do `brain:scan`** — memória ≥1GB, tempo em repos grandes. Rescan é manual e só
  local; mostrar progresso/estado.
- **Frescor do scan** vs arquivos da camada atual — detectar JSON desatualizado e avisar.
- **Alcançabilidade** em grafo grande — `resolveFlows` precisa de índice arquivo→nó e busca
  eficiente (não BFS ingênuo por arquivo); pré-computar nó→fluxos uma vez por scan.
- **Dependência externa por repo** — exige laravel-brain instalado nos repos flat. Aceitável
  porque o dono controla os repos; documentar no onboarding do repo.

## 8. Decisões registradas (do grilling)

Feature de repo flat · fonte = JSON do laravel-brain (file read) + rescan manual no local ·
fluxo = ponto de entrada da cadeia real (Livewire incluso) · 1 fluxo→no fluxo, vários→
"Transversal" (sem duplicar), zero→"Sem fluxo" · camada dentro do fluxo · sem reimplementar
análise estática · remoto só com JSON disponível · adaptador isolado pro schema.
