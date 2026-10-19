// The PC judge's HTTP API, the same contract as the Supabase judge function:
//
//   GET  /health                      -> { ok, judge: "pc", model, promptVersion }
//   POST /judge  { entries }          -> { verdicts }
//   POST /labels { labels }           -> { saved }
//
// Every verdict is kept in training/pc-verdicts.json (it doubles as the
// cache and as teacher data for the tiny in-game judge), and every label
// from the app is appended to training/labels.jsonl.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { join } from 'node:path';

import { localVerdict, ruleProblem } from '../src/core/localJudge';
import { PROMPT_VERSION, TIERS } from '../supabase/functions/_shared/judgePrompt.ts';
import {
  type CachedVerdict,
  type JudgeEntry,
  judgeEntries,
  type ModelVerdict,
  parseEntries,
  type Tier,
  type Usage,
} from '../supabase/functions/judge/judge.ts';

export interface PcJudgeOptions {
  /** Where pc-verdicts.json and labels.jsonl live (the repo's training/ folder). */
  dataDir: string;
  modelName: string;
  callModel(entries: JudgeEntry[]): Promise<{ verdicts: ModelVerdict[]; usage: Usage }>;
  log?: (message: string) => void;
}

const LABEL_SOURCES = ['labeler', 'play'] as const;
const MAX_LABELS_PER_REQUEST = 500;
const MAX_BODY_BYTES = 256 * 1024;

const DICTIONARY = new Map<string, string[]>(
  Object.entries(
    JSON.parse(
      readFileSync(new URL('../supabase/functions/_shared/dictionary.json', import.meta.url), 'utf8'),
    ) as Record<string, string[]>,
  ),
);

type StoredVerdict = CachedVerdict & { model: string; at: string };

class VerdictFile {
  private rows: Record<string, StoredVerdict>;
  constructor(private path: string) {
    this.rows = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  }
  lookup(phrases: string[]): CachedVerdict[] {
    return phrases.flatMap((p) => this.rows[p] ?? []);
  }
  save(rows: CachedVerdict[], model: string) {
    const at = new Date().toISOString();
    for (const row of rows) this.rows[row.phrase] = { ...row, model, at };
    // Write to a temp file first so a crash can't leave half a file behind.
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.rows, null, 1) + '\n');
    renameSync(`${this.path}.tmp`, this.path);
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parseLabels(body: unknown): Record<string, unknown>[] | string {
  const labels = (body as { labels?: unknown })?.labels;
  if (!Array.isArray(labels) || labels.length === 0) return 'labels must be a non-empty array';
  if (labels.length > MAX_LABELS_PER_REQUEST) return `at most ${MAX_LABELS_PER_REQUEST} labels per request`;
  const clean: Record<string, unknown>[] = [];
  for (const raw of labels) {
    const { phrase, tier, source, judged, at } = (raw ?? {}) as Record<string, unknown>;
    if (typeof phrase !== 'string' || !phrase.split(' ').every((w) => DICTIONARY.has(w))) {
      return `label for ${JSON.stringify(phrase)} uses words not in the dictionary`;
    }
    if (!TIERS.includes(tier as Tier)) return `bad tier ${JSON.stringify(tier)}`;
    if (!LABEL_SOURCES.includes(source as (typeof LABEL_SOURCES)[number])) {
      return `bad source ${JSON.stringify(source)}`;
    }
    clean.push({
      phrase,
      tier,
      source,
      ...(TIERS.includes(judged as Tier) ? { judged } : {}),
      at: typeof at === 'string' ? at : new Date().toISOString(),
    });
  }
  return clean;
}

export function createApp(options: PcJudgeOptions): RequestListener {
  const log = options.log ?? console.log;
  mkdirSync(options.dataDir, { recursive: true });
  const verdicts = new VerdictFile(join(options.dataDir, 'pc-verdicts.json'));
  const labelsPath = join(options.dataDir, 'labels.jsonl');

  // Phrases that break a hard grammar rule never reach the model: they're
  // invalid whatever it says, and skipping them saves seconds.
  async function callModel(entries: JudgeEntry[]) {
    const ruled: ModelVerdict[] = [];
    const rest: JudgeEntry[] = [];
    for (const entry of entries) {
      if (ruleProblem(entry.words)) {
        const v = localVerdict(entry);
        ruled.push({ id: entry.id, reading: v.reading, tier: v.tier, reason: v.reason, quip: v.quip });
      } else {
        rest.push(entry);
      }
    }
    if (rest.length === 0) {
      return { verdicts: ruled, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    }
    const result = await options.callModel(rest);
    return { verdicts: [...ruled, ...result.verdicts], usage: result.usage };
  }

  return async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        return res.end();
      }
      if (req.method === 'GET' && path === '/health') {
        return send(res, 200, { ok: true, judge: 'pc', model: options.modelName, promptVersion: PROMPT_VERSION });
      }
      if (req.method === 'POST' && path === '/judge') {
        const entries = parseEntries(await readJson(req), DICTIONARY);
        if (typeof entries === 'string') return send(res, 400, { error: entries });
        const started = Date.now();
        const result = await judgeEntries(entries, {
          dictionary: DICTIONARY,
          promptVersion: PROMPT_VERSION,
          lookup: async (phrases) => verdicts.lookup(phrases),
          save: async (rows) => verdicts.save(rows, options.modelName),
          recordHits: async () => {},
          callModel,
        });
        log(
          `Judged ${entries.length} phrase(s) in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
            `(${result.cacheHits} remembered): ` +
            result.verdicts.map((v) => `${v.reading} → ${v.tier}`).join(' | '),
        );
        return send(res, 200, { verdicts: result.verdicts });
      }
      if (req.method === 'POST' && path === '/labels') {
        const labels = parseLabels(await readJson(req));
        if (typeof labels === 'string') return send(res, 400, { error: labels });
        appendFileSync(labelsPath, labels.map((l) => JSON.stringify(l)).join('\n') + '\n');
        log(`Saved ${labels.length} label(s) to training/labels.jsonl`);
        return send(res, 200, { saved: labels.length });
      }
      return send(res, 404, { error: 'not found' });
    } catch (error) {
      log(`Request to ${path} failed: ${String(error)}`);
      const badInput = error instanceof SyntaxError || String(error).includes('body too large');
      return send(res, badInput ? 400 : 502, { error: badInput ? 'bad request body' : 'judge failed' });
    }
  };
}
