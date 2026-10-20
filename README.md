# CrossPhrase

A crossword where every square holds a **word**. Every across and down run of
words has to read as an acceptable phrase. A bookish, slightly snarky owl (an
AI judge) grades each phrase. Rare words and great phrasing score the points
needed to clear the level.

The full game design and phase plan are in [docs/DESIGN.md](docs/DESIGN.md).
This repo is at **Phase 6: website and live ops**: the game is published as a
website anyone can play on their phone (no Expo Go, no app store), with
hearts, feathers and boosters, settings you can retune from the backend
without a new build, and anonymous play stats to see which levels are too
hard. Before that: a daily puzzle you can share, an endless zen mode,
leaderboards, 120 levels on a level map, stars, bonus objectives and
wildcards, an owl with moods and quips, sound and music, judged by free judges
you can train. Playtesting with friends is described in
[docs/PLAYTESTING.md](docs/PLAYTESTING.md).

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
  then **long-press the owl** on the home screen, enter the PIN and choose
  **Label phrases**. Tap a tier for each phrase; about 10 seconds a phrase.

With the PC judge running, labels go straight into `training/labels.jsonl` on
the computer. Then retrain the built-in judge, which takes a few seconds:

```sh
npm run train:judge
```

It also learns from every verdict the PC judge has given, so the built-in judge
gets better simply by you playing with the PC judge on. Once there are a few
hundred labels, the same data can fine-tune Gemma itself (a LoRA, like the
Study App's training kit) on the NVIDIA desktop.

## Levels

- **Every line is at least 4 words** (`MIN_ENTRY_LENGTH` in `src/core/config.ts`;
  layouts with shorter lines are rejected).
- **Levels 1–10** are a scripted tutorial ([`src/data/tutorial.ts`](src/data/tutorial.ts)).
  Each teaches one thing (crossings, anchors, swaps, tiers, rarity, hints,
  wildcards, bonus goals) and deals a fixed hand that can solve it.
- **Levels 11–120** come from the procedural generator
  ([`src/core/levelGen.ts`](src/core/levelGen.ts)). It grows a crossword
  layout to suit the level's difficulty band, adds anchors, then has a bot
  ([`src/core/levelBot.ts`](src/core/levelBot.ts)) play it by the real rules
  with the built-in judge. Layouts the bot can't clear with the level's own
  deal are thrown away. The bot's scores set the star thresholds, its solution
  places the soft hints, and its runs show which bonus goals are in reach.
- The levels are generated ahead of time into `src/data/levels.generated.json`,
  so everyone plays the same levels and the game never runs the generator:

  ```sh
  npm run generate:levels    # about a minute
  ```

  Regenerating after changing word lists, the built-in judge or the knobs in
  `src/core/config.ts` (draw weighting, `LEVEL_BANDS`, `STAR_BASELINE`) can
  change every level, so do it on purpose and commit the result.
- Progress (best stars and score per level) is saved on the device. A level
  unlocks when the one before it is cleared.

### Admin and developer tools

The admin account (**James**) gets a **🛠 Admin** button on the home screen,
on the website and in the app, with no PIN. Development builds also open the
same tools with `EXPO_PUBLIC_DEV_PIN` in `.env.local` (long-press the owl):

- **📊 Dashboard**: play stats in four tabs (Players: headline numbers, players
  per day, each daily puzzle; Levels: every level's wins, losses, quits, fail
  rate and ratings with ⚠ on hard ones, and how far players get; Economy:
  boosters and hearts, plus the economy settings; Feedback). Tap a level (or
  pick one) to **tune** it or its band (star targets and extra swaps); the
  Economy tab edits hearts, rewards and booster prices. Saving writes the
  remote config, so players get it next time they open the game.
- **Review players' corrections**: "Wrong?" taps from players, one card per
  phrase with how many players suggested each tier. Approve one as the tier it
  deserves, or reject it.
- **Label phrases**: rate generated phrases; the admin's labels count for
  training straight away.
- **The owl's moods**, **Unlock all levels**, **Add 100 feathers**, **Lose a
  heart** and **Reset progress**, for testing.

Admins are listed by account (`admins` table), not by name, so a deleted
"James" can't be re-registered by someone else to get in; the server checks
every admin request itself. To add another admin, in the SQL Editor:
`insert into admins (user_id) select user_id from accounts where username_key = 'name';`

**Training the built-in judge from the labels** (on the PC):

```sh
npm run pull:labels     # logs in as James (asks for the password) and adds approved labels to training/labels.jsonl
npm run train:judge     # retrains; check the agreement it prints
npm run bundle:server   # the leaderboard server judges with the same model
```

Then commit and push (the website rebuilds) and `npx supabase functions deploy scores`.

## Modes

- **Daily puzzle** (📅 on the home screen): the same board for everyone each
  day, one attempt. It's saved move by move, so leaving and coming back picks
  up where you were; once finished it stays finished. **Share** sends a
  spoiler-free card (the board as coloured squares, no words). Winning on
  consecutive days builds a 🔥 streak. Daily puzzles are always judged by the
  built-in judge, so everyone, and the leaderboard, judges them the same way.
  A year of them is generated ahead of time (`npm run generate:dailies`) into
  `src/data/dailies.generated.json`; regenerate with a later start date
  before it runs out (it covers 19 Oct 2026 to 19 Oct 2027).
- **Zen** (🧘): endless boards made on the spot. No star targets, no penalty,
  no limit on submits or swaps; a board clears when every line reads.
- **Leaderboards** (🏆): today's daily puzzle and each level. Players with an
  account show by their username, everyone else as "Anonymous owl". On the
  daily board, every solve ranks first; a daily that ran out of submits before
  its first star keeps its points but ranks below all of them ("unsolved"). They need
  the backend below; until then the screen says how to switch them on.

### Switch on the leaderboards (free)

Leaderboards use Supabase's free tier and no paid API. Scores are checked on
the server: the `scores` function ([`supabase/functions/scores`](supabase/functions/scores/index.ts))
replays each run's moves from the level's own deal with the app's game core
and re-judges every line with the built-in judge, so a phone can't just claim
a score. (That's also why a level judged by the PC judge can score a little
differently on the board.)

1. Create a Supabase project and turn on **anonymous sign-ins**
   (Authentication → Sign In / Providers). Then, from the repo root:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push                      # creates the tables in supabase/migrations
   npx supabase functions deploy scores
   npx supabase functions deploy account
   ```
2. In `.env.local`, fill in `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API keys) and
   restart with `npx expo start --clear`. This does **not** switch on the
   paid Claude judge (that needs `EXPO_PUBLIC_CLAUDE_JUDGE=on` as well).
