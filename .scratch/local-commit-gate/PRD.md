# PRD — Portão de commit local assistido por IA (`local-commit-gate`)

## Problem Statement

Hoje o Skanner me deixa **revisar** o change-set não-commitado na aba local, mas é
read-only: depois de revisar, eu saio da ferramenta, volto pro terminal, escolho na
mão os arquivos que entram no commit (`git add ...`), escrevo a mensagem no padrão
Conventional Commits (`feat(#NN): ...` + corpo explicando o porquê + trailer) e
commito. Esse vaivém quebra o fluxo — eu acabei de olhar exatamente esses arquivos
e esse diff dentro do Skanner, mas tenho que reconstruir tudo isso de cabeça lá fora.
A parte mais chata é redigir a mensagem: o *o quê* está no diff que acabei de ver,
mas digitar isso à mão toda vez é trabalho mecânico.

## Solution

Um **portão de commit explícito, só na aba local**, que fecha o ciclo sem eu sair do
Skanner. Eu marco os arquivos que quero (`[espaço]`, igual ao checklist de PR),
disparo o portão, escolho o tipo (`feat`/`fix`/`chore`/…) e informo a issue (ou uma
linha de intenção quando não há). O Skanner faz `git add` dos arquivos marcados,
manda o diff staged + o corpo da issue pro `claude -p`, que devolve **só o miolo** da
mensagem; o Skanner costura `tipo(#NN): <miolo>` + trailer e me mostra num **preview**.
Eu confirmo (commita), edito ou cancelo (desfaz o staging). A IA nunca toca o git —
ela é uma conveniência `diff → texto`; se o `claude` não estiver disponível, o preview
abre vazio e eu digito à mão. Para no commit local — **sem push**.

A identidade read-only do Skanner é preservada em tudo que já existe (navegação, PRs);
a escrita vive atrás deste único portão nomeado.

## User Stories

1. Como revisor na aba local, quero marcar/desmarcar arquivos com `[espaço]`, para
   montar o conjunto exato que vai entrar no commit.
2. Como revisor, quero ver um indicador visual na sidebar nos arquivos marcados, para
   saber de relance o que está selecionado.
3. Como revisor, quero navegar (`j/k`, `l/h`, `tab`) sem perder a marcação, para
   inspecionar cada diff antes de decidir.
4. Como revisor, quero que marcar arquivos não escreva nada no repo até eu disparar o
   portão, para manter a navegação segura.
5. Como revisor, quero disparar o portão de commit por um atalho dedicado quando há ao
   menos um arquivo marcado, para iniciar o fluxo de commit.
6. Como revisor, quero ser impedido (ou avisado) de disparar o portão sem nenhum
   arquivo marcado, para não criar commit vazio.
7. Como revisor, quero escolher o tipo do commit (`feat`/`fix`/`chore`/`refactor`/
   `docs`/`test`/`chore`/…) num seletor de uma tecla, porque o tipo é minha intenção e
   não dá pra inferir do diff com segurança.
8. Como revisor, quero informar o número da issue, para que o commit saia como
   `tipo(#NN): ...` e a IA receba o contexto do *porquê*.
9. Como revisor, quando não há issue, quero digitar uma linha de intenção livre no mesmo
   campo, para dar à IA o contexto que o diff não carrega.
10. Como revisor, quero que o Skanner faça `git add` apenas dos arquivos que eu marquei,
    nem mais nem menos, para que o commit reflita exatamente minha curadoria.
11. Como revisor, quero que o `git add` aconteça antes de chamar a IA, para que ela leia
    exatamente o que vai ser commitado (o diff staged), não o que eu apenas marquei.
12. Como revisor, quero que o Skanner busque o corpo da issue informada no GitHub e o
    entregue à IA, para que a mensagem capture o *porquê* sem eu redigitar.
13. Como revisor, quero que a IA gere apenas o miolo (descrição após os dois-pontos +
    corpo), enquanto o prefixo `tipo(#NN):` e o trailer são montados pelo código, para
    que o formato nunca seja palpite da IA.
14. Como revisor, quero ver um spinner enquanto a IA gera a mensagem, para saber que o
    Skanner está trabalhando e não travado.
15. Como revisor, quero cancelar a geração com `[esc]` enquanto ela roda, para não ficar
    refém de uma chamada lenta ou de uma mudança de ideia.
16. Como revisor, quando eu cancelo, quero que o staging que o Skanner fez seja desfeito,
    para o index voltar ao estado anterior.
17. Como revisor, quero que o cancelamento desfaça **somente** os paths que o Skanner
    stageou, nunca algo que eu já tinha staged manualmente antes, para não perder
    trabalho.
18. Como revisor, quero ver a mensagem montada num preview antes de qualquer commit,
    para revisar o que vai ser gravado.
