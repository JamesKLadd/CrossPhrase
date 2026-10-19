// Starts the free PC judge: llama.cpp running Gemma 4 E2B, behind a small
// HTTP server the game can reach over your Wi-Fi.
//
//   npm run pc-judge            (or double-click 2-start.bat on Windows)
//
// Options (environment variables):
//   PORT=8787          port the game connects to
//   LLAMA_URL=...      use an already-running llama-server instead of starting one
//   LLAMA_GPU=0        run on the processor only
//   LLAMA_SERVER, JUDGE_MODEL, JUDGE_MTP   explicit file paths (see paths.ts)

import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

import { createApp } from './app.ts';
import { llamaJudge, startLlama, type LlamaServer } from './llama.ts';
import { findInstall, HERE, MODEL_NAME } from './paths.ts';

const PORT = Number(process.env.PORT ?? 8787);
const LLAMA_PORT = 8786;

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
}

async function main() {
  let llama: LlamaServer | null = null;
  let llamaUrl = process.env.LLAMA_URL;

  if (!llamaUrl) {
    const install = findInstall();
    if (!install.binary || !install.model) {
      console.error(
        `\nThe PC judge isn't set up yet (missing ${!install.binary ? 'llama.cpp' : 'the Gemma model'}).\n` +
          'Run `npm run pc-judge:setup` (or double-click pc-judge\\1-setup.bat) first.\n',
      );
      process.exit(1);
    }
    console.log(`Starting ${MODEL_NAME} with llama.cpp. The first start can take a minute...`);
    console.log(`  model: ${install.model}${install.mtp ? ' (+ MTP head)' : ''}`);
    llama = await startLlama({
      binary: install.binary,
      model: install.model,
      mtp: install.mtp,
      port: LLAMA_PORT,
      logFile: join(HERE, 'llama-server.log'),
      gpu: process.env.LLAMA_GPU !== '0',
    });
    llamaUrl = llama.url;
    console.log(`  running on the ${llama.gpu ? 'graphics chip' : 'processor'}.`);
  }

  const app = createApp({
    dataDir: join(HERE, '..', 'training'),
    modelName: MODEL_NAME,
    callModel: llamaJudge(llamaUrl),
  });

  createServer(app).listen(PORT, '0.0.0.0', () => {
    const addresses = lanAddresses();
    console.log(`\nThe PC judge is ready. Put this line in .env.local, then restart the game with \`npx expo start --clear\`:\n`);
    for (const address of addresses.length ? addresses : ['127.0.0.1']) {
      console.log(`  EXPO_PUBLIC_JUDGE_URL=http://${address}:${PORT}`);
    }
    console.log(
      '\nIf Windows asks, allow Node.js on private networks so your phone can connect.\n' +
        'Verdicts and labels are saved in the training/ folder. Press Ctrl+C to stop.\n',
    );
  });

  const stop = () => {
    llama?.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
