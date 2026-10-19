// Gets llama.cpp and Gemma 4 E2B for the PC judge, unless they're already on
// this computer (from a previous run, or from the Study App).
//
//   npm run pc-judge:setup     (or double-click 1-setup.bat on Windows)
//
// Downloads are pinned to exact versions and checked against SHA-256
// checksums (the same files the Study App uses), so they can't silently change.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { findInstall, HERE, LLAMA_TAG, MODEL_FILE, MTP_FILE } from './paths.ts';

interface Download {
  url: string;
  sha256: string;
  size: number;
}

const GH = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}`;
const RUNTIMES: Partial<Record<NodeJS.Platform, Download & { file: string }>> = {
  // The Vulkan build runs on Intel, AMD and NVIDIA graphics, and includes the processor fallback.
  win32: {
    file: `llama-${LLAMA_TAG}-bin-win-vulkan-x64.zip`,
    url: `${GH}/llama-${LLAMA_TAG}-bin-win-vulkan-x64.zip`,
    sha256: '5cb80f42a602965f7491cac4977329ff47c6aa4f850272406708854b5d290547',
    size: 31971214,
  },
  linux: {
    file: `llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz`,
    url: `${GH}/llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz`,
    sha256: '20f3067d5bc7e48c2be49ada32497a08dc75c730d90fce852d1d7cf12fe36995',
    size: 16999140,
  },
};

const MODEL: Download = {
  url: `https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/0314792d7f1f7e229411f620751375812bb9faf2/${MODEL_FILE}`,
  sha256: '740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8',
  size: 3106738272,
};
const MTP: Download = {
  url: `https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/resolve/b4243c156154b6dca9324415f8c7ccc098b4aed1/${MTP_FILE}`,
  sha256: 'c4fba8d43b40c9fab8c3db15ca6ef00fd28192208753f1f038269c176437068a',
  size: 97817696,
};

const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

async function download(item: Download, dest: string, label: string) {
  console.log(`Downloading ${label} (${mb(item.size)})...`);
  const part = `${dest}.part`;
  const res = await fetch(item.url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${item.url}`);
  const hash = createHash('sha256');
  const out = createWriteStream(part);
  let received = 0;
  let shown = 0;
  for await (const chunk of Readable.fromWeb(res.body as never)) {
    hash.update(chunk as Buffer);
    received += (chunk as Buffer).length;
    if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()));
    const pct = Math.floor((100 * received) / item.size);
    if (pct >= shown + 10) {
      shown = pct - (pct % 10);
      console.log(`  ${shown}%`);
    }
  }
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  const digest = hash.digest('hex');
  if (digest !== item.sha256) {
    rmSync(part, { force: true });
    throw new Error(`${label} failed its checksum (got ${digest}). Try again; if it keeps failing, tell Claude.`);
  }
  renameSync(part, dest);
  console.log(`  done, checksum OK.`);
}

async function main() {
  const found = findInstall();

  if (found.binary) {
    console.log(`llama.cpp: found ${found.binary}`);
  } else {
    const runtime = RUNTIMES[process.platform];
    if (!runtime) {
      throw new Error(
        'No pinned llama.cpp build for this system. Install llama.cpp yourself (e.g. `brew install llama.cpp`) ' +
          'and set LLAMA_SERVER to the llama-server path.',
      );
    }
    const dir = join(HERE, 'runtime');
    mkdirSync(dir, { recursive: true });
    const archive = join(dir, runtime.file);
    await download(runtime, archive, 'llama.cpp');
    const target = join(dir, `llama-${LLAMA_TAG}`);
    mkdirSync(target, { recursive: true });
    // Windows 10+ and Linux both ship `tar`, which unpacks .zip and .tar.gz.
    execFileSync('tar', ['-xf', archive, '-C', target], { stdio: 'inherit' });
    rmSync(archive);
    console.log(`  unpacked into ${target}`);
  }

  const models = join(HERE, 'models');
  mkdirSync(models, { recursive: true });
  if (found.model) console.log(`Model: found ${found.model}`);
  else await download(MODEL, join(models, MODEL_FILE), 'Gemma 4 E2B');
  if (found.mtp) console.log(`Speed-up head: found ${found.mtp}`);
  else await download(MTP, join(models, MTP_FILE), 'the Gemma speed-up (MTP) head');

  const after = findInstall();
  if (!after.binary || !after.model || !existsSync(after.model)) throw new Error('Setup finished but files are missing.');
  console.log('\nAll set. Start the PC judge with `npm run pc-judge` (or 2-start.bat).');
}

main().catch((error) => {
  console.error(`\n${String(error instanceof Error ? error.message : error)}`);
  process.exit(1);
});
