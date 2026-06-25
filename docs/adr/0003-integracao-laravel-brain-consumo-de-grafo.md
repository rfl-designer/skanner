# ADR 0003 — Integração com laravel-brain por consumo do grafo

Status: aceito · 2026-06-25

## Contexto

No nível 2 da hierarquia de agrupamento ([ADR 0002](0002-agrupamento-fatia-vertical-perfil-por-repo.md)),
repos **flat** precisam de uma noção de "feature" que o path não dá. A inspiração foi o
[laravel-brain](https://github.com/laramint/laravel-brain): um pacote Composer dev que faz
**análise estática** e traça a cadeia de cada ponto de entrada
(`rota / componente Livewire / command → action → service → model → events/jobs`),
gravando um **grafo em JSON** em `storage/app/laravel-brain/`. Confirmou-se que ele trata
**Livewire como nó de primeira classe** (`livewire_component`), o que cobre a stack da frota.

A "feature" de um repo flat passa a ser o **fluxo**: o ponto de entrada cuja cadeia de
chamada alcança o arquivo alterado — um sinal **real** (arestas), não heurística de nome.

A pergunta arquitetural: de onde vem esse grafo, e quem o produz?

## Decisão

**Consumir o grafo JSON do laravel-brain — não reimplementar análise estática.**

- O Skanner **lê** `storage/app/laravel-brain/*.json` do caminho local do repo (file read puro,
  sem acoplar runtime PHP ao app).
- Um **adaptador isolado** (`brainGraphAdapter`) traduz o schema do laravel-brain para o modelo
  interno, absorvendo mudanças de versão; **pin de versão** do pacote, validado antes de codar
  o parser.
- **Botão "rescan" só no modo local** (onde há código + PHP): roda `php artisan brain:scan`.
  Avisa quando o JSON está mais antigo que os arquivos alterados (scan desatualizado).
- **Atribuição arquivo → fluxo:** alcançado por um único fluxo tocado → sob ele; por vários →
  balde **"Transversal"** (uma vez só); por nenhum → **"Sem fluxo"**. Pré-computar
  alcançabilidade nó→fluxos uma vez por scan (não BFS ingênuo por arquivo).
- **Modo remoto sem JSON commitado:** sem fluxo (cai para nível 3, só camada). Clonar+escanear
  repo remoto fica como backlog opt-in.

## Consequências

**Positivas**
- Feature em repo flat baseada em arestas reais do código, cobrindo inclusive Livewire.
- Esforço enorme economizado: zero reimplementação de parser/AST PHP.
- Desacoplamento: o app só lê arquivos JSON; não embute PHP nem depende do laravel-brain em
  runtime para funcionar (degrada para só-camada se o grafo faltar).

**Negativas / custos**
- **Acoplamento ao schema JSON** do laravel-brain — mitigado por adaptador + pin de versão,
  mas mudanças upstream podem quebrar o parser.
- **Dependência externa por repo:** cada repo flat precisa ter o laravel-brain instalado e
  escaneado. Aceitável porque o dono controla os repos; documentar no onboarding.
- **`brain:scan` é pesado** (memória ≥1GB, lento em repo grande) e o **frescor** do scan vs a
  camada atual exige rescan manual no modo local.
- O modo remoto fica sem fluxo a menos que o JSON seja commitado/gerado em CI.

## Alternativas consideradas

- **Construir análise estática própria** (em TS, ou via helper PHP com nikic/php-parser):
  descartada — reimplementa o que o laravel-brain já faz bem; custo desproporcional.
- **Heurística de nome para feature em flat:** descartada em [ADR 0002](0002-agrupamento-fatia-vertical-perfil-por-repo.md) (frágil).
- **Exigir laravel-brain e travar o app sem ele:** descartada — preferimos degradar para
  só-camada a impor a dependência como obrigatória.

## Referências

- `.scratch/flow-grouping/PRD.md` (algoritmo, §4; riscos, §7)
- [ADR 0002](0002-agrupamento-fatia-vertical-perfil-por-repo.md) (hierarquia, nível 2)
- Issues: `flow-grouping/01-flow-grouping-brain`, `flow-grouping/02-remote-flow` (backlog)
