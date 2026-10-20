import type { KeyValueStorage } from '../../judge/verdictStore';
import { createAnalytics, newSessionId, type QueuedEvent } from '../analyticsQueue';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const NOW = () => new Date('2026-10-21T10:00:00Z');

function setup({ enabled = true, failing = false } = {}) {
  const storage = memoryStorage();
  const sent: QueuedEvent[][] = [];
  const state = { failing, enabled };
  const sink = async (_session: string, events: QueuedEvent[]) => {
    if (state.failing) throw new Error('offline');
    sent.push(events);
  };
  const make = () => createAnalytics({ storage, sink, enabled: () => state.enabled, session: 's-123456789', now: NOW });
  return { storage, sent, state, make, analytics: make() };
}

describe('analytics', () => {
  it('queues events and sends them in a batch', async () => {
    const { analytics, sent } = setup();
    analytics.track('game_start', { mode: 'level', number: 11 });
    analytics.track('game_end', { won: true });
    expect(analytics.pending()).toBe(2);
    await analytics.flush();
    expect(sent).toEqual([
      [
        { name: 'game_start', at: '2026-10-21T10:00:00.000Z', props: { mode: 'level', number: 11 } },
        { name: 'game_end', at: '2026-10-21T10:00:00.000Z', props: { won: true } },
      ],
    ]);
    expect(analytics.pending()).toBe(0);
  });

  it('keeps events while offline, even across restarts', async () => {
    const { analytics, sent, state, make } = setup({ failing: true });
    analytics.track('game_quit');
    await analytics.flush();
    expect(analytics.pending()).toBe(1);
    state.failing = false;
    const restarted = make();
    expect(restarted.pending()).toBe(1);
    await restarted.flush();
    expect(sent.flat().map((e) => e.name)).toEqual(['game_quit']);
  });

  it('sends a full batch without waiting', async () => {
    const { analytics, sent } = setup();
    for (let i = 0; i < 25; i++) analytics.track('game_submit', { submit: i });
    await analytics.flush();
    expect(sent[0]).toHaveLength(25);
  });

  it('collects nothing when switched off, except what the player chooses to send', async () => {
    const { analytics, sent } = setup({ enabled: false });
    analytics.track('game_start');
    analytics.track('feedback', { text: 'Level 12 is hard' }, { always: true });
    await analytics.flush();
    expect(sent.flat().map((e) => e.name)).toEqual(['feedback']);
  });

  it('caps the queue, dropping the oldest', () => {
    const { analytics } = setup({ failing: true });
    for (let i = 0; i < 400; i++) analytics.track('x');
    expect(analytics.pending()).toBe(300);
  });

  it('makes session ids the backend accepts', () => {
    expect(newSessionId()).toMatch(/^[A-Za-z0-9-]{8,40}$/);
    expect(newSessionId()).not.toBe(newSessionId());
  });
});
