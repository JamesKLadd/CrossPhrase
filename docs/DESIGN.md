# CrossPhrase: Design & Implementation Plan

> A crossword where every cell holds a **word**, and every across/down run must read as an acceptable phrase. An AI judge grades the phrases, and rare words plus great phrasing earn the score needed to clear a level.

Status: pre-production · Target: mobile (iOS + Android) · Team: solo · First milestone: playable prototype

---

## 1. Decisions so far

| Area | Decision |
|---|---|
| Grid | Crossword-style layout with blocked cells. Grid size grows with level progression |
| Cell constraints | Free placement, plus **pre-filled anchor words** and **part-of-speech (POS) hints** on some cells |
| Hand | 7 words, refilled after each placement. **Limited swaps per level** |
| Editing | Placed words can be moved or removed freely until submit |
| Judging | **One AI call on full submit**, judging every entry at once |
| Invalid phrase | Bad lines are highlighted; the player rearranges and resubmits |
| Strictness | **Tiered quality**: invalid / OK / great / poetic. The tier feeds into score |
| AI feedback | **Witty mascot commentary** plus an **appeal button** that logs disputes |
| Scoring | Word rarity (corpus frequency) × the phrase's AI quality multiplier |
| Draw | Pure random from the dictionary, weighted by word frequency (nouns and theme words a little more likely). Glue words (the, a, of, is) arrive through the normal draw. **Wildcard** tiles are rare draws (1.5%) that become any dictionary word, at half its value |
| Win condition | 1–3 stars from score thresholds, plus **bonus objectives** |
| Stack | React Native + Expo (TypeScript) |
| Monetization | Lives/energy, IAP boosters, rewarded ads (all deferred to a late phase) |
| Modes | Level map, then Daily puzzle, Zen/endless, and Leaderboards |
| Art | Cozy mascot: **a smart-looking owl in reading glasses**, and it's allowed to be snarky |
| Offline | Offline fallback (cached verdicts + lenient local check, re-verified later) |
| Levels | Procedurally generated, each with a **theme that has its own word pool** |
| Submits | **3 submits per level.** Each failed submit costs points; failing the third fails the level |
| POS hints | Always soft. They're never enforced, so players keep creative freedom |
| Repeats | The same word can appear more than once on a board |
| Word forms | A noun can be read as singular or plural in each phrase. Every other word must be used exactly as drawn |
| Language | English only at launch |
| AI provider | **Free judges for development** (§5.0): a PC judge (Gemma 4 E2B via llama.cpp, like the Study App) and a tiny built-in model trained on our own labels. Claude Haiku 5.5 is built but switched off until launch |

---

## 2. Core rules (v1 spec)

### 2.1 Board
- The grid has **open cells** and **blocked cells**, as in a crossword.
- An **entry** is any maximal horizontal or vertical run of at least 2 open cells. Each entry must form an acceptable phrase, read left→right or top→bottom.
- A cell where two entries cross is a **crossing cell**. Its word must work in both phrases. This is where most of the puzzle's difficulty, and its strategy, comes from.
- Some cells are **anchors**: pre-filled, locked words.
- Some cells carry a **POS hint** (noun / verb / adjective / adverb / function word). Hints are always *soft*: they show on the cell (dictionary-style, e.g. *n.*, *adj.*), but placement isn't blocked and the judge never sees them.

### 2.2 Hand & swaps
- Each level starts with 7 drawn words. Placing a word draws a replacement at once.
- **Removing a word from the board returns it to the hand.** The hand can grow above 7, but draws only refill up to 7. That stops players farming draws by placing and removing.
- **Swaps:** each level grants N (by difficulty, roughly 3–5). A swap discards one hand word and draws a new one. The *+Swaps* booster adds more.
- **Wildcard tile:** rare, 1.5% of draws. When placed, the player searches the game dictionary and picks a word (see §5.4: only dictionary words, which also blocks prompt injection). It scores half that word's rarity value, rounded up, so it fills a gap rather than handing out free rare words. A wildcard sent back to the hand forgets its word.

