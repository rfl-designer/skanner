# Mission: TypeScript (do zero, construindo o Skanner)

## Why
Saio de PHP/Laravel e quero dominar TypeScript de verdade construindo o **Skanner** —
meu app de terminal (TUI com Ink: React + TS) que reorganiza o diff de uma PR em fatia
vertical (feature → camada). O objetivo final é conseguir escrever, sozinho e com confiança,
todo o código TypeScript do app: das funções puras de domínio à UI tipada em React (no terminal).

## Success looks like
- Escrevo e leio assinaturas TypeScript sem medo: tipos, `union`/`literal`, `interface`,
  generics e narrowing — e entendo *por que* o compilador aceita ou recusa cada coisa.
- Implemento as funções-coração do PRD (`categorize(path)`, `resolveContext(...)`) tipadas
  e cobertas por testes, com a ajuda do compilador em vez de descobrir erro só em runtime.
- Construo componentes React em TS (props tipadas, estado, eventos) para a tela de Review —
  renderizados no terminal com Ink (`<Box>`/`<Text>`, flexbox, hooks).
- Entendo a fronteira tipada com o Node num único processo: Octokit e filesystem chamados
  direto do app (sem IPC main↔renderer), com os tipos do domínio atravessando essa fronteira.

## Constraints
- Base de JavaScript é **básica** (me viro, mas nunca estudei a fundo; pouco ES moderno /
  async-await / módulos). Quando um buraco de JS aparecer, a lição preenche antes de seguir.
- Venho de **PHP/Laravel** — usar essa bagagem como ponte (type hints, enums, classes) ajuda.
- Projeto **pessoal**, ritmo próprio, sem prazo externo. Aprender é o entregável; o app é o veículo.
- Estilo escolhido: **cada lição constrói uma peça real do Skanner** (não exercícios genéricos).

## Out of scope (por enquanto)
- Distribuição via npm (`npx`/global install), versionamento e release — fora até a v1 do PRD.
- A parte de IA / grafo de fluxo (`flow-grouping`) — domínio à parte, depois da v1.
- Backend Node "de servidor" / APIs REST próprias — o Skanner é single-user, local.
- Decorators avançados, metaprogramação de tipos exótica — só quando o app pedir.