19. Como revisor, quero confirmar o commit com `[enter]` a partir do preview, para
    gravar a mensagem como está.
20. Como revisor, quero editar a mensagem no preview (`[e]`) antes de commitar, para
    ajustar o que a IA escreveu.
21. Como revisor, quero cancelar no preview (`[esc]`) e voltar à seleção com os arquivos
    ainda marcados e o staging desfeito, para refazer sem recomeçar.
22. Como revisor, quando o `claude` não está instalado, não está logado, falha de rede
    ou devolve algo estranho, quero cair no mesmo preview editável (já com o
    `tipo(#NN):` que eu escolhi), para commitar à mão sem a IA — ela é conveniência,
    não dependência.
23. Como revisor, quero que o commit aconteça localmente e nada seja enviado ao remote,
    para manter o passo irreversível (push) como ato consciente e separado.
24. Como revisor, depois de um commit bem-sucedido, quero que o conjunto marcado zere e
    a aba local recarregue o change-set, para enxergar o que sobrou.
25. Como revisor, quero que o trailer (`Co-Authored-By` + `Claude-Session`) seja anexado
    pelo código no padrão do repo, para não digitá-lo nem depender da IA para ele.
26. Como usuário do Skanner, quero que a aba PRs e toda a navegação continuem 100%
    read-only, para confiar que abrir o Skanner num repo nunca o modifica sozinho.
27. Como revisor, quero mensagens de erro claras quando o `git add`/`commit` falha (ex.:
    hook de pre-commit barrou), para entender e reagir sem corromper o estado.

## Implementation Decisions

