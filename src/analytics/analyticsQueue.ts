import type { KeyValueStorage } from '../judge/verdictStore';

// Play analytics: small anonymous events ("level 37 lost after 3 submits"),
// queued on the device and sent in batches to the backend, where views sum
// them up for playtesting and tuning (see the live-ops migration). Events
// never include words the player typed, apart from feedback they choose to
// send. Players can switch them off in Settings.

export type EventProps = Record<string, string | number | boolean | null>;

export interface QueuedEvent {
  name: string;
  /** When it happened, ISO time. */
  at: string;
  props: EventProps;
}

/** Sends a batch; throws if it didn't arrive (the batch is kept and retried). */
export type EventSink = (session: string, events: QueuedEvent[]) => Promise<void>;

export interface Analytics {
  /** `always` sends even with analytics switched off (feedback the player chose to send). */
  track(name: string, props?: EventProps, options?: { always?: boolean }): void;
  flush(): Promise<void>;
  pending(): number;
}

const KEY = 'crossphrase:v1:events';
/** Events per request (the backend takes up to 50). */
const BATCH = 25;
/** Events kept while offline; the oldest go first. */
const MAX_QUEUED = 300;

export function createAnalytics({
  storage,
  sink,
  enabled,
  session,
  now = () => new Date(),
}: {
  storage: KeyValueStorage;
  sink: EventSink | null;
  enabled: () => boolean;
  session: string;
  now?: () => Date;
}): Analytics {
  let queue: QueuedEvent[] = [];
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? '[]');
    if (Array.isArray(saved)) queue = saved;
  } catch {
    // Lost events aren't worth crashing over.
  }
  const save = () => storage.setItem(KEY, JSON.stringify(queue));
  let flushing: Promise<void> | null = null;

  const flush = (): Promise<void> => {
    if (!sink || queue.length === 0) return Promise.resolve();
    flushing ??= (async () => {
      try {
        while (queue.length > 0) {
          const batch = queue.slice(0, BATCH);
          await sink(session, batch);
          queue = queue.slice(batch.length);
          save();
        }
      } catch {
        // Offline or the backend is down: keep the events for next time.
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  };

  return {
    track(name, props = {}, options = {}) {
      if (!sink || (!enabled() && !options.always)) return;
      queue = [...queue, { name, at: now().toISOString(), props }].slice(-MAX_QUEUED);
      save();
      if (queue.length >= BATCH || options.always) void flush();
    },
    flush,
    pending: () => queue.length,
  };
}

/** A random id for this run of the game, to group a session's events. */
export function newSessionId(random: () => number = Math.random): string {
  const part = () => Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0');
  return `${Date.now().toString(36)}-${part()}${part()}`;
}
