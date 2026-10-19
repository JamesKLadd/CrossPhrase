import { execFileSync } from 'node:child_process';

describe('the leaderboard server bundle', () => {
  it('matches the current game core and data (npm run bundle:server to update)', () => {
    expect(() =>
      execFileSync('node', ['scripts/bundle-server.mjs', '--check'], { stdio: 'pipe' }),
    ).not.toThrow();
  });
});
