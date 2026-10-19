import { fill, OWL_LINES, owlLine, quipFor, TIER_QUIPS } from '../quips';

describe('owl quips', () => {
  it('fill in the phrase, and pick the same quip for the same phrase', () => {
    const quip = quipFor('invalid', 'the of and');
    expect(quip).toBe(quipFor('invalid', 'the of and'));
    expect(quip).not.toMatch(/\{phrase\}/);
    const quoted = Array.from({ length: 50 }, (_, i) => quipFor('ok', `phrase ${i}`)).find((q) =>
      q.includes('“'),
    );
    expect(quoted).toMatch(/“phrase \d+”/);
  });

  it('vary across phrases', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => quipFor('great', `p${i}`)));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('fill placeholders and leave unknown ones alone', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(owlLine('fixLines', 'x', { left: 2 })).toMatch(/2 left/);
  });

  it('have no unfilled placeholders other than the documented ones', () => {
    const allowed = new Set(['phrase', 'left', 'score', 'need', 'submits']);
    const lines = [...Object.values(TIER_QUIPS).flat(), ...Object.values(OWL_LINES).flat()];
    for (const line of lines) {
      for (const [, key] of line.matchAll(/\{(\w+)\}/g)) expect(allowed).toContain(key);
    }
  });
});