### 2.3 Draw distribution
- Each level has a **theme** (Breakfast, Night Sky, Garden…). The draw pool is the theme's own word list plus a shared **core pool** of glue words and everyday verbs, adjectives and pronouns.
- Draws are random **with replacement** (repeats are allowed). Each word's chance is weighted by its corpus frequency, with a cap so "the" doesn't flood the hand. Theme words get a small boost so the theme comes through, and so do nouns: they only come from theme pools, and most phrases need one. The hand naturally gets the mix of glue and content words that real phrases need, and the weighting curve is a tuning knob (`src/core/config.ts`).
- Tutorial levels can script their first draws (a **deck**); random draws take over when it runs out.
- Draws are seeded per level, so a replay of the same level deals the same sequence.

### 2.4 Submit loop
1. Every open cell is filled → the **Submit** button lights up.
2. The client sends all entries and their hints to the judge (§5).
3. Results come back: each entry gets `valid`, a `tier`, a short reason, and a mascot quip.
4. If any entry is invalid, those lines glow red with their reason, and the player fixes them and resubmits. Lines that already passed stay cached, so resubmitting only re-judges the changed entries.
5. All entries valid → score → star check → level complete.

**Submit limit:** each level allows **3 submits**. A submit *fails* if any entry is invalid **or** the score (after penalties) is below the 1★ threshold. Each failed submit subtracts a penalty, currently 15% of the 1★ threshold (tunable). Failing the third submit fails the level, and the player can retry it.

### 2.5 Scoring

```
wordValue(w)   = rarity points from a corpus frequency tier, 1–10
                 (e.g. Zipf ≥ 6 → 1, ... , Zipf < 2.5 → 10; glue words ≈ 0–1)
entryScore(e)  = Σ wordValue(w in e) × tierMult(e)
                 tierMult: OK ×1.0, great ×1.5, poetic ×2.0
levelScore     = Σ entryScore(all entries) + bonusObjectivePoints
```

- A word in a crossing cell scores in **both** of its entries. That rewards putting rare words on intersections, which is the hardest place to make them fit. It's the game's main risk/reward lever.
- Rarity comes from a **local, deterministic** frequency table (e.g. the `wordfreq` Zipf values, baked into the app). Only the quality tier depends on the AI.
- Stars: 1★ = pass threshold, 2★ and 3★ are higher thresholds. Thresholds come from the level generator (§6).

### 2.6 Bonus objectives
- Use a word of N+ letters (7 mid-game, 8 late)
- Get a line judged Great or better
- Use N words from the level's theme
- Finish with N swaps to spare
- Put a word worth N+ points on a crossing cell

Each level gets 0–2 objectives (none in the first generated band). Each one met adds points, 20% of the level's 1★ threshold, before stars are counted. They never rescue a board with an invalid line. Anchors don't count toward them; wildcards do. Progress shows live under the star bar.

---

## 3. Experience & feel

- **Mascot:** a smart-looking owl in reading glasses, a little snarky. It's the voice of the judge. It reacts to each line on submit ("'Moonlit soup whispers'? Bold. I respect it.") and celebrates poetic tiers. The commentary is the main source of personality, the way MeowDoku leans on its cats.
- **Juice:** satisfying tile snap, a staggered line-by-line verdict reveal (which also hides API latency), confetti/ink-splash on poetic lines, haptics on placement and verdicts, and a star-burst on level clear.
- **Latency budget:** a submit should feel like 1–2 seconds. The reveal animation starts at once and resolves line by line as verdicts arrive.
- **FTUE:** the first 10 levels are a scripted tutorial ("Owl School") with fixed decks and an owl tip each: placing words, crossings, anchors, swaps, tiers, rarity, hints, wildcards and bonus goals, then a 4×4 "final exam". Randomness starts at level 11.

---

## 4. Tech architecture

