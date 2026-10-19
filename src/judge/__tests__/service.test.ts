import type { JudgeEntry, Tier, Verdict } from '../../core/types';
import { createLabelStore, type Label } from '../labelStore';
import { createJudgeService, JudgeRequestError, type RemoteJudge } from '../service';
import { createVerdictStore, type KeyValueStorage } from '../verdictStore';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** A fake AI judge that grades every phrase with `tier`, or fails when `down`. */
function fakeRemote(tier: Tier = 'great') {
  const remote = {
    kind: 'pc' as const,
    down: false as false | JudgeRequestError,
    calls: [] as JudgeEntry[][],
    labels: [] as Label[],
    async judge(entries: JudgeEntry[]): Promise<Verdict[]> {
      remote.calls.push(entries);
      if (remote.down) throw remote.down;
      return entries.map((e) => ({
        entryId: e.id,
        valid: tier !== 'invalid',
        tier,
        reading: e.words.join(' '),
        reason: '',
        quip: 'Hoot.',
      }));
    },
    async submitLabels(labels: Label[]) {
      if (remote.down) throw remote.down;
      remote.labels.push(...labels);
    },
    async isReachable() {
      return !remote.down;
    },
  };
  return remote satisfies RemoteJudge;
}

const entries: JudgeEntry[] = [
  { id: '1A', words: ['the', 'golden', 'toast'] },
  { id: '1D', words: ['the', 'sleepy', 'chef'] },
];

