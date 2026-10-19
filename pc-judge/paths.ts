// Where the PC judge finds llama.cpp and the model. It reuses the Study App's
// downloads when they're there, so nothing is fetched twice.

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const LLAMA_TAG = 'b11118';
export const MODEL_FILE = 'gemma-4-E2B-it-Q4_K_M.gguf';
export const MTP_FILE = 'mtp-gemma-4-E2B-it-Q8_0.gguf';
export const MODEL_NAME = 'Gemma 4 E2B';

const EXE = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';

/** Folders that might hold models and runtimes, most specific first. */
function roots(): { models: string; runtime: string }[] {
  const list = [{ models: join(HERE, 'models'), runtime: join(HERE, 'runtime') }];
  if (process.env.LOCALAPPDATA) {
    const studyApp = join(process.env.LOCALAPPDATA, 'StudyApp');
    list.push({ models: join(studyApp, 'models'), runtime: join(studyApp, 'runtime', `llama-${LLAMA_TAG}`) });
  }
  return list;
}

function findFile(dir: string, name: string): string | null {
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir, { recursive: true, encoding: 'utf8' }).find(
    (p) => p === name || p.endsWith(`/${name}`) || p.endsWith(`\\${name}`),
  );
  return hit ? join(dir, hit) : null;
}

export interface Install {
  binary: string | null;
  model: string | null;
  /** The multi-token-prediction head: optional, about 2x faster on Vulkan. */
  mtp: string | null;
}

/** Environment variables win: LLAMA_SERVER, JUDGE_MODEL, JUDGE_MTP. */
export function findInstall(): Install {
  const env = (name: string) => (process.env[name] && existsSync(process.env[name]!) ? process.env[name]! : null);
  const first = (pick: (r: { models: string; runtime: string }) => string | null) =>
    roots().map(pick).find((p) => p !== null) ?? null;
  return {
    binary: env('LLAMA_SERVER') ?? first((r) => findFile(r.runtime, EXE)),
    model: env('JUDGE_MODEL') ?? first((r) => findFile(r.models, MODEL_FILE)),
    mtp: env('JUDGE_MTP') ?? first((r) => findFile(r.models, MTP_FILE)),
  };
}