```
┌────────────── Expo app (TypeScript) ──────────────┐
│ UI: React Native + Reanimated + Skia (effects)    │
│     Gesture Handler (drag/drop), expo-haptics     │
│ State: Zustand · Storage: MMKV                    │
│ Game core (pure TS, unit-tested, no React):       │
│   grid model, entry extraction, draw/RNG, scoring,│
│   level generator, local rule check               │
│ Bundled data: dictionary + POS + Zipf frequency   │
└───────────────┬───────────────────────────────────┘
                │ HTTPS (judge, progress, leaderboards)
┌───────────────▼───────────────────────────────────┐
│ Backend (Supabase: Postgres + Auth + Edge Fns)    │
│   /judge  → verdict cache lookup → LLM call       │
│   verdict_cache, appeals, scores, daily seeds     │
│   rate limiting per user/device                   │
└───────────────┬───────────────────────────────────┘
                ▼
          LLM provider (see §5)
```

- **Keep the game core free of React.** Grid logic, scoring and generation live in `packages/core` (or `src/core`) as pure functions with Jest tests. That keeps the hardest logic testable, and it could later run server-side to validate leaderboard scores.
- **Seeded RNG everywhere** (level layout, draw order). Level N = seed N, and the daily puzzle uses the date as its seed. Everyone sees the same puzzle, and replays can be reproduced for debugging.
- Ads and IAP need native modules, so plan on **Expo dev builds** (EAS) rather than Expo Go once Phase 6 starts.

---

## 5. The AI judge

### 5.0 Current strategy: free judges you can train (decided after Phase 2)
No API spending during development. The game picks the best judge it can reach:

1. **PC judge:** Gemma 4 E2B (Apache-2.0) on the developer's computer through llama.cpp (Vulkan + MTP), the same stack as the Study App, reusing its downloads. Same `/judge` contract and shared prompt as the Claude judge, with hard grammar rules applied first and a compact-JSON grammar to cut output tokens. Measured on the eval set: 27/30 agreement (prompt v2); about 33 output tokens per phrase.
2. **Built-in judge:** hard rules plus a tiny logistic-regression model (POS patterns + word pairs; ~90 KB) inside the app. Offline, instant, trained by `npm run train:judge` from human labels, the PC judge's verdicts (distillation) and a generated starter set. Starter model: 28/30 on the eval set.
3. **Claude judge:** the Phase 2 Supabase function, kept for launch and off unless configured.

Training data comes from **Wrong?** corrections during play and a PIN-locked labelling screen, saved to `training/` on the PC. Next step once there are a few hundred human labels: a LoRA fine-tune of Gemma on the NVIDIA desktop, adapted from the Study App's training kit.

### 5.1 Your cost question, answered
- **A Claude subscription (Pro/Max) does *not* cover API usage.** The API is billed separately, pay-as-you-go, through the Claude Console. Your game's API traffic would never touch your chat plan's limits, and your plan wouldn't pay for it either.
- **The cost is small if you use the smallest current model.** At current list prices Claude Haiku 5.5 is **$0.10 per million input tokens and $0.50 per million output tokens.** Rough estimate for one submit (around 10 entries): ~1,000 input tokens (mostly a reusable, cacheable instruction prompt) and ~300 output tokens (verdicts + quips) ≈ **$0.00025 per submit, about 4,000 submits per dollar.** Prompt caching on the fixed instructions cuts the input side further.
- **The verdict cache multiplies the savings.** Players will reuse common phrases ("the big dog"). Normalized phrase → verdict is stored in Postgres, and a cache hit costs nothing. The cache doubles as the offline dataset (§5.5).
- **Free or self-hosted alternatives** (a small open model fine-tuned on judged phrases) are feasible *later*: the verdict cache and appeal logs become the training set. But running inference yourself costs server time, and quality will be worse at launch. Recommendation: **ship with Haiku behind a provider-agnostic `/judge` endpoint, then revisit once you have real usage data and a labeled dataset.** The app never knows which model is behind the endpoint.

> Rough budgeting: 1,000 daily players × 20 submits/day × ~50% cache miss ≈ 10k calls/day ≈ **$2.50/day**. Rewarded ads alone should more than cover that.