**Fronteira de escrita isolada (ADR).** O Skanner deixa de ser estritamente read-only:
abre-se **um** ponto de escrita, o portão de commit, exclusivo da aba local. ADR 0005 é
atualizado para registrar a fronteira ("read-only por padrão; o único ponto de escrita é
a ação de commit, explícita e local"), seguindo o precedente do auto-watch (#15) que já
reverteu o "sem fs watcher" do mesmo ADR. A aba PRs e a navegação permanecem read-only.

**A IA é uma função pura `diff → texto`, sem poder de shell.** O `claude -p` nunca executa
`git`. Todo o encanamento (`add`, `commit`, `reset`) é feito pelo código do Skanner, de
forma determinística. O `claude -p` é invocado em modo headless de saída de texto
(`--output-format text`), recebe o prompt por stdin e devolve string — sem
`--dangerously-skip-permissions`, sem `--allowedTools`, sem tool use.

**Núcleo de domínio (`core/commit.ts`, novo).** Concentra as decisões puras:
- Montagem do **prompt**: combina o diff staged + o corpo da issue (ou a linha de
  intenção) numa instrução para o `claude -p` gerar só o miolo.
- Montagem da **mensagem final**: `prefixo` + `miolo` + `trailer`, onde o prefixo é
  `tipo(#NN): ` quando há issue e `tipo: ` quando há só intenção; o trailer é template
  fixo do repo. A IA não toca prefixo nem trailer.
- Regra de **quais paths resetar** no cancelamento: o conjunto = paths que o Skanner
  stageou nesta sessão (a seleção marcada), nunca o que já estava staged antes. O serviço
  fornece o estado "antes"; o núcleo calcula a diferença a resetar.

**Serviços (IO, finos).**
- `services/local.ts` ganha operações de escrita: `stage(repoPath, paths)`,
  `unstage(repoPath, paths)`, `commit(repoPath, message)` — via `simple-git`. As funções
  de leitura existentes (`diff`) seguem intactas. O módulo deixa de ser "nunca toca o
  index", e seu docblock/ADR é atualizado para refletir a nova fronteira de escrita.
- Serviço novo para o `claude -p`: `generate({ prompt, signal })` dá `spawn` no binário
  `claude`, escreve o prompt no stdin, lê o stdout como texto, e é **abortável** via
  `AbortSignal` (cleanup do `useEffect` → `child.kill()`). Erros (binário ausente, exit
  não-zero, saída vazia) viram um resultado tipado de falha, não exceção solta.
- Fetch do corpo da issue via Octokit, reusando o padrão de autenticação lazy (PAT) já
  existente em `pr.ts`/`auth.ts`. Quando o campo é intenção livre (não-numérico), pula o
  fetch.

**View (`working-diff.tsx`).** Extende a máquina de estados atual
(`loading → empty | error | ready`) com o sub-fluxo do portão, sem quebrar a navegação
existente:
- Estado de **seleção múltipla**: um `ReadonlySet<string>` de paths marcados, portado do
  padrão de `review.tsx` (`checked` + toggle no `[espaço]`); indicador na sidebar
  (`LocalTree`/`LayerList` ganham o marcador, espelhando o `✓` da review). Diferente da
  review, **não persiste** no `conf` — é efêmero e zera após o commit.
- **Sub-estados do portão**: coleta de tipo/issue → `staging` → `generating` (spinner,
  `[esc]` aborta) → `preview` (`[enter]` commita, `[e]` edita, `[esc]` cancela+reset) →
  de volta a `ready`. A falha da IA roteia direto para `preview` editável.
- **Ordem garantida**: `stage` antes de `generate`; cancelamento em qualquer ponto após o
  stage chama `unstage` dos paths que o Skanner stageou.

**Sem push.** O portão termina em `commit`. Push permanece fora de escopo, como ato
separado.

**Pré-requisito.** A seleção múltipla na aba local **não existe hoje** (a aba local tem
só `cursor`; o `Set<string>` vive apenas em `review.tsx`). Ela é o alicerce e deve ser
construída antes do fluxo de commit — candidata a issue/PR própria, anterior.

## Testing Decisions

Bom teste = comportamento externo observável, não detalhe de implementação. O seam mais
alto e puro recebe o grosso dos casos; serviços e view recebem testes finos.

- **`core/commit.ts` (vitest, puro) — seam principal.** Cobre: montagem do prompt com e
  sem corpo de issue (modo intenção); montagem da mensagem final
  (`tipo(#NN): miolo` vs `tipo: miolo`, trailer concatenado, miolo preservado verbatim);
  cálculo do conjunto a resetar (só os paths stageados pelo Skanner, excluindo os que já
  estavam staged antes). Prior art: `core/local.test.ts`, `core/checklist.test.ts` —
  funções puras com fixtures.
- **`services/local.ts` (vitest, simple-git mockado).** `stage`/`unstage`/`commit`
  chamam o git com os argumentos certos; `commit` propaga falha (ex.: hook) como erro
  tratável. Prior art: o teste atual de `diff` com `simple-git`/`fs` mockados.
- **Serviço do `claude -p` (vitest, child_process mockado).** Sucesso devolve o stdout
  como string; binário ausente / exit não-zero / saída vazia viram resultado de falha
  tipado; o `AbortSignal` mata o processo. Não testar contra o `claude` real.
- **Fetch da issue (vitest, Octokit mockado).** Devolve o corpo; erros classificados como
  os de `pr.ts`. Prior art: testes de `pr.ts`/`prs.ts`.
- **`working-diff.tsx` (ink-testing-library) — um teste de fiação.** Com os serviços
  mockados: `[espaço]` marca/desmarca e reflete na sidebar; disparar o portão segue
  stage→generate→preview→commit chamando os serviços na ordem certa; `[esc]` no spinner
  aborta e reseta; `[esc]` no preview cancela e reseta com a marcação preservada; falha da
  IA cai no preview editável; commit zera a seleção e recarrega. Prior art: os testes da
  `review` e de `working-diff`.

## Out of Scope

- **Push** (e tudo que ele arrasta: auth de remote, branch protection, force, escolha de
  branch). O portão para no commit local.
- **A IA decidir o agrupamento ou desviar da seleção** — seleção é lei; a IA não escolhe o
  que entra no commit.
- **A IA executar comandos git** — proibido por design.
- **Persistir a seleção** entre sessões ou commits — é efêmera e zera após cada commit.
- **Seletor de issue por lista** (navegar issues abertas via Octokit) — o campo aceita o
  número digitado; a lista é refinamento futuro.
- **Marcação por camada/contexto** ("marca `services/` inteiro de uma vez") — refinamento
  futuro; v1 marca arquivo a arquivo.
- **Commit cego (fire-and-forget)** — sempre há preview.
- **Retry automático** da chamada à IA — falha degrada para preview manual.
- **Inferência do tipo pela IA** — o tipo é escolha do usuário.

## Further Notes

- **Armadilha do reset (correção crítica):** o `unstage` no cancelamento só pode tocar os
  paths que o *Skanner* stageou nesta sessão. Se o usuário já tinha outra coisa staged na
  mão antes de abrir o portão, resetá-la destruiria trabalho dele. O serviço precisa
  capturar o estado do index *antes* do stage para o núcleo calcular a diferença exata a
  reverter.
- **Diferença marcado vs. staged:** a IA lê o diff *staged* (pós-`git add`), que pode
  diferir do que foi marcado se houver edição parcial no mesmo arquivo. Decisão consciente:
  a mensagem descreve o que será commitado, não o que foi apenas selecionado.
- **Disponibilidade do `claude`:** o portão funciona mesmo sem `claude` instalado/logado —
  a falha cai no preview editável com o prefixo já montado. A IA é otimização de
  digitação, não dependência.
- **Trailer:** template fixo do repo (`Co-Authored-By: Claude ...` + `Claude-Session: ...`),
  concatenado pelo código — não gerado pela IA.
- **Frequência de issue:** quase todo commit do histórico tem `(#NN)`, o que justifica o
  fetch da issue como caminho principal e a intenção livre como fallback.
