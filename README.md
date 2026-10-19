# CrossPhrase

A crossword where every square holds a **word**. Every across and down run of
words has to read as an acceptable phrase. A bookish, slightly snarky owl (an
AI judge running on Claude Haiku) grades each phrase. Rare words and great
phrasing score the points needed to clear the level.

The full game design and phase plan are in [docs/DESIGN.md](docs/DESIGN.md).
This repo is at **Phase 1: core loop prototype**.

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

1. Create an API key at [console.anthropic.com](https://console.anthropic.com).
   API usage is billed separately from a Claude.ai subscription.
2. Create a Supabase project, then from the repo root:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy judge
   ```
3. Copy `.env.example` to `.env.local` and fill in the function URL and the
   project's anon key (Project Settings → API), then restart `npm start`.

To run the function locally instead (needs Docker): put `ANTHROPIC_API_KEY=...`
in `supabase/functions/.env`, run `npx supabase start` and
`npx supabase functions serve judge`, and point `EXPO_PUBLIC_JUDGE_URL` at
`http://127.0.0.1:54321/functions/v1/judge`.

**Measuring the judge.** `scripts/judge-eval/phrases.json` is a labelled set
of valid and invalid phrases. After any prompt change, run:

```sh
EXPO_PUBLIC_JUDGE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... node scripts/judge-eval/run.mjs
```

It prints each verdict, the overall agreement, the tier spread and latency.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the game core and content (Jest) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (Expo config) |
| `npm run build:words` | Regenerates the word data from `scripts/words/*.txt` (see below) |

## Word data

The curated word lists live in `scripts/words/`: `core.txt` is shared by
every level, and the other files are theme pools. Each line is
`<pos>: word word ...`. Nouns are singular, since the judge may read any noun
as plural. To add or change words, edit the lists, then regenerate:

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
  judge/          Client for the judge endpoint (falls back to local rules)
  ui/             Board, hand tray, drag-and-drop, owl panel, result overlay
supabase/
  functions/judge Edge Function that calls Claude Haiku
scripts/          Word list builder, word sources, judge eval
docs/DESIGN.md    Game design and phase plan
```

Tuning knobs (hand size, submits, penalties, tier multipliers, rarity curve,
draw weighting, star thresholds) are all in `src/core/config.ts`.
