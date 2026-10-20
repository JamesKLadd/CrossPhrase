# Playtesting CrossPhrase

How to run a playtest with friends on the website, what to watch for, and how
to turn what you learn into changes, most of them without a new build.

## What this round should answer

1. **Can people learn it without help?** Do the 10 Owl School levels teach
   placing, crossings, swaps and the four-word lines, or do people get stuck?
2. **Is the difficulty curve fair?** Where do people fail, quit or call a level
   too hard? Every board has been solved by a bot playing real English with a
   swap to spare, and the star targets come from its scores, but real players
   may still find some levels much harder or easier.
3. **Does the owl feel fair?** Which verdicts make people say "that's wrong"?
4. **Do people come back for the daily puzzle?** Two weeks of the daily with
   friends, without anyone finding an exploit, is the Phase 5 exit test.
5. **Does the economy feel generous or stingy?** Do hearts get in the way? Do
   people find and use the boosters?

## Before you invite anyone

- [ ] **The backend is up to date.** Supabase set up as in the README, then
  `npx supabase db push`, `npx supabase functions deploy scores` and
  `npx supabase functions deploy account` for this phase's changes.
- [ ] **Accounts work.** Make one on your phone, then log in to it in another
  browser and check your stars came along.
- [ ] **The website is live.** GitHub Pages is switched on, the two
  `EXPO_PUBLIC_SUPABASE_*` repository variables are set, and the latest push
  finished in the Actions tab. See "Play it as a website" in the README.
- [ ] **You've played it on your own phone.** Open
  https://jameskladd.github.io/CrossPhrase/ in Safari, **Share → Add to Home
  Screen**, open it from the home screen and clear level 1.
- [ ] **The stats arrive.** Logged in as James, 🛠 Admin → Dashboard → Levels
  shows your game (events are sent every 30 seconds and when the game goes to the
  background).
- [ ] **Decide on hearts for this round.** The suggestion: leave them on, since
  how they feel is one of the questions. If they annoy people, switch them off
  for everyone with `{"lives": {"enabled": false}}` in the `economy` row of
  `remote_config` (see the README).
- [ ] **Note the build number** (Settings, at the bottom). Testers' feedback
  and stats carry it, so you know which version they played.

## Who to invite

- **5 to 8 people** is plenty for the first round. More testers mostly repeat
  what the first five find.
- Mix them: a couple of word-game or crossword fans, a couple who rarely play
  games, and **at least two who have never seen it** (they're the only ones who
  can test the tutorial).
- Ask for **10 minutes a day for two weeks**, including the daily puzzle. A
  group chat where people post their daily share card keeps it going.

## The message to send

> I'm making a word game and I'd love your help testing it for two weeks.
>
> **Play:** https://jameskladd.github.io/CrossPhrase/
> On iPhone, open it in Safari, tap Share, then "Add to Home Screen". It
> then opens like an app and keeps your progress. On Android, open it in
> Chrome, then ⋮ → "Add to Home screen".
>
> **Make an account** (👤 at the top left) so your progress is safe and you
> can play on any device. Pick a password you'll remember: there's no email,
> so it can't be reset.
>
> **What I'd love:** play about 10 minutes a day, and do the 📅 daily puzzle
> each day. Post your daily result here (the Share button), it's spoiler-free.
>
> **Tell me when something's off:** tap ⚙️ → Send feedback, or message me.
> After each level there's a 😴 / 🙂 / 😤 rating; tapping it really helps.
> If the owl gets a phrase wrong, tap "Wrong?" on it.
>
> Everything is anonymous; you can switch the stats off in Settings.

## Watch someone play (the most useful 20 minutes)

Numbers tell you *where* people struggle; watching tells you *why*. Do this
with two or three of the new players before they've played alone, in person
or on a video call with screen sharing.

1. Give them the phone with the home screen open. Say only: "It's a word game.
   Please think out loud as you play. I can't help, I'm just watching."
2. **Don't help, don't explain, don't defend.** If they're stuck for a minute,
   ask "What are you thinking?" instead of giving the answer. Every time you
   want to explain something, write it down: that's a fix for the game.
3. Let them play through Owl School (levels 1 to 10), or 20 minutes,
   whichever comes first.
4. Afterwards, ask:
   - What was the game about, in one sentence?
   - What was confusing? When did you feel stuck?
   - Did the owl ever feel unfair? Which phrase?
   - Would you play the daily puzzle tomorrow? Why or why not?
   - What would you tell a friend about it?

**Watch for these moments:**

| Moment | What to note |
|---|---|
| First move | Do they drag words or tap them? How long before the first placement? |
| Four-word lines | Do they understand every line must be at least four words and read as a phrase? |
| Crossings | Do they notice that one word counts in two lines? |
| Submitting | Do they know they have three submits? Do they read the owl's verdicts? |
| A rejected line | Do they find which line was wrong, and understand why? |
| "Wrong?" button | Do they find it when they disagree with the owl? |
| Swaps | Do they discover swapping? Do they run out? |
| Stars | Do they notice the star bar and aim for more stars? |
| Level 11 | The first level with hearts and the 🪶 boosters button: do they notice them? Do they understand losing costs a heart? |
| Their face | Smiles at the owl's quips, sighs at the verdicts, boredom on long levels |

Keep notes in a simple table: the time, what they did, what they said, and
what you'd change.

## Your own pass: the curve with the PC judge

The website uses the built-in judge, which is more lenient than the PC judge.
Once, play the first 30 or so levels yourself with the PC judge (run the game
from your computer: `npm start` for Expo Go, or `npm run web` and open
`http://<your-computer's-IP>:8081` on the phone), and note each level as too
easy, fine, or too hard. Levels that are only hard with the PC judge show where
the built-in judge lets nonsense through; labelling those phrases (below) fixes
both.