describe('judge service', () => {
  // The service logs when it falls back to offline grading; that's expected here.
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('uses the AI judge and caches its verdicts on the device', async () => {
    const remote = fakeRemote('great');
    const service = createJudgeService(remote, createVerdictStore(memoryStorage()), createLabelStore(memoryStorage()));
    const first = await service.judge(entries);
    expect(first.mode).toBe('online');
    expect(first.verdicts.map((v) => v.tier)).toEqual(['great', 'great']);

    const again = await service.judge(entries);
    expect(again.verdicts.map((v) => v.entryId).sort()).toEqual(['1A', '1D']);
    expect(remote.calls).toHaveLength(1);
  });

  it('only sends phrases the device has not seen', async () => {
    const remote = fakeRemote();
    const service = createJudgeService(remote, createVerdictStore(memoryStorage()), createLabelStore(memoryStorage()));
    await service.judge([entries[0]]);
    await service.judge(entries);
    expect(remote.calls[1].map((e) => e.id)).toEqual(['1D']);
  });

  it('answers from shipped seed verdicts without calling the judge', async () => {
    const remote = fakeRemote();
    const seed = {
      'the golden toast': { valid: true, tier: 'poetic' as const, reading: '', reason: '', quip: '' },
    };
    const service = createJudgeService(remote, createVerdictStore(memoryStorage(), seed), createLabelStore(memoryStorage()));
    const { verdicts } = await service.judge([entries[0]]);
    expect(verdicts[0].tier).toBe('poetic');
    expect(remote.calls).toHaveLength(0);
  });

  it('grades provisionally with the local rules when the judge is unreachable', async () => {
    const remote = fakeRemote();
    remote.down = new JudgeRequestError('offline', true);
    const service = createJudgeService(remote, createVerdictStore(memoryStorage()), createLabelStore(memoryStorage()));
    const { verdicts, mode } = await service.judge(entries);
    expect(mode).toBe('offline');
    expect(verdicts.every((v) => v.provisional && v.tier === 'ok')).toBe(true);
    expect(service.pendingCount()).toBe(2);
  });

  it('re-checks offline phrases once the judge is back, then remembers them', async () => {
    const remote = fakeRemote('poetic');
    remote.down = new JudgeRequestError('offline', true);
    const service = createJudgeService(remote, createVerdictStore(memoryStorage()), createLabelStore(memoryStorage()));
    await service.judge(entries);

    expect(await service.reconcile()).toEqual([]);
    expect(service.pendingCount()).toBe(2);

    remote.down = false;
    const resolved = await service.reconcile();
    expect(resolved.map((r) => [r.phrase, r.verdict.tier])).toEqual([
      ['the golden toast', 'poetic'],
      ['the sleepy chef', 'poetic'],
    ]);
    expect(service.pendingCount()).toBe(0);

    const callsBefore = remote.calls.length;
    const { verdicts, mode } = await service.judge(entries);
    expect(mode).toBe('online');
    expect(verdicts.every((v) => v.tier === 'poetic' && !v.provisional)).toBe(true);
    expect(remote.calls).toHaveLength(callsBefore);
  });

  it('drops queued phrases the judge refuses, so they are not retried forever', async () => {
    const remote = fakeRemote();
    remote.down = new JudgeRequestError('offline', true);
    const service = createJudgeService(remote, createVerdictStore(memoryStorage()), createLabelStore(memoryStorage()));
    await service.judge(entries);
    remote.down = new JudgeRequestError('bad request', false);
    expect(await service.reconcile()).toEqual([]);
    expect(service.pendingCount()).toBe(0);
  });

  it('uses the built-in judge as the real judge when no remote judge is configured', async () => {
    const service = createJudgeService(null, createVerdictStore(memoryStorage()), createLabelStore(memoryStorage()));
    const { verdicts, mode } = await service.judge(entries);
    expect(mode).toBe('local');
    expect(verdicts.some((v) => v.provisional)).toBe(false);
    expect(service.pendingCount()).toBe(0);
    service.label({ phrase: 'the golden toast', tier: 'great', source: 'play', judged: 'ok' });
    expect(service.labels()).toHaveLength(1);
    expect(await service.syncLabels()).toBe(0);
  });

  it('keeps labels until the remote judge has them', async () => {
    const remote = fakeRemote();
    remote.down = new JudgeRequestError('offline', true);
    const service = createJudgeService(remote, createVerdictStore(memoryStorage()), createLabelStore(memoryStorage()));
    service.label({ phrase: 'the moon glows', tier: 'poetic', source: 'labeler' });
    service.label({ phrase: 'the golden toast', tier: 'ok', source: 'play', judged: 'great' });
    expect(await service.syncLabels()).toBe(0);
    expect(service.unsentLabelCount()).toBe(2);

    remote.down = false;
    expect(await service.syncLabels()).toBe(2);
    expect(service.unsentLabelCount()).toBe(0);
    expect(remote.labels.map((l) => [l.phrase, l.tier, l.source])).toEqual([
      ['the moon glows', 'poetic', 'labeler'],
      ['the golden toast', 'ok', 'play'],
    ]);
    expect(remote.labels[0].at).toMatch(/^\d{4}-/);
    expect(service.labels()).toHaveLength(2);
  });

  it('drops labels the remote judge refuses, so they are not retried forever', async () => {
    const remote = fakeRemote();
    remote.down = new JudgeRequestError('bad request', false);
    const service = createJudgeService(remote, createVerdictStore(memoryStorage()), createLabelStore(memoryStorage()));
    service.label({ phrase: 'the moon glows', tier: 'poetic', source: 'labeler' });
    expect(await service.syncLabels()).toBe(0);
    expect(service.unsentLabelCount()).toBe(0);
    expect(service.labels()).toHaveLength(1);
  });
});

describe('verdict store', () => {
  it('survives corrupt entries and caps the offline queue', () => {
    const storage = memoryStorage();
    const store = createVerdictStore(storage);
    storage.setItem('crossphrase:v1:verdict:the moon', '{not json');
    expect(store.get('the moon')).toBeNull();

    store.addPending(Array.from({ length: 250 }, (_, i) => `phrase ${i}`));
    store.addPending(['phrase 249']);
    expect(store.pending()).toHaveLength(200);
    expect(store.pending()[199]).toBe('phrase 249');
  });

  it('never stores the provisional flag', () => {
    const store = createVerdictStore(memoryStorage());
    store.put('the moon', {
      valid: true,
      tier: 'ok',
      reading: 'the moon',
      reason: '',
      quip: '',
      provisional: true,
    });
    expect(store.get('the moon')).not.toHaveProperty('provisional');
  });
});