### 5.2 Judge contract (structured JSON output)

Request:
```json
{ "entries": [
  { "id": "1A", "words": ["quiet", "fox", "dream"] },
  { "id": "2D", "words": ["fox", "eat", "plum"] }
]}
```
Response:
```json
{ "verdicts": [
  { "entryId": "1A", "valid": true, "tier": "great", "reading": "quiet foxes dream", "reason": "", "quip": "Sleepy foxes? Adorable." },
  { "entryId": "2D", "valid": true, "tier": "ok", "reading": "foxes eat plums", "reason": "", "quip": "Nutritious." }
]}
```
Use the provider's structured-output / JSON-schema mode so the response always parses.

### 5.3 Judge rubric (prompt sketch)
- **invalid:** ungrammatical, or no plausible reading as English (fragments are allowed if a person could naturally say them: headlines, song titles, "big dog energy").
- **ok:** grammatical and sensible but plain.
- **great:** vivid, funny, or a clever use of the words.
- **poetic:** genuinely striking, idiomatic or lyrical.
- Phrases don't have to be complete sentences. Noun phrases and imperatives count.
- Any noun may be read as singular or plural, chosen separately in each phrase. The judge returns the `reading` it used so the UI can show it. Every other word must stay exactly as written.
- Leniency is a dial. Build a **50–100 phrase eval set** with your own expected verdicts, and re-run it after every prompt change.

### 5.4 Safety & abuse
- Players can only submit **dictionary words** (wildcards included), so free text never reaches the prompt and prompt injection is a non-issue.
- Filter profanity and slurs from the dictionary, or tag them so the judge can mark offensive phrases invalid.
- Rate-limit `/judge` per device/user, and require auth (anonymous Supabase auth is fine) so the endpoint can't be abused as a free LLM proxy.

### 5.5 Offline fallback
1. A local verdict cache, seeded with the most common judged phrases shipped in the app and grown from the player's own online verdicts.
2. A **lenient local rule check** using POS patterns (e.g. rejects `the the the`, accepts `DET ADJ NOUN`). It can't grade beyond tier "ok".
3. Offline results are **provisional**. When the device reconnects they're re-judged silently. To keep it friendly, a provisional pass is never revoked; the player just gains the extra tier points if the real verdict is higher.
4. Daily puzzle and leaderboard submissions require online judging.

### 5.6 Appeals
The appeal button stores `{entry, verdict, user, timestamp}`. You review the queue in a simple admin view (the Supabase table editor is fine at first). An upheld appeal overwrites the cached verdict, and recurring patterns feed back into the prompt and eval set. Optionally give a small reward for upheld appeals.

---

## 6. Procedural level generation

Built in Phase 3 (`src/core/levelGen.ts`, `src/core/levelBot.ts`). Difficulty bands (`LEVEL_BANDS` in `src/core/config.ts`):

| Band | Levels | Max grid | Entries | Words per entry | Loop chance | Anchors | Hints | Swaps | Objectives | 1★ vs bot |
|---|---|---|---|---|---|---|---|---|---|---|
| Tutorial | 1–10 | 4×4 | 2–4 | 2–4 | – | scripted | scripted | 5 | scripted | 2★ = the intended fill |
| Warm-up | 11–20 | 4×4 | 3–4 | 2–3 | 0 | 1–2 | 50% of cells | 5 | 0 | 0.75 |
| Early | 21–40 | 5×5 | 4–6 | 2–4 | 15% | 1–2 | 35% | 4 | 1 | 0.80 |
| Mid | 41–70 | 5×5 | 5–8 | 2–4 | 30% | 1–2 | 25% | 4 | 1 | 0.85 |
| Hard | 71–100 | 6 rows × 5 | 6–9 | 3–5 | 40% | 1–3 | 15% | 4 | 1 | 0.90 |
| Late | 101+ | 6×6 | 8–10 | 2–5 | 50% | 1–2 | 10% | 3 | 1–2 | 0.95 |

Grids stop at 6×6: past that, word tiles get too small to read on a phone.

