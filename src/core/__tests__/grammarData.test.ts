import { execFileSync } from 'node:child_process';

describe('the grammar data', () => {
  it('matches the word lists (npm run build:grammar to update)', () => {
    expect(() => execFileSync('node', ['scripts/build-grammar.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