## Reading the numbers

Every few days, log in as James and open **🛠 Admin → 📊 Dashboard**. Wait for
at least **5 players on a level** before trusting its numbers.

- **Players**: players ever, accounts, who played today and this week, games,
  feedback, and corrections waiting for review; players per day; each daily
  puzzle (is anyone still playing in week two?).
- **Levels**: every level with games: players, won, lost, quit, the share
  lost, submits to win, stars, boosted clears and the 😴/🙂/😤 ratings. **⚠
  (hard)** marks levels most players lose or call too hard; **Hardest first**
  sorts by the share lost. Below it, how far players get: a sudden drop is a
  wall.
- **Economy**: boosters bought, hearts refilled, how often players run out.
- **Feedback**: what testers wrote, with their username and build.

The same numbers are views in Supabase (`level_stats`, `level_funnel`,
`daily_stats`, `active_players`, `economy_stats`, `feedback`) for anything the
dashboard doesn't show, e.g. in the SQL Editor:

```sql
select number, level, players, wins, losses, quits, fail_rate, rated_easy, rated_right, rated_hard
from level_stats
where fail_rate > 0.5 or rated_hard > rated_right or quits > wins
order by number;
```

**Rules of thumb:**

- **Fail rate over 50%** on a level → ease it. Over 70% → ease it a lot.
- **More quits than wins** → people give up mid-level: confusing or tedious.
- **A big drop in the funnel** at one level → a wall. Look at that level first.
- **Many boosters bought** on one level → it's too hard without them.
- **Mostly 😴 "too easy"** across a band → tighten that band.
- **Lots of "out of hearts"** in `economy_stats` → hearts refill too slowly, or
  levels are too hard. Fix the levels first.
- Ratings and feedback beat fail rates when they disagree: a level people win
  but hate still needs work.

## Fixing what you find

Most fixes are made from the dashboard, with no new build: tap a level on
**Levels** to change its star targets or swaps (or its whole band's), and use
the **Economy** tab for hearts, rewards and booster prices. Players get the
change the next time they open the game; the leaderboard server within a
minute. Underneath, these edit the `remote_config` table, so the same values
can be written there by hand:

| Problem | Change |
|---|---|
| One level too hard | `tuning`: `{"levels": {"level-37": {"stars": 0.85}}}` (star targets 15% lower), or `{"swaps": 1}` for an extra swap |
| One level too easy | `{"levels": {"level-37": {"stars": 1.15}}}` |
| A whole band off | `{"bands": {"mid": {"stars": 0.9, "swaps": 1}}}` (bands: `warm-up` 11–20, `early` 21–40, `mid` 41–70, `hard` 71–100, `late` 101–120) |
| Hearts too harsh | `economy`: `{"lives": {"refillMinutes": 15}}`, `{"lives": {"max": 8}}`, or `{"lives": {"enabled": false}}` |
| Boosters too pricey | `economy`: `{"boosters": {"hint": {"cost": 10}}}` |
| Too few feathers | `economy`: `{"rewards": {"perNewStar": 8, "dailyWin": 15}}` |

Put all the tweaks for a row in one JSON value, e.g. the `tuning` row could be
`{"bands": {"hard": {"stars": 0.9}}, "levels": {"level-37": {"stars": 0.85}, "level-52": {"swaps": 1}}}`.

Bigger changes need code and a push (the website rebuilds itself):

- **The tutorial** (levels 1–10) is never tuned remotely: edit
  `src/data/tutorial.ts`.
- **A whole difficulty curve** (board sizes, line lengths, anchors): edit
  `LEVEL_BANDS` in `src/core/config.ts`, `npm run generate:levels`, then
  `npm run bundle:server` and redeploy `scores`.
- **The owl judging a phrase wrongly**: see the next section.

## Teach the owl from playtests

When testers tap **Wrong?** on a verdict, the correction lands in your review
queue. To use them as training data:

1. **🛠 Admin → Review players' corrections**: each phrase shows what the owl
   said and how many players suggested each tier. Tap the tier it deserves to
   approve it, or **Reject** anything silly. Your own labels (the labelling
   screen, or your own "Wrong?" taps) skip the queue.
2. On the PC: `npm run pull:labels` (asks for James's password) adds every
   approved label to `training/labels.jsonl`.
3. `npm run train:judge`, check the agreement it prints, then
   `npm run bundle:server`, commit `training/labels.jsonl`,
   `src/data/judgeModel.json` and the bundle, push, and
   `npx supabase functions deploy scores` (leaderboards re-judge with the
   built-in judge, so the server needs the same model).

A few hundred labels (yours plus approved corrections) is also what the
planned fine-tune of the launch judge needs.

## Keep a log

One page, updated as you go:

- **Date, build number, what changed** (e.g. "Oct 24, build 3f2a1c9: eased
  level 37, refill 30 → 20 min").
- **What testers said**, in their words.
- **What you watched**, from the sessions above.
- **Exploits or bugs**, especially on the daily leaderboard (a score that
  looks impossible, two results on one day).

Change one or two things at a time and note them, so you can tell what helped.

## After two weeks: decide

- [ ] Did new players get through Owl School without help?
- [ ] Is there a level (or band) most people fail? Has it been eased?
- [ ] Are people still playing the daily in week two? Did anyone find an exploit?
- [ ] Do hearts feel fair, or should they be gentler or gone?
- [ ] Do people use boosters, and do they feel worth the feathers?
- [ ] Which owl verdicts were called unfair most often, and are they labelled?
- [ ] Would testers recommend it to a friend?

Most boxes ticked: on to Phase 7 (the launch judge and a wider beta). If not,
fix the biggest problem, push, and run another week.
