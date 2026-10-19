// Trains the tiny judge that ships inside the game and writes it to
// src/data/judgeModel.json. Takes a few seconds, on any computer with Node.
//
//   npm run train:judge
//
// Training data, most trusted first:
//   training/labels.jsonl     your labels: the labelling screen and "Wrong?" taps in play
//   training/pc-verdicts.json verdicts from the PC judge (Gemma), which the tiny model learns to copy
//   a generated starter set   template phrases as "ok", word salad as "invalid"
// A slice of your labels is held out to measure the model before it's
// retrained on everything; the eval phrases in scripts/judge-eval are checked too.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { localVerdict } from '../src/core/localJudge';
import { bootstrapExamples } from '../src/core/phraseGen';
import { predict, trainModel, type Example, type TinyModel } from '../src/core/tinyJudge';
import type { Tier } from '../src/core/types';
import { isWord } from '../src/core/words';

const ROOT = new URL('../', import.meta.url);
const LABELS = new URL('training/labels.jsonl', ROOT);
const PC_VERDICTS = new URL('training/pc-verdicts.json', ROOT);
const EVAL = new URL('scripts/judge-eval/phrases.json', ROOT);
const OUT = new URL('src/data/judgeModel.json', ROOT);

const WEIGHT = { human: 1, pc: 0.6, starter: 0.3 };
const STARTER_COUNT = 3000;
const TIERS: Tier[] = ['invalid', 'ok', 'great', 'poetic'];

interface LabelLine {
  phrase: string;
  tier: Tier;
  source?: string;
  at?: string;
}

const usable = (phrase: string) => {
  const words = phrase.trim().split(/\s+/);
  return words.length >= 2 && words.every(isWord) ? words : null;
};

function readLabels(): Map<string, Tier> {
  const latest = new Map<string, Tier>();
  if (!existsSync(LABELS)) return latest;
  for (const line of readFileSync(LABELS, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const label = JSON.parse(line) as LabelLine;
      if (TIERS.includes(label.tier) && usable(label.phrase)) latest.set(label.phrase, label.tier);
    } catch {
      console.warn(`Skipping a line that isn't JSON: ${line.slice(0, 60)}`);
    }
  }
  return latest;
}

function readPcVerdicts(): Map<string, Tier> {
  const verdicts = new Map<string, Tier>();
  if (!existsSync(PC_VERDICTS)) return verdicts;
  const rows = JSON.parse(readFileSync(PC_VERDICTS, 'utf8')) as Record<string, { tier: Tier }>;
  for (const [phrase, row] of Object.entries(rows)) {
    if (TIERS.includes(row.tier) && usable(phrase)) verdicts.set(phrase, row.tier);
  }
  return verdicts;
}

/** About 15% of labels, chosen by phrase so the split is stable between runs. */
const heldOut = (phrase: string) => createHash('sha1').update(phrase).digest()[0] < 38;

function accuracy(model: TinyModel, items: [string, Tier][]) {
  let validRight = 0;
  let tierRight = 0;
  for (const [phrase, tier] of items) {
    const got = localVerdict({ id: '1A', words: phrase.split(' ') }, model).tier;
    if ((got === 'invalid') === (tier === 'invalid')) validRight++;
    if (got === tier) tierRight++;
  }
  return { valid: validRight / items.length, tier: tierRight / items.length };
}

const human = readLabels();
const pc = readPcVerdicts();
for (const phrase of human.keys()) pc.delete(phrase);
const starter = bootstrapExamples(STARTER_COUNT, 7, WEIGHT.starter).filter(
  (e) => !human.has(e.words.join(' ')) && !pc.has(e.words.join(' ')),
);

const toExamples = (entries: [string, Tier][], weight: number): Example[] =>
  entries.map(([phrase, tier]) => ({ words: phrase.split(' '), tier, weight }));
const humanAll = [...human];
const humanTest = humanAll.filter(([p]) => heldOut(p));
const humanTrain = humanAll.filter(([p]) => !heldOut(p));
const pcExamples = toExamples([...pc], WEIGHT.pc);
const trainedOn = { human: human.size, pc: pc.size, starter: starter.length };

console.log(`Training data: ${human.size} labels from you, ${pc.size} PC-judge verdicts, ${starter.length} generated.`);

const metrics: Record<string, number> = {};
if (humanTest.length >= 10) {
  const trial = trainModel([...toExamples(humanTrain, WEIGHT.human), ...pcExamples, ...starter], trainedOn);
  const { valid, tier } = accuracy(trial, humanTest);
  metrics.heldOutValid = Math.round(valid * 1000) / 1000;
  metrics.heldOutTier = Math.round(tier * 1000) / 1000;
  metrics.heldOutCount = humanTest.length;
  console.log(
    `Held-out labels (${humanTest.length}): ${(valid * 100).toFixed(0)}% right on valid/invalid, ` +
      `${(tier * 100).toFixed(0)}% on the exact tier.`,
  );
} else {
  console.log(`Held-out check skipped: it needs at least ~70 labels from you (have ${human.size}).`);
}

const model = trainModel([...toExamples(humanAll, WEIGHT.human), ...pcExamples, ...starter], trainedOn);

const evalSet = (JSON.parse(readFileSync(EVAL, 'utf8')) as { phrase: string; expect: string }[]).filter(
  (p) => usable(p.phrase),
);
const evalRight = evalSet.filter(
  (p) => (localVerdict({ id: '1A', words: p.phrase.split(' ') }, model).tier !== 'invalid') === (p.expect === 'valid'),
).length;
metrics.evalAgreement = Math.round((evalRight / evalSet.length) * 1000) / 1000;
console.log(`Eval phrases: ${evalRight}/${evalSet.length} agree on valid/invalid.`);

const heads = Object.entries(model.heads)
  .map(([name, head]) => `${name} ${head ? `(${Object.keys(head.weights).length} weights)` : '(not enough data yet)'}`)
  .join(', ');
console.log(`Heads: ${heads}`);
const sample = ['the golden toast', 'toast the of', 'the comet sings softly'].map(
  (p) => `"${p}" → ${predict(model, p.split(' ')).tier}`,
);
console.log(`Spot check: ${sample.join(', ')}`);

model.metrics = metrics;
writeFileSync(OUT, JSON.stringify(model) + '\n');
console.log(`Wrote src/data/judgeModel.json (${(JSON.stringify(model).length / 1024).toFixed(0)} KB). Reload the app to use it.`);