3. Give friends a build with the same settings (or the website). Each phone
   signs in anonymously as a guest; players who make an account (below) show
   by their username.

The function bundles the game core (`npm run bundle:server` writes
`supabase/functions/_shared/scores.bundle.js`). After changing the core, the
word lists, the built-in judge, the levels or the dailies, rebuild it and
redeploy the function; `npm test` fails while the bundle is out of date.
Score submissions are rate limited (60 per 15 minutes per player;
`SCORES_LIMIT_PER_15_MIN` secret).

## Play it as a website

The game also builds as a website, which is how friends play it: they open a
link on their phone, no Expo Go or app store needed. It's published free on
GitHub Pages at **https://jameskladd.github.io/CrossPhrase/** by
[`.github/workflows/website.yml`](.github/workflows/website.yml) on every push
to `main` (after the type check and tests pass).

One-time setup on GitHub:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. For leaderboards and play stats: **Settings → Secrets and variables →
   Actions → Variables** → add `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the same values as `.env.local`).
   They're variables, not secrets, because they're public anyway: they end up
   inside the website. Never add the secret key.
3. Push to `main` (or **Actions → Website → Run workflow**). The Actions tab
   shows the build; the link appears on the deploy step when it's done.

On the phone, open the link in Safari, then **Share → Add to Home Screen**: it
opens full screen like an app, and Safari won't clear its saved progress (it
can clear a website's after a week without a visit). Progress lives in that
browser on that phone. The website uses the built-in judge: the PC judge can't
be reached from a public https site. To play the website with the PC judge,
run it from your computer instead (`npm run web`, then open
`http://<your-computer's-IP>:8081` on the phone, on the same Wi-Fi).

