# CrossPhrase

A crossword where every square holds a **word**. Every across and down run of
words has to read as an acceptable phrase. A bookish, slightly snarky owl (an
AI judge running on Claude Haiku) grades each phrase. Rare words and great
phrasing score the points needed to clear the level.

The full game design and phase plan are in [docs/DESIGN.md](docs/DESIGN.md).
This repo is at **Phase 2: judge and scoring hardening**.

## Run it

```sh
npm install
npm run web      # in a browser
npm start        # then scan the QR code with Expo Go (SDK 58) on a phone
```

With no judge configured, the app uses a **lenient local rule-based judge**,
which is enough for working on the UI. It only ever grades phrases "OK" or
"Nope". To get real verdicts, set up the AI judge below.

## The AI judge

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
3. **Offline:** if the judge can't be reached, the local rules grade the new
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
3. Copy `.env.example` to `.env.local`, fill in the project URL and
   publishable key (Project Settings → API keys), then restart `npm start`.

To run everything locally instead (needs Docker): put `ANTHROPIC_API_KEY=...`
in `supabase/functions/.env`, run `npx supabase start` (it applies the
migrations and prints a publishable key) and `npx supabase functions serve judge`,
and use `http://127.0.0.1:54321` as `EXPO_PUBLIC_SUPABASE_URL`.

### Running it

- **Cost per player:** `select * from judge_cost_daily;` in the SQL editor
  shows requests, cache hit rate, API cost and cost per active player per day.
  Every request is logged in `judge_calls`; the prices are in the migration.
- **Appeals:** players can appeal any "Nope" verdict. Review the `appeals`
  table in the table editor. Set `status` to `upheld` with a `resolved_tier`
  to overwrite the verdict for everyone, or to `rejected`. One ruling settles
  every appeal of that phrase.
- **Changing the judge prompt:** edit `supabase/functions/judge/model.ts`
  and bump `PROMPT_VERSION`, so cached verdicts from the old prompt get
  re-judged (upheld appeals are kept). Then measure it:
  ```sh
  EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... node scripts/judge-eval/run.mjs
  ```
  It runs the labelled phrases in `scripts/judge-eval/phrases.json` and prints
  each verdict, overall agreement, the tier spread and latency.
- **Offline seed:** before a release, ship the most common verdicts with the
  app so new players can play offline from day one:
  ```sh
  SUPABASE_URL=... SUPABASE_SECRET_KEY=sb_secret_... node scripts/export_seed_verdicts.mjs 500
  ```

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the game core, judge client and content (Jest) |
| `npm run test:db` | Database migration tests in an in-process Postgres (PGlite) |
| `npm run test:functions` | Judge function tests (needs [Deno](https://deno.com)) |
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
                  the game reducer, local judge. Unit-tested in core/__tests__.
  data/           Word data (generated), themes, hand-authored levels
  judge/          Judge service: on-device verdict cache, AI judge via Supabase
                  (anonymous sign-in, appeals), offline grading and re-checks
  lib/            Supabase client
  ui/             Board, hand tray, drag-and-drop, owl panel, result overlay
supabase/
  functions/judge Edge Function that calls Claude Haiku (judge.ts is the
                  testable core, model.ts the prompt, index.ts the wiring)
  migrations/     Verdict cache, appeals, rate limits, usage log and cost view
  tests/          Database tests
scripts/          Word list builder, word sources, judge eval
docs/DESIGN.md    Game design and phase plan
```

Tuning knobs (hand size, submits, penalties, tier multipliers, rarity curve,
draw weighting, star thresholds) are all in `src/core/config.ts`.