Steps:
1. **Layout:** grow a crossword one entry at a time. Each new entry crosses an existing one and must add exactly one across/down run (no merging into another run, no stray side-by-side cells). Entries that cross two or more others close loops, which makes boards much harder; each band sets how often that's allowed. Sprawling layouts (under 42% open) and ones made mostly of two-word entries are rejected.
2. **Anchors:** at most one per entry, from a friendly list by position: an opener ("the", "we") where entries start, a link word ("of", "and") mid-entry, otherwise a common theme noun.
3. **Bot playthroughs:** a bot plays the level by the real rules (same deal, refills and swaps) and is judged by the built-in judge. It fills one entry at a time, trying every way to put its hand words in, swaps when stuck and backs up when it paints itself into a corner. A careful bot picks the phrases the judge is surest of; a greedy one chases rare words. A layout is kept only if the careful bot clears the level's own deal, plus 2 of 4 other deals (fallback: the best attempt with 2 of 5).
4. **Thresholds:** 1★ = the careful bot's median score × the band factor, but never more than it scored on the level's own deal. 3★ = 0.95 × the greedy bot's median, at least 40% above 1★. 2★ sits halfway. Tune from real completion data later.
5. **Hints and objectives:** soft POS hints come from the bot's own solution (so they agree with at least one real fill), preferring crossings. Bonus objectives are picked from the five kinds, favouring ones the greedy bot met sometimes but not always.
6. **Shipped, not generated on the phone:** `npm run generate:levels` writes levels 11–120 to `src/data/levels.generated.json` (~50 KB, about a minute to run). Everything is seeded, so the output is reproducible. Generating at runtime would mean levels (and earned stars) silently changing whenever the built-in judge is retrained; shipping the file keeps every player's levels identical until we regenerate on purpose.

Levels 1–10 are the hand-written tutorial; everything after is procedural. Themes rotate in chapters of 10: Breakfast, Night Sky, Garden, Seaside, Library.

---

## 7. Implementation phases

Each phase ends in a **playable build** with a clear exit test.

### Phase 0: Paper prototype & judge spike (≈1 week)
- Print a few grids, write ~150 word cards, play with friends while a human acts as "the judge". Is filling crossings fun? Is 7 words the right hand size?
- A script that sends ~100 sample phrases to Haiku with the draft rubric and records verdicts, latency and token cost.
- Pick the dictionary source and frequency list (e.g. `wordfreq` + a POS lexicon), and build the bundled word-data file.
- **Exit:** the core loop is fun on paper; the judge agrees with your eval verdicts at least ~85% of the time; measured cost per submit is acceptable.

### Phase 1: Core loop prototype (≈3–4 weeks)
- Expo project, TypeScript, lint/test setup, `core` module with unit tests.
- Grid model and entry extraction, rendering of hand-authored layouts (5–10 JSON levels).
- Hand: draw (frequency-weighted, seeded), place via drag/drop, move/remove, refill, limited swaps.
- Submit → Supabase `/judge` edge function → Haiku → per-line verdict display.
- Scoring and the 1-star pass check. No stars UI polish, no mascot art (placeholder text quips).
- **Exit:** you can hand the phone to someone and they can finish a level without help, and want to try another.

**Status (Phase 1 setup):**
- [x] Expo SDK 57 (matches the App Store's Expo Go; started on 58, which it can't open) + Expo Router + TypeScript, Jest, ESLint
- [x] `src/core`: grid/entries, seeded frequency-weighted draws with theme pools, scoring, game reducer (place/move/remove/swap, 3 submits, failed-submit penalty, verdict cache with partial re-judging)
- [x] Word data: core pool + 3 themes (Breakfast, Night Sky, Garden) with `wordfreq` rarity
- [x] 8 hand-authored levels with anchors and soft POS hints
- [x] Board, hand tray, drag-and-drop plus tap-to-place, owl panel with per-line verdicts, result screen
- [x] `/judge` Supabase Edge Function → Claude Haiku 5.5 with structured output, dictionary-only input, reading check
- [x] Local rule-based judge (dev mode, and the base for the offline fallback)
- [x] Judge eval set + runner (`scripts/judge-eval`)
- [ ] Deploy the judge and run the eval against the real model; tune the prompt
- [ ] Playtest on real phones; tune hand size, draw weighting, star thresholds
- [x] Inflected verb forms share their base form's rarity (done in Phase 2)