To build it yourself: `npm run build:web` writes the site to `dist/`
(`EXPO_BASE_URL=/CrossPhrase` builds it for that path, as Pages serves it).
Any static host works.

## Hearts, feathers and boosters

From level 11 (after the tutorial) the levels use a small economy, all in
[`src/core/economy.ts`](src/core/economy.ts):

- **Hearts** ❤️: 5, and losing a level costs one. They come back one every 30
  minutes, or all at once for feathers. The daily puzzle and zen mode never
  cost hearts.
- **Feathers** 🪶: earned by new stars (5 each), daily puzzles (10) and zen
  boards (1). New players start with 30.
- **Boosters**, bought with feathers during a level (🪶 button): a **hint**
  (the owl fills one line from your hand), **+2 swaps**, turning a hand word
  into a **wildcard**, and, on the "out of submits" card, **one more
  submit** (which gives the heart back). Boosted clears don't go on the
  leaderboards (the server refuses runs with boosters).
- **Ads**: none. If they come, they'll only ever be optional ones a player
  chooses to watch for a reward.

The wallet is kept on the device. Feathers can't be bought yet; when they can,
the wallet moves to the server so purchases can be checked.

## Tune it without an update (remote config)

The `remote_config` table holds settings the game reads when it starts. The
admin edits them from the in-game Dashboard (tune a level, the Economy tab);
they're also editable in Supabase → Table Editor → `remote_config`. Players
get a change the next time they open the game. Anything the game doesn't understand is
ignored, so a typo can't break it.

- **`economy`**: overrides for the defaults in `src/core/economy.ts`, e.g.
  `{"lives": {"refillMinutes": 20}, "boosters": {"hint": {"cost": 15}}}`, or
  `{"lives": {"enabled": false}}` to switch hearts off.
- **`tuning`**: level difficulty (`src/core/tuning.ts`), by band (`warm-up`,
  `early`, `mid`, `hard`, `late`) or by level id: `swaps` adds swaps and
  `stars` scales the star targets, e.g.
  `{"bands": {"mid": {"stars": 0.9}}, "levels": {"level-37": {"swaps": 1, "stars": 0.8}}}`.
  The leaderboard server applies the same tuning (it re-reads it every minute).
  The tutorial and the daily puzzles are never tuned. Draw weighting isn't
  tunable this way: it changes every deal, so it needs a regenerate.

## Play stats (analytics)

With the backend set up, the game sends small anonymous events (a level
started, each submit, won or lost, boosters used, the 😴/🙂/😤 rating on the
result card, feedback typed in Settings) to the `events` table, a batch at a
time. Players can switch this off in Settings. The admin reads them on the
in-game **Dashboard** (above); they're also in the Supabase Table Editor (or
SQL Editor) as these views:

| View | Shows |
|---|---|
| `level_stats` | Per level: players, starts, wins, losses, quits, **fail rate**, submits to win, stars, boosted clears and ratings |
| `level_funnel` | How many players reached each level |
| `daily_stats` | Each daily puzzle: players, wins, average score, shares, ratings |
| `active_players` | Players, sessions and games per day |
| `economy_stats` | Boosters bought, hearts refilled, players running out of hearts |
| `feedback` | What players wrote in Settings → Send feedback |

Judge cost is in `judge_cost_daily` (from Phase 2). Events stay until you
delete them; on the free tier, `delete from events where created_at < now() - interval '90 days';`
in the SQL Editor keeps the table small.

## Accounts and cloud save

