# Issue tracker: GitHub Issues

Implementation issues and triage for this repo live as **GitHub Issues** in
`rfl-designer/skanner`, managed via the `gh` CLI. PRDs stay as markdown design docs in
`.scratch/<feature-slug>/PRD.md` and are mirrored into a tracking (epic) issue.

> Migrado de markdown local para GitHub em 2026-06-25 (ver `git log`). Os arquivos em
> `.scratch/<feature>/issues/` permanecem como histórico do snapshot que originou as issues,
> mas **não são mais a fonte de verdade** — daqui pra frente edite no GitHub.

## Conventions

- **Um feature = um épico.** Cada PRD vira uma issue de tracking com a label `epic`, cujo corpo
  é o conteúdo do PRD + uma checklist `## Issues` linkando as issues-filho por `#número`.
- **Issues de implementação** são GitHub Issues normais, título no formato
  `[<feature-slug>] <NN> — <título>` (ex.: `[skanner] 03 — Resolver repo do cwd + perfil`). O
  `<NN>` preserva a ordem de construção dentro da feature.
- **Estado de triagem = label do GitHub** (`needs-triage`, `needs-info`, `ready-for-agent`,
  `ready-for-human`, `wontfix`) — ver `triage-labels.md`. As labels já existem no repo.
- **PRDs** continuam sendo escritos como markdown em `.scratch/<feature-slug>/PRD.md` (a fonte
  de design); ao publicar/atualizar, espelha-se o conteúdo no corpo do épico.
- **Comentários e histórico de conversa** vão para os comentários da issue no GitHub
  (`gh issue comment`), não para o arquivo markdown.

## When a skill says "publish to the issue tracker"

Crie uma GitHub Issue com `gh issue create --title "[<feature>] <NN> — <título>"
--body-file <md> --label <triage-role>`. Se a feature ainda não tem épico, crie o épico
(`--label epic`) a partir do `.scratch/<feature>/PRD.md` e linke a nova issue na checklist
`## Issues` do épico.

## When a skill says "fetch the relevant ticket"

Use `gh issue view <número>` (ou `gh issue list --label <role>`). O usuário normalmente passa o
número da issue direto. Para o PRD de design, leia `.scratch/<feature-slug>/PRD.md`.
