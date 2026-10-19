import { BUNDLED_MODEL, localVerdict, ruleProblem } from '../localJudge';
import { bootstrapExamples, labellingCandidate, Rng } from '../phraseGen';
import { phraseFeatures, predict, trainModel, type Example, type TinyModel } from '../tinyJudge';

const words = (phrase: string) => phrase.split(' ');
const repeat = (phrase: string, tier: Example['tier'], n: number): Example[] =>
  Array.from({ length: n }, () => ({ words: words(phrase), tier, weight: 1 }));

describe('phraseFeatures', () => {
  it('spreads a word with several parts of speech across them', () => {
    const f = phraseFeatures(words('the toast')); // toast is a noun and a verb
    expect(f.get('t2:^>det')).toBe(1);
    expect(f.get('t2:det>noun')).toBe(0.5);
    expect(f.get('t2:det>verb')).toBe(0.5);
    expect(f.get('wb:the toast')).toBe(1);
    expect(f.get('len:2')).toBe(1);
  });
});

describe('trainModel', () => {
  const examples = [
    ...repeat('the golden toast', 'great', 8),
    ...repeat('the moon glows', 'poetic', 8),
    ...repeat('the sleepy chef', 'ok', 8),
    ...repeat('toast the golden', 'invalid', 8),
    ...repeat('glows moon the', 'invalid', 8),
  ];

  it('learns the labels it was trained on', () => {
    const model = trainModel(examples, {});
    expect(predict(model, words('the golden toast')).tier).toBe('great');
    expect(predict(model, words('the moon glows')).tier).toBe('poetic');
    expect(predict(model, words('the sleepy chef')).tier).toBe('ok');
    expect(predict(model, words('toast the golden')).tier).toBe('invalid');
  });

  it('is repeatable', () => {
    const a = trainModel(examples, {});
    const b = trainModel(examples, {});
    expect(a.heads).toEqual(b.heads);
  });

  it('leaves a head untrained without enough examples of each class', () => {
    const model = trainModel([...repeat('the moon glows', 'ok', 20), ...repeat('glows moon the', 'invalid', 20)], {});
    expect(model.heads.valid).not.toBeNull();
    expect(model.heads.great).toBeNull();
    expect(predict(model, words('the moon glows')).tier).toBe('ok');
  });

  it('lets everything through when nothing is trained', () => {
    const empty: TinyModel = { version: 1, heads: { valid: null, great: null, poetic: null }, trainedOn: {}, trainedAt: '', metrics: {} };
    expect(predict(empty, words('glows moon the')).tier).toBe('ok');
  });
});

describe('built-in judge', () => {
  it('lets hard grammar rules overrule the model', () => {
    expect(ruleProblem(words('my your toast'))).toMatch(/can't sit together/);
    expect(localVerdict({ id: '1A', words: words('the the moon') })).toMatchObject({ tier: 'invalid' });
  });

  it('ships a trained model that separates obvious cases', () => {
    expect(BUNDLED_MODEL.heads.valid).not.toBeNull();
    expect(localVerdict({ id: '1A', words: words('the golden toast') }).valid).toBe(true);
    expect(localVerdict({ id: '1A', words: words('moon the is') }).valid).toBe(false);
  });
});

describe('phrase generation', () => {
  it('builds a balanced, repeatable starter set from dictionary words', () => {
    const a = bootstrapExamples(200, 3, 0.3);
    expect(a).toEqual(bootstrapExamples(200, 3, 0.3));
    expect(a.filter((e) => e.tier === 'ok')).toHaveLength(100);
    expect(a.every((e) => e.tier === 'invalid' || ruleProblem(e.words) === null)).toBe(true);
  });

  it('never asks a human to label a phrase the rules already decide, or one already labelled', () => {
    const rng = new Rng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const phrase = labellingCandidate(rng, BUNDLED_MODEL, seen);
      expect(ruleProblem(phrase)).toBeNull();
      expect(seen.has(phrase.join(' '))).toBe(false);
      seen.add(phrase.join(' '));
    }
  });
});
