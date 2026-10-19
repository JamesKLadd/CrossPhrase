# CrossPhrase

A crossword where every square holds a **word**. Every across and down run of
words has to read as an acceptable phrase. A bookish, slightly snarky owl (an
AI judge) grades each phrase. Rare words and great phrasing score the points
needed to clear the level.

The full game design and phase plan are in [docs/DESIGN.md](docs/DESIGN.md).
This repo is at **Phase 2: judge and scoring hardening**, using free judges
you can train.

## Run it

You need **Node.js 20.19.4+, 22.13+ or 24.3+** (the current LTS from nodejs.org). Older
versions fail with confusing errors or a blank white page; `npm start` checks
and says so.

```sh
npm ci           # installs exactly the locked versions (never edits package-lock.json)
npm run web      # in a browser
npm start        # then scan the QR code with Expo Go from the App Store / Play Store
```

If the phone sits on "loading" forever after scanning, it can't reach your
computer: check both are on the same Wi-Fi (not a guest network or VPN), and on
Windows allow Node.js through the firewall when asked. Or skip the network
question entirely with `npx expo start --tunnel`.

If `git pull` complains that local changes to `package-lock.json` would be
overwritten, an earlier `npm install` rewrote it. Discard that with
`git checkout -- package-lock.json`, pull again, then run `npm ci`.

The project's Expo SDK must match the Expo Go app on your phone; it's on
**SDK 57**, which is what the App Store's Expo Go runs today. If Expo Go
updates and says the project is incompatible, the SDK needs upgrading to match
(`npx expo install expo@^<version>` then `npx expo install --fix`).

## The judges

The owl has three possible brains. The game uses the best one it can reach:

1. **The PC judge** (free): Gemma 4 E2B running on your computer through
   llama.cpp, the same setup as the Study App. Real judgement and the owl's
   quips, in a few seconds. See [pc-judge/README.md](pc-judge/README.md).
2. **The built-in judge** (free, always there): a few grammar rules plus a
   tiny model that ships inside the game. It works offline and instantly, and
   you train it yourself (below). When the PC judge is configured but out of
   reach, it fills in *provisionally* ("OK?"), and those lines are re-checked
   once the PC judge is back. A provisional pass is never taken back.
3. **The Claude judge** (paid, switched off): see the last section.

The home screen tells you which judge is active.

### Use the PC judge

1. On the computer: double-click `pc-judge\1-setup.bat` once (or run
   `npm run pc-judge:setup`), then `pc-judge\2-start.bat` (or `npm run pc-judge`).
2. Copy the `EXPO_PUBLIC_JUDGE_URL=...` line it prints into `.env.local` (see
   `.env.example`) and restart the game with `npx expo start --clear`.

### Teach the judges

Every label you give becomes training data in [`training/`](training/README.md):

- **While playing:** tap **Wrong?** on any verdict and pick the right tier. On
  a cleared level, use **See the owl's verdicts** first.
- **Labelling screen** (only you): set `EXPO_PUBLIC_DEV_PIN` in `.env.local`,
  then **long-press the owl** on the home screen and enter the PIN. Tap a tier
  for each phrase; about 10 seconds a phrase.

With the PC judge running, labels go straight into `training/labels.jsonl` on
the computer. Then retrain the built-in judge, which takes a few seconds:

```sh
npm run train:judge
```

