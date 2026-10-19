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
| Draw | Pure random from the dictionary. Glue words (the, a, of, is) arrive through the normal draw. **Wildcard** tiles are rare draws that let you type any dictionary word |
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
| AI provider | **Claude Haiku 5.5** behind our own `/judge` endpoint (see §5) |

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
- **Wildcard tile:** rare, around 1–2% of draws. When placed, the player types a word, which must be in the game dictionary (see §5.4: this also blocks prompt injection).

### 2.3 Draw distribution
- Each level has a **theme** (Breakfast, Night Sky, Garden…). The draw pool is the theme's own word list plus a shared **core pool** of glue words and everyday verbs, adjectives and pronouns.
- Draws are random **with replacement** (repeats are allowed). Each word's chance is weighted by its corpus frequency, with a cap so "the" doesn't flood the hand, and theme words get a small boost so the theme comes through. The hand naturally gets the mix of glue and content words that real phrases need, and the weighting curve is a tuning knob (`src/core/config.ts`).
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

### 2.6 Bonus objectives (examples)
- Use a word with 8 or more letters
- Score "poetic" on any line
- Use 3 words from a theme set (animals, food, colors)
- Finish with swaps left over
- Put a rarity-10 word on a crossing cell

Each level gets 0–2 objectives. They add points or count toward 3★.

---

## 3. Experience & feel

- **Mascot:** a smart-looking owl in reading glasses, a little snarky. It's the voice of the judge. It reacts to each line on submit ("'Moonlit soup whispers'? Bold. I respect it.") and celebrates poetic tiers. The commentary is the main source of personality, the way MeowDoku leans on its cats.
- **Juice:** satisfying tile snap, a staggered line-by-line verdict reveal (which also hides API latency), confetti/ink-splash on poetic lines, haptics on placement and verdicts, and a star-burst on level clear.
- **Latency budget:** a submit should feel like 1–2 seconds. The reveal animation starts at once and resolves line by line as verdicts arrive.
- **FTUE:** the first 5 levels are tiny (a 2-entry L-shape, then a 2×2) with scripted hands, so new players learn crossings, swaps and tiers before randomness starts.

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

Generator inputs (difficulty profile by level band):

| Param | Early (1–20) | Mid (21–100) | Late (100+) |
|---|---|---|---|
| Grid size | 3×3 | 5×5 | 7×7+ |
| Entries | 2–4 | 6–10 | 12+ |
| Entry length | 2–3 | 2–4 | 3–5 |
| Crossing density | low | medium | high |
| Anchors | 1–2 | 1–3 | 0–2 |
| POS hints | many | some | few |
| Swaps | 5 | 4 | 3 |
| Bonus objectives | 0 | 1 | 1–2 |

Steps:
1. **Layout:** place blocked cells under symmetry rules, then reject layouts with entries that are too long or open cells not in any entry, or with disconnected regions.
2. **Anchors/hints:** pick cells (prefer crossings for hints), and pick anchor words from a curated "friendly" list.
3. **Thresholds:** estimate expected score by **simulation**. A greedy bot fills the grid with high-frequency words using POS templates; that gives a baseline score, and 1★/2★/3★ = baseline × (1.0 / 1.4 / 1.8). Tune the multipliers from real completion telemetry later.
4. **Seed it:** `level(N) = generate(seed=N, profile=band(N))`. Deterministic, no level files to ship.

Hand-tune the first ~10 levels (scripted tutorial), then go fully procedural.

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
- [x] Expo SDK 58 + Expo Router + TypeScript, Jest, ESLint
- [x] `src/core`: grid/entries, seeded frequency-weighted draws with theme pools, scoring, game reducer (place/move/remove/swap, 3 submits, failed-submit penalty, verdict cache with partial re-judging)
- [x] Word data: core pool + 3 themes (Breakfast, Night Sky, Garden) with `wordfreq` rarity
- [x] 8 hand-authored levels with anchors and soft POS hints
- [x] Board, hand tray, drag-and-drop plus tap-to-place, owl panel with per-line verdicts, result screen
- [x] `/judge` Supabase Edge Function → Claude Haiku 5.5 with structured output, dictionary-only input, reading check
- [x] Local rule-based judge (dev mode, and the base for the offline fallback)
- [x] Judge eval set + runner (`scripts/judge-eval`)
- [ ] Deploy the judge and run the eval against the real model; tune the prompt
- [ ] Playtest on real phones; tune hand size, draw weighting, star thresholds
- [ ] Known tuning item: inflected verb forms ("munches") read rarer than their base form and score high

### Phase 2: Judge & scoring hardening (≈2 weeks)
- Quality tiers with multipliers, crossing double-scoring, rarity curve tuning.
- Server verdict cache (normalized phrases), partial re-judging on resubmit.
- Eval-set runner script; prompt iteration.
- Appeal button and appeal table.
- Offline fallback: local cache, POS rule check, provisional verdicts and reconciliation.
- Rate limiting and anonymous auth.
- **Exit:** verdicts feel fair to playtesters; airplane mode doesn't break play; cost per active user is measured.

### Phase 3: Levels & progression (≈3 weeks)
- Procedural generator plus simulation bot for star thresholds.
- Anchors, POS hint badges, wildcard tiles.
- Stars UI, bonus objectives, level-complete screen.
- Level map (scrolling path), local save, cloud save via Supabase.
- Scripted FTUE for levels 1–10.
- **Exit:** 100+ levels with a sensible difficulty curve, and testers progress without a wall.

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
8. AI provider: Claude Haiku 5.5 via the `/judge` endpoint.
