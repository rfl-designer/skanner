# TypeScript Resources

Fontes de alta confiança para esta missão. O conhecimento das lições é puxado daqui,
não de chute. Anotação obrigatória em cada item: o que cobre e quando recorrer.

## Knowledge

- [TypeScript Handbook — Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
  Fonte primária e canônica. Tipos do dia a dia: `string`/`number`/`boolean`, arrays,
  `union`, **literal types**, type aliases, `interface`. Use para: a base do sistema de tipos.
- [TypeScript Handbook — Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
  Como o compilador estreita um tipo dentro de `if`/`switch` (`typeof`, `in`, discriminated
  unions). Use para: a lição em que `categorize` decide a camada por caminho.
- [TypeScript for JavaScript Programmers (5 min)](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html)
  Visão relâmpago de TS para quem já sabe um JS. Use para: a ponte JS→TS no começo.
- [TypeScript Playground](https://www.typescriptlang.org/play)
  Editor no navegador que roda o type-checker ao vivo, sem instalar nada. Use para:
  **toda** prática de lição antes de termos o scaffold do app. Erros aparecem na hora.
- [Total TypeScript (Matt Pocock) — artigos gratuitos](https://www.totaltypescript.com/)
  Material de altíssima reputação, focado em padrões reais. Use para: aprofundar generics,
  utility types e padrões de modelagem depois da base.
- [MDN — JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)
  Referência de confiança para os buracos de JS (funções, módulos, `async/await`).
  Use para: preencher base de JS quando uma lição encostar em algo não-tipado.

## Wisdom (Communities)

- [r/typescript](https://www.reddit.com/r/typescript/)
  Subreddit ativo e técnico. Use para: revisar uma modelagem de tipos, pedir crítica de
  uma assinatura, destravar erro de compilador que não cede.
- [TypeScript Community Discord](https://discord.com/invite/typescript)
  Servidor oficial. Use para: dúvida rápida e síncrona ("por que esse tipo não estreita?").

## Gaps
- Falta um recurso de confiança específico para **Electron + TS tipando IPC** —
  buscar quando a missão chegar na fronteira main↔renderer (issue 01 do PRD em diante).
