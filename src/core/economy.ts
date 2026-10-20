// The in-game economy: hearts (lives) and feathers (the currency boosters
// cost). Everything here can be retuned without an update through the
// `economy` row of the remote config (see src/remote and README), so these
// defaults are only where tuning starts. Ads are never forced: later, the
// only ads will be optional ones a player chooses to watch for a reward.

export interface EconomyConfig {
  /**
   * Feathers a new player starts with, so boosters can be tried early. Not
   * remote: a new player's wallet is made before the remote config arrives.
   */
  startingFeathers: number;
  lives: {
    /** Off means unlimited play. */
    enabled: boolean;
    max: number;
    /** One heart comes back every this many minutes, up to `max`. */
    refillMinutes: number;
    /** Feathers to fill every heart at once. */
    refillCost: number;
  };
  rewards: {
    /** For each star earned on a level for the first time. */
    perNewStar: number;
    dailyWin: number;
    zenBoard: number;
  };
  boosters: {
    enabled: boolean;
    swaps: { cost: number; count: number };
    wildcard: { cost: number };
    hint: { cost: number };
    /** One more submit after running out, instead of losing the level. */
    submit: { cost: number };
  };
}

export const DEFAULT_ECONOMY: EconomyConfig = {
  startingFeathers: 30,
  lives: { enabled: true, max: 5, refillMinutes: 30, refillCost: 30 },
  rewards: { perNewStar: 5, dailyWin: 10, zenBoard: 1 },
  boosters: {
    enabled: true,
    swaps: { cost: 15, count: 2 },
    wildcard: { cost: 25 },
    hint: { cost: 20 },
    submit: { cost: 30 },
  },
};

export type BoosterKind = 'swaps' | 'wildcard' | 'hint' | 'submit';

/** The levels where hearts and boosters apply: everything after the tutorial. */
export const ECONOMY_FROM_LEVEL = 11;

const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** A whole number within [min, max], or the fallback when it isn't one. */
const whole = (value: unknown, fallback: number, min: number, max: number): number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : fallback;

const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/**
 * The economy with remote overrides applied. Overrides may set any subset of
 * the fields; a value that's missing, the wrong type or out of range keeps
 * its default, so a typo in the dashboard can't break the game.
 */
export function parseEconomy(overrides: unknown, base: EconomyConfig = DEFAULT_ECONOMY): EconomyConfig {
  const o = object(overrides);
  const lives = object(o.lives);
  const rewards = object(o.rewards);
  const boosters = object(o.boosters);
  const cost = (name: BoosterKind) => whole(object(boosters[name]).cost, base.boosters[name].cost, 0, 1000);
  return {
    startingFeathers: base.startingFeathers,
    lives: {
      enabled: flag(lives.enabled, base.lives.enabled),
      max: whole(lives.max, base.lives.max, 1, 20),
      refillMinutes: whole(lives.refillMinutes, base.lives.refillMinutes, 1, 24 * 60),
      refillCost: whole(lives.refillCost, base.lives.refillCost, 0, 1000),
    },
    rewards: {
      perNewStar: whole(rewards.perNewStar, base.rewards.perNewStar, 0, 100),
      dailyWin: whole(rewards.dailyWin, base.rewards.dailyWin, 0, 500),
      zenBoard: whole(rewards.zenBoard, base.rewards.zenBoard, 0, 100),
    },
    boosters: {
      enabled: flag(boosters.enabled, base.boosters.enabled),
      swaps: { cost: cost('swaps'), count: whole(object(boosters.swaps).count, base.boosters.swaps.count, 1, 10) },
      wildcard: { cost: cost('wildcard') },
      hint: { cost: cost('hint') },
      submit: { cost: cost('submit') },
    },
  };
}

export interface Wallet {
  feathers: number;
  /** Hearts as of `livesAt`; refills since then are counted by `settleLives`. */
  lives: number;
  /** When `lives` was last counted (ms since 1970). */
  livesAt: number;
}

export function newWallet(config: EconomyConfig, now: number): Wallet {
  return { feathers: config.startingFeathers, lives: config.lives.max, livesAt: now };
}

/** The wallet with every heart that has refilled since it was last counted. */
export function settleLives(wallet: Wallet, config: EconomyConfig, now: number): Wallet {
  const { max, refillMinutes } = config.lives;
  // A clock that moved backwards restarts the timer rather than stopping it for good.
  const since = Math.min(wallet.livesAt, now);
  if (wallet.lives >= max) return { ...wallet, lives: max, livesAt: now };
  const period = refillMinutes * 60_000;
  const gained = Math.floor((now - since) / period);
  const lives = Math.min(max, wallet.lives + gained);
  return { ...wallet, lives, livesAt: lives >= max ? now : since + gained * period };
}

export interface LivesStatus {
  lives: number;
  max: number;
  /** Milliseconds until the next heart, or null when full (or hearts are off). */
  nextIn: number | null;
  /** Hearts are switched off: play is unlimited. */
  unlimited: boolean;
}

export function livesStatus(wallet: Wallet, config: EconomyConfig, now: number): LivesStatus {
  const { enabled, max, refillMinutes } = config.lives;
  if (!enabled) return { lives: max, max, nextIn: null, unlimited: true };
  const settled = settleLives(wallet, config, now);
  const nextIn = settled.lives >= max ? null : settled.livesAt + refillMinutes * 60_000 - now;
  return { lives: settled.lives, max, nextIn, unlimited: false };
}

/** A lost level costs a heart. The refill timer starts when the hearts stop being full. */
export function loseLife(wallet: Wallet, config: EconomyConfig, now: number): Wallet {
  if (!config.lives.enabled) return wallet;
  const settled = settleLives(wallet, config, now);
  return { ...settled, lives: Math.max(0, settled.lives - 1) };
}

/** Gives a heart back (when "one more submit" turns a loss around). */
export function gainLife(wallet: Wallet, config: EconomyConfig, now: number): Wallet {
  const settled = settleLives(wallet, config, now);
  const lives = Math.min(config.lives.max, settled.lives + 1);
  return { ...settled, lives, livesAt: lives >= config.lives.max ? now : settled.livesAt };
}

export function spend(wallet: Wallet, amount: number): Wallet | null {
  return wallet.feathers >= amount ? { ...wallet, feathers: wallet.feathers - amount } : null;
}

export function earn(wallet: Wallet, amount: number): Wallet {
  return { ...wallet, feathers: wallet.feathers + Math.max(0, amount) };
}

/** Fills every heart for feathers. Null if the player can't afford it or is already full. */
export function refillLives(wallet: Wallet, config: EconomyConfig, now: number): Wallet | null {
  const settled = settleLives(wallet, config, now);
  if (settled.lives >= config.lives.max) return null;
  const paid = spend(settled, config.lives.refillCost);
  return paid && { ...paid, lives: config.lives.max, livesAt: now };
}

/** Feathers for a level clear: only stars earned there for the first time count. */
export function starReward(previousStars: number, stars: number, config: EconomyConfig): number {
  return Math.max(0, stars - previousStars) * config.rewards.perNewStar;
}

/** "12:05" or "1:02:05" until the next heart. */
export function formatWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