It also learns from every verdict the PC judge has given, so the built-in judge
gets better simply by you playing with the PC judge on. Once there are a few
hundred labels, the same data can fine-tune Gemma itself (a LoRA, like the
Study App's training kit) on the NVIDIA desktop.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the game core, judge client and content (Jest) |
| `npm run test:db` | Database migration tests in an in-process Postgres (PGlite) |
| `npm run test:pc-judge` | PC judge server tests |
| `npm run test:functions` | Claude judge function tests (needs [Deno](https://deno.com)) |
| `npm run train:judge` | Retrains the built-in judge from `training/` |
| `npm run pc-judge:setup` / `npm run pc-judge` | Sets up / starts the PC judge |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (Expo config) |
| `npm run build:words` | Regenerates the word data from `scripts/words/*.txt` (see below) |

## Word data

The curated word lists live in `scripts/words/`: `core.txt` is shared by
every level, and the other files are theme pools. Each line is
`<pos>: word word ...`. Nouns are singular, since the judge may read any noun
as plural. Slash-joined words (`eat/eats/ate`) are forms of one word and share
its rarity, so an inflected form isn't worth more than its base form. To add or
change words, edit the lists, then regenerate:

```sh
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
source .venv/bin/activate
npm run build:words
```

This annotates each word with its corpus frequency (via `wordfreq`), which
drives both draw odds and rarity points. It writes `src/data/words.json` (app)
and `supabase/functions/_shared/dictionary.json` (the judge only accepts
dictionary words). Commit both.

## Layout

```
src/
  app/            Expo Router screens: level select, play/[levelId]
  core/           Pure TypeScript game logic, no React: grid, draws, scoring,
                  the game reducer, the built-in judge (rules + tiny model) and
                  its phrase generator. Unit-tested in core/__tests__.
  data/           Word data and the built-in judge's model (both generated),
                  themes, hand-authored levels
  judge/          Judge service: picks the judge, on-device verdict cache,
                  labels, offline grading and re-checks
  app/dev/        The PIN-locked labelling screen
  lib/            Supabase client
  ui/             Board, hand tray, drag-and-drop, owl panel, result overlay
pc-judge/         The free PC judge: llama.cpp + Gemma behind a small HTTP server
training/         Labels and PC-judge verdicts for training
supabase/
  functions/      _shared/judgePrompt.ts is the judge prompt every judge uses;
                  judge/ is the optional Claude judge (judge.ts is the
                  testable request core, shared with the PC judge)
  migrations/     Verdict cache, appeals, rate limits, usage log and cost view
  tests/          Database tests
scripts/          Word list builder, word sources, judge eval, train-judge.ts
docs/DESIGN.md    Game design and phase plan
```

Tuning knobs (hand size, submits, penalties, tier multipliers, rarity curve,
draw weighting, star thresholds) are all in `src/core/config.ts`.

## Optional: the Claude judge (paid, off by default)

Kept for later, e.g. for launch. Nothing here is needed to develop or test the
game. It's used only when `EXPO_PUBLIC_JUDGE_URL` is empty and the Supabase
settings are filled in.

The judge is a Supabase Edge Function ([`supabase/functions/judge`](supabase/functions/judge/index.ts))
that sends a board's phrases to `claude-haiku-5-5` and returns a tier, reason
and owl quip for each phrase. The app never holds the Anthropic API key.

How a submit is judged:

1. **On the device:** phrases this player has had judged before (or that ship
   in `src/data/seedVerdicts.json`) are answered instantly from the
   on-device cache, even offline.
2. **On the server:** the app signs the player in anonymously and calls the
   function. Phrases any player has had judged before come from the shared
   `verdict_cache` table, and only new phrases go to Claude. Each player is
   rate limited (40 requests per 10 minutes, 400 per day; set
   `JUDGE_LIMIT_PER_10_MIN` / `JUDGE_LIMIT_PER_DAY` secrets to change them).
3. **Offline:** if the judge can't be reached, the built-in judge grades the new
   phrases *provisionally* ("OK?" in the app). They're re-checked in the
   background once the judge is reachable. A provisional pass is never taken
   back, only upgraded.

### Set it up

1. Create an API key at [console.anthropic.com](https://console.anthropic.com).
   API usage is billed separately from a Claude.ai subscription.
2. Create a Supabase project and turn on **anonymous sign-ins**
   (Authentication → Sign In / Providers). Then, from the repo root:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push                      # creates the tables in supabase/migrations
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy judge
   ```
3. In `.env.local`, fill in the Supabase URL and publishable key (Project
   Settings → API keys), leave `EXPO_PUBLIC_JUDGE_URL` empty, then restart with
   `npx expo start --clear`.

To run everything locally instead (needs Docker): put `ANTHROPIC_API_KEY=...`
in `supabase/functions/.env`, run `npx supabase start` (it applies the
migrations and prints a publishable key) and `npx supabase functions serve judge`,
and use `http://127.0.0.1:54321` as `EXPO_PUBLIC_SUPABASE_URL`.

### Running it

- **Cost per player:** `select * from judge_cost_daily;` in the SQL editor
  shows requests, cache hit rate, API cost and cost per active player per day.
  Every request is logged in `judge_calls`; the prices are in the migration.
- **Appeals:** a **Wrong?** tap on a "Nope" verdict files an appeal. Review the `appeals`
  table in the table editor. Set `status` to `upheld` with a `resolved_tier`
  to overwrite the verdict for everyone, or to `rejected`. One ruling settles
  every appeal of that phrase.
- **Changing the judge prompt:** edit `supabase/functions/_shared/judgePrompt.ts`
  (shared with the PC judge) and bump `PROMPT_VERSION`, so cached verdicts from
  the old prompt get re-judged (upheld appeals are kept). Then measure it:
  ```sh
  node --env-file=.env.local scripts/judge-eval/run.mjs
  ```
  It runs the labelled phrases in `scripts/judge-eval/phrases.json` and prints
  each verdict, overall agreement, the tier spread and latency.
- **Offline seed:** before a release, ship the most common verdicts with the
  app so new players can play offline from day one:
  ```sh
  SUPABASE_URL=... SUPABASE_SECRET_KEY=sb_secret_... node scripts/export_seed_verdicts.mjs 500
  ```