Players can make an account (👤 at the top left of the home screen, or
Settings → Account) with a **username and password**, and log in with it on
any device: the website on a phone, another browser, the app. Their stars,
daily puzzles, zen totals, hearts and feathers are kept in a cloud save
(the `saves` table) and synced at start-up, a few seconds after each change
and when the game goes to the background. The username is their name on the
leaderboards.

- **Making an account** turns the player's guest (anonymous) user into the
  account, so everything played so far, leaderboard scores included, stays
  theirs. The `account` function ([`supabase/functions/account`](supabase/functions/account/index.ts))
  does it with Supabase Auth.
- **Logging in on another device** adds what was played there as a guest to
  the account. Merging never loses progress: the best stars and score per
  level, finished daily puzzles, and feathers kept as a ledger so earning on
  one device and spending on another both count.
- **Logging out** saves first, then starts that device over as a guest.
  **Delete account** (on the account screen) removes the account, its save and
  its scores everywhere.
- There's **no email**, so a forgotten password can't be reset. Under the hood
  each account is a Supabase Auth user with a made-up address
  (`<username>@players.crossphrase.invalid`, a domain that can never receive
  mail); nothing is ever sent to it. Usernames are 3–16 letters, numbers,
  `-` and `_`; passwords need 8 characters and can't be a common one
  (`supabase/functions/_shared/accountRules.ts`).
- Nothing to switch on in the dashboard beyond what the leaderboards need
  (anonymous sign-ins; the Email provider stays on, as it is by default). In
  Authentication → Users, accounts show with their made-up address.

**After pulling these changes**, update the backend: `npx supabase db push`
(new tables, views and the admin functions), `npx supabase functions deploy scores` (it now
applies the tuning) and `npx supabase functions deploy account` (new).

## The owl, sound and settings

- **The owl** ([`src/ui/Owl.tsx`](src/ui/Owl.tsx)) is drawn in vector shapes:
  placeholder art until a commissioned mascot replaces it. It has six moods
  (idle, thinking, pleased, delighted, dazzled, disappointed), blinks, bobs,
  hops when pleased and shakes its head when not. Tap it for a hoot.
- **Verdicts are revealed one line at a time**: each line gets the owl's
  quip in its speech bubble, a sound, a haptic and a reaction; poetic lines
  and cleared levels get confetti, and stars pop in one by one. The AI judges
  write their own quips; the built-in judge and the owl's other lines come from
  [`src/core/quips.ts`](src/core/quips.ts).
- **Sounds and music** are synthesised by `npm run make:sounds`
  ([`scripts/make-sounds.mjs`](scripts/make-sounds.mjs)) into `assets/sounds/`:
  no samples, nothing to license, and the same files every run. Edit the
  script, not the WAVs. They respect the phone's silent switch and let your
  own music keep playing.
