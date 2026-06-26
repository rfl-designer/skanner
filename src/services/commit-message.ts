import { spawn } from 'node:child_process';

/**
 * Módulo de serviço `commit-message` (PRD `local-commit-gate`, issue #47): a
 * fronteira app↔subprocess que invoca o `claude -p` para rascunhar o **miolo** da
 * mensagem de commit. A IA é uma função pura `prompt → texto`: roda em modo
 * headless de saída de texto (`-p --output-format text`), recebe o prompt por
 * stdin e devolve a string — SEM tool use, SEM poder de shell, nunca toca o git.
 *
 * Falha (binário ausente, exit ≠ 0, saída vazia, abortado) vira um resultado
 * tipado, não exceção: a view degrada para o preview editável (a IA é
 * conveniência, não dependência). Abortável via `AbortSignal` (o `[esc]` no
 * spinner mata o processo).
 */

/** Resultado tipado da geração: sucesso com o miolo, ou falha com o motivo. */
export type GenerateResult = { kind: 'ok'; message: string } | { kind: 'failed'; reason: string };

/**
 * Invoca `claude -p --output-format text`, escreve `prompt` no stdin e resolve com
 * o stdout aparado. Nunca rejeita: erros (ENOENT do binário, exit ≠ 0, vazio,
 * abort) resolvem como `failed`. O `signal` aborta o subprocesso.
 */
export function generate(args: { prompt: string; signal?: AbortSignal }): Promise<GenerateResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('claude', ['-p', '--output-format', 'text'], { signal: args.signal });
    } catch {
      resolve({ kind: 'failed', reason: 'não foi possível iniciar o claude' });
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.name === 'AbortError') resolve({ kind: 'failed', reason: 'abortado' });
      else if (err.code === 'ENOENT')
        resolve({ kind: 'failed', reason: 'claude não encontrado no PATH' });
      else resolve({ kind: 'failed', reason: err.message });
    });

    child.on('close', (code: number | null) => {
      const out = stdout.trim();
      if (code === 0 && out.length > 0) resolve({ kind: 'ok', message: out });
      else if (code === 0) resolve({ kind: 'failed', reason: 'claude devolveu saída vazia' });
      else resolve({ kind: 'failed', reason: stderr.trim() || `claude saiu com código ${code}` });
    });

    child.stdin?.end(args.prompt);
  });
}