### Phase 2: Judge & scoring hardening (≈2 weeks)
- Quality tiers with multipliers, crossing double-scoring, rarity curve tuning.
- Server verdict cache (normalized phrases), partial re-judging on resubmit.
- Eval-set runner script; prompt iteration.
- Appeal button and appeal table.
- Offline fallback: local cache, POS rule check, provisional verdicts and reconciliation.
- Rate limiting and anonymous auth.
- **Exit:** verdicts feel fair to playtesters; airplane mode doesn't break play; cost per active user is measured.

**Status (Phase 2):**
- [x] Rarity: word forms (`eat/eats/ate`) share one rarity, so inflections aren't worth extra
- [x] Server verdict cache (`verdict_cache`): only new phrases reach Claude; `PROMPT_VERSION` invalidates old verdicts, upheld appeals are kept; hit counts recorded
- [x] On-device verdict cache (expo-sqlite `localStorage`) plus a shipped seed (`src/data/seedVerdicts.json`, exported by `scripts/export_seed_verdicts.mjs`)
- [x] Offline fallback: unknown phrases graded provisionally by the local rules ("OK?"), queued and re-checked on reconnect, app foreground and every 30s. Provisional passes are never revoked, only upgraded, and a won level is rescored if that raises it
- [x] Appeals: Appeal button on "Nope" verdicts; `appeals` table with RLS, verdict snapshot, and a trigger that applies an upheld ruling to the cache and settles every appeal of the phrase
- [x] Anonymous sign-in for every player; the judge requires a signed-in user (`@supabase/server`, `auth: 'user'`)
- [x] Rate limits per player (`consume_judge_quota`): 40 requests / 10 min, 400 / day
- [x] Cost per active player: every request logged to `judge_calls`; `judge_cost_daily` view prices tokens
- [x] Prompt caching on the judge's system prompt
- [x] Tests: Jest (game + judge client), Deno (judge function), PGlite (migrations)
- [ ] Deploy, run the eval against real Haiku, iterate on the prompt (needs an Anthropic API key)
- [ ] Playtest for fairness; watch `judge_cost_daily` and the appeal queue
- [ ] Later hardening: CAPTCHA on anonymous sign-ins if abuse shows up (Supabase supports it)

**Status (Phase 2b, free judges):**
- [x] PC judge (`pc-judge/`): Gemma 4 E2B via llama.cpp, Study App downloads reused, pinned + checksummed setup, GPU→CPU fallback, rules first, compact-JSON grammar, verdict memory and label collection in `training/`
- [x] Built-in judge: rules + tiny trained model (`src/core/tinyJudge.ts`), training script with held-out and eval reporting
- [x] "Wrong?" corrections in play (also on cleared levels via "See the owl's verdicts") and a PIN-locked labelling screen
- [x] Judge prompt shared by every judge (`supabase/functions/_shared/judgePrompt.ts`), v2 with examples of invalid phrases
- [ ] Collect a few hundred labels; retrain the built-in judge
- [ ] LoRA fine-tune of Gemma from the labels (port the Study App kit)

### Phase 3: Levels & progression (≈3 weeks)
- Procedural generator plus simulation bot for star thresholds.
- Anchors, POS hint badges, wildcard tiles.
- Stars UI, bonus objectives, level-complete screen.
- Level map (scrolling path), local save, cloud save via Supabase.
- Scripted FTUE for levels 1–10.
- **Exit:** 100+ levels with a sensible difficulty curve, and testers progress without a wall.