- **Settings** (⚙️ on the home screen): sound effects, music, vibration,
  reduce motion (also follows the phone's setting), colour-blind-friendly
  verdict colours, play stats on or off, and **Send feedback**. The build
  number at the bottom says which website version a tester is on. Verdicts always carry an icon (✗ ✓ ★ ✦) as well as a
  colour, tiles and buttons have screen-reader labels, and text follows the
  phone's text size (word tiles stay fixed so they fit the board).
- The app icon is the owl, rendered from the same component.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the game core, judge client and content (Jest) |
| `npm run test:db` | Database migration tests in an in-process Postgres (PGlite) |
| `npm run test:pc-judge` | PC judge server tests |
| `npm run test:functions` | Edge Function tests: the judge and scores (needs [Deno](https://deno.com)) |
| `npm run train:judge` | Retrains the built-in judge from `training/` |
| `npm run rescore:dailies` | One-off: fills in the points of unsolved daily runs saved as 0 before they kept their points (logs in as James) |
| `npm run pull:labels` | Downloads approved training labels (yours and reviewed corrections) into `training/labels.jsonl` |
| `npm run generate:levels` | Regenerates levels 11–120 (see Levels above) |
| `npm run generate:dailies` | Regenerates a year of daily puzzles |
| `npm run bundle:server` | Rebuilds the leaderboard server's copy of the game core |
| `npm run build:web` | Builds the website into `dist/` (see Play it as a website) |
| `npm run make:sounds` | Regenerates the sound effects and music in `assets/sounds/` |
| `npm run pc-judge:setup` / `npm run pc-judge` | Sets up / starts the PC judge |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (Expo config) |
| `npm run build:words` | Regenerates the word data from `scripts/words/*.txt` (see below) |

## Word data

The curated word lists live in `scripts/words/`: `core.txt` is shared by
every level, and the other files are theme pools (Breakfast, Night Sky,
Garden, Seaside, Library). A new theme also needs an entry in
`src/data/themes.ts`. Each line is
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
  app/            Expo Router screens: the level map, play/[levelId]
  app/dev/        The PIN-locked developer tools and labelling screen
  core/           Pure TypeScript game logic, no React: grid, draws, scoring,
                  bonus objectives, the game reducer, the built-in judge
                  (rules + tiny model), the level generator and its bot.
                  Unit-tested in core/__tests__.
  data/           Word data, the built-in judge's model and the generated
                  levels (all generated), themes, the tutorial levels
  judge/          Judge service: picks the judge, on-device verdict cache,
                  labels, offline grading and re-checks
  app/daily.tsx, zen.tsx, leaderboards.tsx   The other modes
  progress/       Saved stars and scores, daily attempts, zen totals, unlocks
  economy/        The wallet: hearts and feathers on this device
  remote/         Remote config: economy and level tuning read from the backend
  analytics/      Play stats: queued anonymous events sent in batches
  account/        Accounts and the cloud save: sign up / log in, merging, syncing
  app/account.tsx The account screen
  scores/         Leaderboard client: sends runs, queues them offline, reads boards
  server/         What the leaderboard server runs (scoring by replay), bundled for Supabase
  settings/       Sound, music, vibration, motion and colour settings
  lib/            Supabase client, anonymous sign-in, build info
  ui/             The owl, board, hand tray, drag-and-drop, owl panel, star
                  bar and goals, wildcard picker, result overlay, confetti,
                  sounds and haptics (feedback.ts)
assets/sounds/    Generated sound effects and music
pc-judge/         The free PC judge: llama.cpp + Gemma behind a small HTTP server
training/         Labels and PC-judge verdicts for training
supabase/
  functions/      _shared/judgePrompt.ts is the judge prompt every judge uses;
                  judge/ is the optional Claude judge (judge.ts is the
                  testable request core, shared with the PC judge);
                  scores/ checks and saves leaderboard runs;
                  account/ makes and deletes accounts
  migrations/     Verdict cache, appeals, rate limits, usage log, cost view,
                  leaderboards, remote config, play stats and their views,
                  accounts and cloud saves
  tests/          Database tests
scripts/          Word list builder, word sources, judge eval, train-judge.ts,
                  generate-levels.ts, generate-dailies.ts, make-sounds.mjs,
                  bundle-server.mjs
public/           The website's page template, web app manifest and icons
.github/workflows/website.yml   Builds and publishes the website
docs/DESIGN.md    Game design and phase plan
docs/PLAYTESTING.md   How to run a playtest with friends
```

Tuning knobs (hand size, submits, penalties, tier multipliers, rarity curve,
draw weighting, wildcards, bonus points, star thresholds and the generator's
difficulty bands) are all in `src/core/config.ts`; the economy's are in
`src/core/economy.ts`. Swaps, star targets and the economy can also be
changed live through the remote config (above).

## Optional: the Claude judge (paid, off by default)

Kept for later, e.g. for launch. Nothing here is needed to develop or test the
game. It's used only when `EXPO_PUBLIC_JUDGE_URL` is empty, the Supabase
settings are filled in **and** `EXPO_PUBLIC_CLAUDE_JUDGE=on`.

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
   Settings → API keys), set `EXPO_PUBLIC_CLAUDE_JUDGE=on`, leave
   `EXPO_PUBLIC_JUDGE_URL` empty, then restart with `npx expo start --clear`.

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
