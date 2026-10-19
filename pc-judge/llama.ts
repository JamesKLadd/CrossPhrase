// Runs llama.cpp's llama-server and asks it for verdicts.

import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';

import { phrasesMessage, SYSTEM_PROMPT, TIERS } from '../supabase/functions/_shared/judgePrompt.ts';
import type { JudgeEntry, ModelVerdict, Usage } from '../supabase/functions/judge/judge.ts';

export interface LlamaServer {
  url: string;
  gpu: boolean;
  stop(): void;
}

async function healthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok && ((await res.json()) as { status?: string }).status === 'ok';
  } catch {
    return false;
  }
}

function launch(binary: string, args: string[], logFile: string): ChildProcess {
  const log = createWriteStream(logFile, { flags: 'a' });
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  return child;
}

/**
 * Starts llama-server on the graphics chip, falling back to the processor if
 * the GPU driver fails (as the Study App does). Resolves once it answers.
 */
export async function startLlama(opts: {
  binary: string;
  model: string;
  mtp: string | null;
  port: number;
  logFile: string;
  gpu: boolean;
}): Promise<LlamaServer> {
  const url = `http://127.0.0.1:${opts.port}`;
  for (const gpu of opts.gpu ? [true, false] : [false]) {
    const args = [
      '-m', opts.model,
      '-c', '8192',
      '--port', String(opts.port),
      '--host', '127.0.0.1',
      '--jinja',
      // Gemma 4 otherwise "thinks" for hundreds of tokens before every answer.
      '--reasoning-budget', '0',
      '-ngl', gpu ? '99' : '0',
      ...(opts.mtp ? ['-md', opts.mtp, '--spec-type', 'draft-mtp'] : []),
    ];
    const child = launch(opts.binary, args, opts.logFile);
    let exited = false;
    child.on('exit', () => (exited = true));
    const deadline = Date.now() + 5 * 60_000;
    while (!exited && Date.now() < deadline) {
      if (await healthy(url)) return { url, gpu, stop: () => child.kill() };
      await new Promise((r) => setTimeout(r, 1000));
    }
    child.kill();
    if (gpu) console.log('The graphics chip did not work for llama.cpp; trying the processor instead...');
  }
  throw new Error(`llama-server did not start. See ${opts.logFile}.`);
}

/**
 * A grammar that only allows compact JSON in the judge's shape with bounded
 * strings. Pretty-printed JSON costs the small model ~40% more tokens.
 */
export const VERDICT_GRAMMAR = String.raw`root ::= "{\"verdicts\":[" item ("," item)* "]}"
item ::= "{\"id\":" id ",\"reading\":" text ",\"tier\":" tier ",\"reason\":" text ",\"quip\":" text "}"
id ::= "\"" [0-9]{1,3} [AD] "\""
tier ::= ${TIERS.map((t) => '"\\"' + t + '\\""').join(' | ')}
text ::= "\"" char{0,100} "\""
char ::= [^"\\\x00-\x1F] | "\\" ["\\/nt]`;

/** Asks llama-server to judge entries with the shared prompt. */
export function llamaJudge(url: string) {
  return async (entries: JudgeEntry[]): Promise<{ verdicts: ModelVerdict[]; usage: Usage }> => {
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: phrasesMessage(entries) },
        ],
        max_tokens: 96 * entries.length + 64,
        temperature: 0.2,
        top_p: 0.9,
        cache_prompt: true,
        grammar: VERDICT_GRAMMAR,
      }),
    });
    if (!res.ok) throw new Error(`llama-server returned ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const { verdicts } = JSON.parse(data.choices[0].message.content) as { verdicts: ModelVerdict[] };
    return {
      verdicts,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    };
  };
}
