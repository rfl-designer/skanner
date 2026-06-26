/**
 * Núcleo do **portão de commit** (PRD `local-commit-gate`, issue #47): puro,
 * agnóstico de UI e de IO. As decisões que valem teste moram aqui — o campo
 * issue/intenção parseado, o prompt entregue ao `claude -p`, a montagem da
 * mensagem final (prefixo + miolo da IA + trailer) e o conjunto de paths a
 * desfazer no cancelamento. Os serviços fazem o IO (git via `local`; subprocess
 * via `commit-message`; Octokit via `issue`) e a view só orquestra estados.
 *
 * Princípio do design (grilling): a IA é uma função pura `diff → miolo`. O
 * prefixo `tipo(#NN):` (o usuário escolhe o tipo; o código monta) e o trailer
 * (template) NUNCA são gerados pela IA — ela só toca o miolo.
 */

/**
 * Tipo do commit no padrão Conventional Commits. O usuário escolhe (não a IA),
 * porque o tipo codifica a INTENÇÃO, que o diff não revela com segurança.
 */
export type CommitType = 'feat' | 'fix' | 'chore' | 'refactor' | 'docs' | 'test' | 'style' | 'perf';

/** Tipos oferecidos no seletor, na ordem de exibição. */
export const COMMIT_TYPES: readonly CommitType[] = [
  'feat',
  'fix',
  'chore',
  'refactor',
  'docs',
  'test',
  'style',
  'perf',
];

/**
 * O campo de contexto parseado: um número (com ou sem `#`) vira referência de
 * issue (puxa o corpo do GitHub e entra no prefixo `(#NN)`); qualquer outro
 * texto vira intenção livre (contexto para a IA, sem `(#NN)`); vazio é nenhum.
 * União discriminada — estado impossível ("issue sem número") irrepresentável.
 */
export type IssueContext =
  | { kind: 'issue'; number: number }
  | { kind: 'intent'; text: string }
  | { kind: 'none' };

/** Parseia o campo único do portão: dígitos → issue; texto → intenção; vazio → nenhum. */
export function parseIssueInput(raw: string): IssueContext {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'none' };
  if (/^#?\d+$/.test(trimmed)) return { kind: 'issue', number: Number(trimmed.replace('#', '')) };
  return { kind: 'intent', text: trimmed };
}

/**
 * Prefixo da mensagem: `tipo(#NN): ` quando há issue, `tipo: ` quando não.
 * Montado pelo código a partir da escolha do usuário — a IA não o toca.
 */
export function messagePrefix(type: CommitType, issue: IssueContext): string {
  if (issue.kind === 'issue') return `${type}(#${issue.number}): `;
  return `${type}: `;
}

/**
 * Trailer fixo, anexado pelo código (não gerado pela IA), creditando o rascunho
 * do `claude -p`. Sem `Claude-Session`: o Skanner não conhece a URL da sessão
 * (divergência consciente do user story 25 do PRD).
 */
export const COMMIT_TRAILER = 'Co-Authored-By: Claude (claude -p) <noreply@anthropic.com>';

/**
 * Costura a mensagem final: `prefixo + miolo (verbatim da IA) + trailer`. O
 * miolo é o único pedaço da IA; vem aparado de espaços nas pontas. `aiAssisted`
 * controla o trailer — uma mensagem escrita à mão (fallback sem `claude`) não
 * recebe o crédito da IA.
 */
export function assembleMessage(args: {
  type: CommitType;
  issue: IssueContext;
  body: string;
  aiAssisted: boolean;
}): string {
  const subject = messagePrefix(args.type, args.issue) + args.body.trim();
  return args.aiAssisted ? `${subject}\n\n${COMMIT_TRAILER}` : subject;
}

/**
 * Monta o prompt entregue ao `claude -p`. Inclui o diff staged (o que SERÁ
 * commitado, não o que foi marcado) e, quando há, o corpo da issue ou a linha
 * de intenção — o contexto do *porquê* que o diff não carrega. Pede de volta só
 * o miolo (sem prefixo `tipo:` nem trailer): o código costura o resto.
 */
export function buildPrompt(args: {
  stagedDiff: string;
  issueBody: string | null;
  intent: string | null;
}): string {
  const parts: string[] = [
    'Escreva a mensagem de um commit no padrão do repositório, em português.',
    'Responda APENAS com o corpo da mensagem (a descrição e, se útil, um parágrafo',
    'de contexto) — NÃO inclua o prefixo de tipo (feat:/fix:/...) nem trailers;',
    'esses são adicionados pelo código.',
  ];
  if (args.issueBody) {
    parts.push('', 'Contexto da issue associada:', args.issueBody.trim());
  }
  if (args.intent) {
    parts.push('', 'Intenção declarada pelo autor:', args.intent.trim());
  }
  parts.push('', 'Diff que será commitado (staged):', args.stagedDiff.trim());
  return parts.join('\n');
}

/**
 * Os paths a desfazer (`git reset`) ao cancelar o portão. **Armadilha crítica**:
 * só os paths que o Skanner stageou nesta sessão — `marked` MENOS o que já
 * estava staged ANTES do portão. Resetar um path pré-staged destruiria trabalho
 * que o usuário staged manualmente (PRD §Further Notes).
 */
export function pathsToReset(marked: Iterable<string>, stagedBefore: ReadonlySet<string>): string[] {
  const reset: string[] = [];
  for (const path of marked) {
    if (!stagedBefore.has(path)) reset.push(path);
  }
  return reset;
}
