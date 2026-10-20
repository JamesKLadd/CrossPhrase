# Judge training data

Everything here is written by the PC judge while you play, and read by
`npm run train:judge`. Commit it, so both of your computers have the same data.

| File | Written when | Used for |
|---|---|---|
| `labels.jsonl` | you tap a tier on the labelling screen, or "Wrong?" on a verdict in a level | the most trusted training data |
| `pc-verdicts.json` | the PC judge (Gemma) grades a phrase | the PC judge's memory, and examples the built-in judge learns to copy |
| `claude-labels.jsonl` | Claude labelled 500 phrases with the judge's rubric (`source: "claude"`) | training at 0.8 the weight of yours; where you labelled the same phrase, yours wins |

Each line of `labels.jsonl` is one label:

```json
{"phrase":"the moon glows","tier":"poetic","source":"labeler","at":"2026-10-19T18:37:51.076Z"}
{"phrase":"coffee run i","tier":"invalid","source":"play","judged":"ok","at":"2026-10-19T18:40:02.000Z"}
```

`source` is `labeler` (labelling screen) or `play` (a "Wrong?" tap; `judged`
is what the owl had said). If the PC judge wasn't running, labels wait on the
phone; use **Export labels** on the labelling screen and paste the text at the
end of `labels.jsonl`.

Players' "Wrong?" taps on the website go to the admin's review queue (🛠
Admin → Review players' corrections), and the admin's own labels are saved
online too. `npm run pull:labels` logs in as James and adds every approved one
here (it skips labels already in the file). See docs/PLAYTESTING.md.

## Train the built-in judge

```sh
npm run train:judge
```

It takes a few seconds, prints how often the new model agrees with labels it
didn't train on (yours once you have about 70, and Claude's), and writes
`src/data/judgeModel.json`. Reload the game to use it.
