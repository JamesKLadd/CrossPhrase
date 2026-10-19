# The PC judge

A free judge that runs on your own computer: **Gemma 4 E2B** through
**llama.cpp**, the same model and runtime the Study App uses. The game talks to
it over your Wi-Fi. It grades phrases with real judgement and writes the owl's
quips, saves every verdict and label into `training/`, and costs nothing to run.

## Set it up (once)

Windows: double-click **`1-setup.bat`**. Anywhere else: `npm run pc-judge:setup`.

If the Study App is installed on this computer, its llama.cpp and Gemma files
(in `%LOCALAPPDATA%\StudyApp`) are reused and nothing is downloaded. Otherwise
it downloads about 3.2 GB into `pc-judge/runtime` and `pc-judge/models`, pinned
to exact versions and checked against SHA-256 checksums.

> The Study App's *card writer* is a Gemma that was trained to write
> flashcards. The judge needs the original Gemma 4 E2B
> (`gemma-4-E2B-it-Q4_K_M.gguf`). If you deleted that "Original card writer"
> from the Study App, setup downloads it again here.

## Start it (each time you play)

Windows: double-click **`2-start.bat`**. Anywhere else: `npm run pc-judge`.

The first start takes up to a minute while Gemma loads. Then it prints a line
like:

```
EXPO_PUBLIC_JUDGE_URL=http://192.168.1.23:8787
```

Put that line in `.env.local` at the project root and restart the game with
`npx expo start --clear`. The home screen should say **"your PC judge is connected"**.

Keep the window open while you play. When the PC judge is off or out of
reach, the built-in judge grades phrases provisionally ("OK?") and the game
re-checks them once the PC judge is back.

## How fast is it?

On the Iris Xe laptop (Vulkan, with Gemma's MTP speed-up head) expect roughly
**3–6 seconds** for a small level and **10–15 seconds** for a 10-line board.
Phrases it has judged before come back instantly, and ones that break a basic
grammar rule ("my your toast") skip the model entirely. An NVIDIA desktop is
much faster.

## If something goes wrong

- **The phone can't connect:** both devices must be on the same Wi-Fi (not a
  guest network). When Windows asks whether Node.js may use the network, allow
  **private networks**. You can also test from the PC itself at
  `http://localhost:8787/health`.
- **"The graphics chip did not work":** it falls back to the processor
  automatically, which is slower. Updating the graphics driver usually fixes it.
- **Details:** llama.cpp's log is in `pc-judge/llama-server.log`.

Options (environment variables): `PORT` (default 8787), `LLAMA_GPU=0` to use
the processor only, `LLAMA_URL` to use a llama-server you started yourself, and
`LLAMA_SERVER` / `JUDGE_MODEL` / `JUDGE_MTP` for explicit file paths.

## The prompt

The judge's instructions live in `supabase/functions/_shared/judgePrompt.ts`,
shared with the optional Claude judge. After changing them, bump
`PROMPT_VERSION` so remembered verdicts are re-judged, restart the PC judge,
and measure with `node --env-file=.env.local scripts/judge-eval/run.mjs`.
