# Judge training data

Everything here is written by the PC judge while you play, and read by
`npm run train:judge`. Commit it, so both of your computers have the same data.

| File | Written when | Used for |
|---|---|---|
| `labels.jsonl` | you tap a tier on the labelling screen, or "Wrong?" on a verdict in a level | the most trusted training data |
| `pc-verdicts.json` | the PC judge (Gemma) grades a phrase | the PC judge's memory, and examples the built-in judge learns to copy |

Each line of `labels.jsonl` is one label:

```json
{"phrase":"the moon glows","tier":"poetic","source":"labeler","at":"2026-10-19T18:37:51.076Z"}
{"phrase":"coffee run i","tier":"invalid","source":"play","judged":"ok","at":"2026-10-19T18:40:02.000Z"}
```

`source` is `labeler` (labelling screen) or `play` (a "Wrong?" tap; `judged`
is what the owl had said). If the PC judge wasn't running, labels wait on the
phone; use **Export labels** on the labelling screen and paste the text at the
end of `labels.jsonl`.

Testers playing the website send their "Wrong?" taps with their play stats.
Export them from Supabase (`select at, phrase, tier, judged from player_labels;`
in the SQL Editor, as CSV) and add them with
`npm run import:labels -- path/to/the.csv`. See docs/PLAYTESTING.md.

## Train the built-in judge

```sh
npm run train:judge
```

It takes a few seconds, prints how often the new model agrees with labels it
didn't train on (once you have about 70 labels), and writes
`src/data/judgeModel.json`. Reload the game to use it.