**Status (Phase 3):**
- [x] Procedural generator (§6): grown crossword layouts, friendly anchors, bot-checked solvability on each level's own deal, star thresholds from careful/greedy bot playthroughs, hints from the bot's solution
- [x] 120 levels: a 10-level scripted tutorial with fixed decks and owl tips, then 110 generated levels in five bands; tests check every layout, the rising difficulty, and that the bot clears each tutorial level
- [x] Two new themes, Seaside and Library (now 502 words); built-in judge retrained on them
- [x] Anchors, POS hint badges, wildcard tiles (1.5% of draws, dictionary picker, half value)
- [x] Star bar with live score estimate, bonus objectives with live progress, level-complete card with score breakdown, objectives and "New best!"
- [x] Level map: winding path in theme chapters, stars per level, locked levels, scrolls to the next level to play
- [x] Local save (best stars and score per level; unlocking); PIN-locked developer menu with labelling, unlock-all and reset
- [x] Nouns drawn a little more often (draw balance)
- [ ] Cloud save via Supabase (waits on the backend being switched on)
- [ ] Playtest the curve: are 1★ targets fair with the PC judge (stricter than the built-in judge the bot uses)? Adjust `LEVEL_BANDS` / `STAR_BASELINE` and regenerate

### Phase 4: Identity & juice (≈3 weeks)
- Mascot design (commission an artist or use a placeholder style), idle and reaction animations.
- AI quips wired to the mascot speech bubble, plus a set of canned fallback quips for offline/cache hits.
- Tile, verdict and level-clear effects (Skia/Reanimated), haptics, sound and music.
- Settings, accessibility (font scaling, color-blind-safe verdict colors).
- **Exit:** a stranger watching a clip of it says "that looks cute and fun".

### Phase 5: Modes & social (≈2–3 weeks)
- **Daily puzzle:** date-seeded, one attempt plus resubmits, shareable emoji result card.
- **Zen mode:** endless boards, no threshold, no lives.
- **Leaderboards:** daily + per-level, with server-side score recomputation using the shared `core` module.
- **Exit:** daily puzzle runs for 2 weeks with friends without exploits.

### Phase 6: Monetization & live ops (≈3 weeks)
- Switch to EAS dev builds.
- Lives/energy (refill timer), boosters (+swaps, wildcard, hint), IAP via RevenueCat.
- Rewarded ads (AdMob via `react-native-google-mobile-ads`).
- Analytics (PostHog/Amplitude): funnel, level fail rates, submit counts, judge cost.
- Remote config for difficulty knobs, draw weighting, swap counts.
- **Exit:** the economy is tunable without app updates, and revenue per user exceeds API cost per user.

### Phase 7: Beta & soft launch (≈2–3 weeks)
- TestFlight / Play internal testing, crash reporting (Sentry).
- Privacy policy (ads + analytics + AI processing disclosure), age rating, store listing.
- Soft launch in one or two smaller markets; tune with real data.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Random hands are often unplayable | Frequency-weighted draw, swaps, wildcards, anchors; tune with telemetry |
| The judge feels inconsistent or unfair | Eval set, tiered (not binary) verdicts, verdict cache gives consistency, appeals |
| API cost grows with users | Cheapest model, prompt caching, verdict cache, rate limits, ad revenue |
| Submit latency kills the feel | Animated staggered reveal, cache hits are instant, small model |
| Procedural levels feel samey | Bonus objectives, themes, varied layouts, hand-made "special" levels every 10 |
| Leaderboard cheating | Server recomputes scores from the submitted board and uses server-side verdicts |

---

## 9. Resolved questions

1. Mascot: a smart-looking owl with reading glasses, and it can be snarky. (Name still to pick.)
2. Submits: 3 per level, and each failed submit costs points.
3. POS hints: always soft. Creative freedom wins.
4. Repeated words: allowed.
5. Word forms: nouns can be read as singular or plural; everything else is used exactly as drawn.
6. Themes: yes, each level theme has its own word pool.
7. Language: English only at launch.
8. AI provider: Claude Haiku 5.5 via the `/judge` endpoint. *Revised:* free trainable judges for development (§5.0); Claude stays switched off for now.
