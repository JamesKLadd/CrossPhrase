import {
  DEFAULT_ECONOMY,
  earn,
  formatWait,
  gainLife,
  livesStatus,
  loseLife,
  newWallet,
  parseEconomy,
  refillLives,
  settleLives,
  spend,
  starReward,
} from '../economy';

const config = DEFAULT_ECONOMY;
const MIN = 60_000;
const T0 = 1_800_000_000_000;

describe('hearts', () => {
  it('start full and lose one per lost level', () => {
    let wallet = newWallet(config, T0);
    expect(livesStatus(wallet, config, T0)).toEqual({ lives: 5, max: 5, nextIn: null, unlimited: false });
    wallet = loseLife(wallet, config, T0);
    expect(livesStatus(wallet, config, T0)).toMatchObject({ lives: 4, nextIn: 30 * MIN });
  });

  it('refill one at a time, then the timer stops when full', () => {
    let wallet = newWallet(config, T0);
    for (let i = 0; i < 3; i++) wallet = loseLife(wallet, config, T0);
    expect(livesStatus(wallet, config, T0 + 29 * MIN).lives).toBe(2);
    expect(livesStatus(wallet, config, T0 + 31 * MIN)).toMatchObject({ lives: 3, nextIn: 29 * MIN });
    expect(livesStatus(wallet, config, T0 + 10 * 60 * MIN)).toMatchObject({ lives: 5, nextIn: null });
    // Losing one later starts a fresh timer.
    const later = loseLife(wallet, config, T0 + 10 * 60 * MIN);
    expect(livesStatus(later, config, T0 + 10 * 60 * MIN).nextIn).toBe(30 * MIN);
  });

  it('keep the partial wait when a heart comes back mid-timer', () => {
    let wallet = newWallet(config, T0);
    wallet = loseLife(loseLife(wallet, config, T0), config, T0);
    wallet = settleLives(wallet, config, T0 + 40 * MIN);
    expect(livesStatus(wallet, config, T0 + 40 * MIN)).toMatchObject({ lives: 4, nextIn: 20 * MIN });
  });

  it('never go below zero, and survive the clock moving backwards', () => {
    let wallet = newWallet(config, T0);
    for (let i = 0; i < 9; i++) wallet = loseLife(wallet, config, T0);
    expect(wallet.lives).toBe(0);
    expect(livesStatus(wallet, config, T0 - 60 * MIN)).toMatchObject({ lives: 0, nextIn: 30 * MIN });
  });

  it('can be given back, and refilled for feathers', () => {
    let wallet = loseLife(newWallet(config, T0), config, T0);
    expect(livesStatus(gainLife(wallet, config, T0), config, T0)).toMatchObject({ lives: 5, nextIn: null });
    wallet = loseLife(wallet, config, T0);
    const refilled = refillLives(wallet, config, T0)!;
    expect(refilled.lives).toBe(5);
    expect(refilled.feathers).toBe(config.startingFeathers - config.lives.refillCost);
    expect(refillLives(refilled, config, T0)).toBeNull();
    expect(refillLives({ ...wallet, feathers: 0 }, config, T0)).toBeNull();
  });

  it('are unlimited when switched off', () => {
    const off = parseEconomy({ lives: { enabled: false } });
    const wallet = loseLife(newWallet(off, T0), off, T0);
    expect(livesStatus(wallet, off, T0)).toMatchObject({ lives: 5, unlimited: true });
  });
});

describe('feathers', () => {
  it('are earned and spent', () => {
    const wallet = newWallet(config, T0);
    expect(earn(wallet, 10).feathers).toBe(40);
    expect(spend(wallet, 30)!.feathers).toBe(0);
    expect(spend(wallet, 31)).toBeNull();
  });

  it('reward only stars that are new on a level', () => {
    expect(starReward(0, 3, config)).toBe(15);
    expect(starReward(2, 3, config)).toBe(5);
    expect(starReward(3, 1, config)).toBe(0);
  });
});

describe('remote economy overrides', () => {
  it('apply where they are valid, and keep the defaults elsewhere', () => {
    const tuned = parseEconomy({
      startingFeathers: 50,
      lives: { max: 8, refillMinutes: 'soon' },
      boosters: { hint: { cost: 5 }, swaps: { count: 99 } },
      unknown: true,
    });
    expect(tuned.startingFeathers).toBe(config.startingFeathers); // fixed in code
    expect(tuned.lives).toEqual({ ...config.lives, max: 8 });
    expect(tuned.boosters.hint.cost).toBe(5);
    expect(tuned.boosters.swaps).toEqual(config.boosters.swaps);
    expect(parseEconomy(null)).toEqual(config);
    expect(parseEconomy({ lives: { max: 0 } }).lives.max).toBe(5);
  });

  it('clamp hearts when the maximum is lowered', () => {
    const wallet = newWallet(config, T0);
    const fewer = parseEconomy({ lives: { max: 3 } });
    expect(livesStatus(wallet, fewer, T0).lives).toBe(3);
  });
});

describe('formatWait', () => {
  it('shows minutes and seconds, and hours when needed', () => {
    expect(formatWait(65_000)).toBe('1:05');
    expect(formatWait(3_725_000)).toBe('1:02:05');
    expect(formatWait(-5)).toBe('0:00');
  });
});
