import { mergeWallets, type WalletSave } from '../../economy/walletStore';
import { EMPTY_PROGRESS, type DailyRecord, type ProgressSnapshot } from '../../progress/progressStore';
import { forCloud, mergeProgress, mergeSaves, parseSave, stableJson, type SaveData } from '../merge';

const daily = (changes: Partial<DailyRecord>): DailyRecord => ({
  log: [],
  finished: false,
  won: false,
  stars: 0,
  total: 0,
  submitted: false,
  ...changes,
});
const place = { type: 'place' as const, tileId: 1, cell: '0,0' as const };
const progress = (changes: Partial<ProgressSnapshot>): ProgressSnapshot => ({ ...EMPTY_PROGRESS, ...changes });
const wallet = (changes: Partial<WalletSave>): WalletSave => ({
  base: 30,
  ledger: {},
  lives: 5,
  livesAt: 0,
  livesChangedAt: 0,
  ...changes,
});

describe('merging progress', () => {
  it('keeps the best stars and best score of each level, separately', () => {
    const merged = mergeProgress(
      progress({ levels: { a: { stars: 3, best: 40 }, b: { stars: 1, best: 10 } } }),
      progress({ levels: { a: { stars: 2, best: 55 }, c: { stars: 2, best: 30 } } }),
    );
    expect(merged.levels).toEqual({ a: { stars: 3, best: 55 }, b: { stars: 1, best: 10 }, c: { stars: 2, best: 30 } });
  });

  it('keeps a finished daily over one in progress, and the cloud one if both finished', () => {
    const day = '2026-10-20';
    const finished = daily({ finished: true, won: true, stars: 2, total: 40, log: [place] });
    const playing = daily({ log: [place, place] });
    expect(mergeProgress(progress({ daily: { [day]: playing } }), progress({ daily: { [day]: finished } })).daily[day]).toEqual(finished);
    const other = daily({ finished: true, won: false, total: 0, log: [place] });
    expect(mergeProgress(progress({ daily: { [day]: finished } }), progress({ daily: { [day]: other } })).daily[day].won).toBe(true);
    // Two in progress: the one further along.
    expect(mergeProgress(progress({ daily: { [day]: daily({ log: [place] }) } }), progress({ daily: { [day]: playing } })).daily[day].log).toHaveLength(2);
  });

  it('gets back the moves a cloud save dropped, and remembers a delivered score', () => {
    const day = '2026-10-01';
    const cloud = daily({ finished: true, won: true, total: 40, submitted: true });
    const device = daily({ finished: true, won: true, total: 40, log: [place] });
    expect(mergeProgress(progress({ daily: { [day]: cloud } }), progress({ daily: { [day]: device } })).daily[day]).toEqual({
      ...device,
      submitted: true,
    });
  });

  it('takes the higher zen totals', () => {
    const merged = mergeProgress(progress({ zen: { boards: 4, points: 90, best: 30 } }), progress({ zen: { boards: 6, points: 70, best: 31 } }));
    expect(merged.zen).toEqual({ boards: 6, points: 90, best: 31 });
  });
});

describe('merging wallets', () => {
  it('never loses feathers earned or spent on either device', () => {
    // Phone and laptop both started from the same synced ledger, then went their own ways.
    const synced = { phone: { earned: 20, spent: 5 }, laptop: { earned: 10, spent: 0 } };
    const phone = wallet({ ledger: { ...synced, phone: { earned: 35, spent: 25 } } });
    const laptop = wallet({ ledger: { ...synced, laptop: { earned: 18, spent: 15 } } });
    const merged = mergeWallets(phone, laptop);
    expect(merged.ledger).toEqual({ phone: { earned: 35, spent: 25 }, laptop: { earned: 18, spent: 15 } });
    expect(mergeWallets(laptop, phone).ledger).toEqual(merged.ledger);
  });

  it('keeps the account’s starting feathers and the latest hearts', () => {
    const account = wallet({ base: 30, lives: 2, livesChangedAt: 100 });
    const guest = wallet({ base: 30, ledger: { guest: { earned: 15, spent: 0 } }, lives: 5, livesChangedAt: 50 });
    const merged = mergeWallets(account, guest);
    expect(merged).toMatchObject({ base: 30, lives: 2, ledger: { guest: { earned: 15, spent: 0 } } });
    expect(mergeWallets(account, { ...guest, livesChangedAt: 200 }).lives).toBe(5);
  });
});

describe('saves', () => {
  const save: SaveData = { v: 1, progress: progress({ levels: { a: { stars: 1, best: 9 } } }), wallet: wallet({}) };

  it('parse only what looks like a save', () => {
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
    expect(parseSave({ v: 2 })).toBeNull();
    expect(parseSave('nope')).toBeNull();
    expect(parseSave({ v: 1, progress: {}, wallet: {} })).toBeNull();
  });

  it('drop the moves of finished dailies over a week old for the cloud', () => {
    const old = daily({ finished: true, won: true, total: 30, log: [place] });
    const trimmed = forCloud({ ...save, progress: progress({ daily: { '2026-10-01': old, '2026-10-19': old, '2026-10-02': daily({ log: [place] }) } }) }, '2026-10-20');
    expect(trimmed.progress.daily['2026-10-01'].log).toEqual([]);
    expect(trimmed.progress.daily['2026-10-19'].log).toHaveLength(1);
    expect(trimmed.progress.daily['2026-10-02'].log).toHaveLength(1); // unfinished: still resumable
  });

  it('merge with the cloud winning ties', () => {
    const merged = mergeSaves(save, { ...save, wallet: wallet({ base: 99 }) });
    expect(merged.wallet.base).toBe(30);
  });

  it('compare equal whatever order their keys are in', () => {
    expect(stableJson({ a: 1, b: { c: 2, d: [1, { e: 3, f: 4 }] } })).toBe(stableJson({ b: { d: [1, { f: 4, e: 3 }], c: 2 }, a: 1 }));
  });
});
