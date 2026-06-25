# ADR 0002 — Agrupamento em fatia vertical com perfil por repo

Status: aceito · 2026-06-25

## Contexto

O valor central do Skanner é reorganizar o diff de uma PR como **fatia vertical**: em vez da
lista plana alfabética do GitHub, ler na ordem em que a feature foi construída
(migration → model → … → tests), agrupada por feature quando a PR toca mais de uma.

A inspeção dos repositórios reais da frota mostrou que ela é **mista**:

- **Modulares/DDD** — `app/Contexts/<Ctx>/<Camada>/…` (ex.: concilliun-crm, regnt-ai). O path
  identifica a feature de forma determinística.
- **Laravel flat** — `app/Models`, `app/Actions`, `app/Livewire`, … sem contexto no path
  (ex.: soloboard, meta-uniplus). Não há feature no path.

Além disso, as **pontas** da fatia não moram no path do contexto nem nos repos modulares:
migrations ficam em `database/migrations/` e testes em `tests/`, sem o `<Ctx>` no caminho.

## Decisão

O motor de agrupamento é uma **função pura, agnóstica de UI e de fonte** (`categorize(path)`
para a camada; `resolveContext(file, scopeContextSet)` para a feature), produzindo sempre a
mesma forma de saída: **`<grupo> → Camada → [arquivos]`**.

**Perfil por repo, auto-detectado** (override manual): existe o diretório base modular
(default `app/Contexts/`, configurável) → `modular`; senão → `flat`.

**Hierarquia de estratégia:**

1. `modular` → `Feature → Camada`; contexto pelo path.
2. `flat` + grafo laravel-brain disponível → `Fluxo → Camada` (ver [ADR 0003](0003-integracao-laravel-brain-consumo-de-grafo.md)).
3. `flat` sem grafo → `Camada` apenas.

**Resolução de contexto (perfil modular), primeira regra que casa vence:**

1. Path direto `app/Contexts/<Ctx>/…`.
2. Path de teste `tests/Feature/**/<Ctx>/…Test.php`.
3. **Ponte por nome dentro do escopo da PR** — para migrations/Livewire sem contexto no path,
   casa o "substantivo raiz" do nome **apenas contra os contextos já resolvidos pelas regras
   1–2 nessa mesma PR**. A PR limita os candidatos a 2–3 contextos, o que torna a ponte segura.
4. **Balde "Sem contexto"** — o que não resolver, exibido por último.

**Ordem de camadas fixa:** Migration → Model → Enums → DTOs → Policies → Actions → Services →
Jobs → Events → Listeners → Observers → Notifications → Livewire → Blade → Tests → Outros.

**Empate na ponte por nome → "Sem contexto" (não chuta).** A **heurística de feature por nome
global fica fora de vez**, substituída pela ponte-no-escopo e pelo fluxo (ADR 0003).

## Consequências

**Positivas**
- Cobre a frota inteira (modular e flat) com a estratégia que cada repo permite — sem forçar
  uma heurística frágil onde não há sinal.
- Determinístico no caso modular; a ponte por nome só age num espaço de candidatos minúsculo
  (a própria PR), o que praticamente elimina atribuição errada.
- Motor puro e testável isoladamente, reusado pelas três fontes (Octokit, simple-git, grafo
  brain) como adaptadores — a UI e a origem do diff não vazam para o agrupamento.

**Negativas / custos**
- As regras de path (`app/Contexts`, `tests/Feature/**/<Ctx>`) foram validadas só no
  concilliun-crm; outro repo modular pode usar layout diferente e exigir ajuste/override.
- Repo flat sem grafo perde a dimensão de feature (só camada) — agrupamento mais pobre.
- A "ponte por nome" tem um ponto cego assumido: empates viram "Sem contexto" em vez de tentar
  desambiguar.

## Alternativas consideradas

- **Heurística de nome global** (substantivo raiz contra todos os contextos do repo):
  descartada por frágil — colisões e ambiguidade fora do escopo da PR.
- **Config de mapeamento por repo** (entidade→contexto declarado à mão): descartada na v1 por
  exigir manutenção a cada feature nova; o auto-detect + override cobre o caso comum.
- **Só suportar repos modulares:** descartada — deixaria metade da frota de fora.

## Referências

- `.scratch/skanner/PRD.md` §4 (motor), §4.0 (perfil/hierarquia), §4.1–4.2
- [ADR 0003](0003-integracao-laravel-brain-consumo-de-grafo.md) (nível 2 da hierarquia)
- Issues: `skanner/05-review-grouped-modular`, `skanner/06-flat-layer-only`
