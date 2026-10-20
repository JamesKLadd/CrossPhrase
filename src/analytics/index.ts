import 'expo-sqlite/localStorage/install';

import { AppState, Platform } from 'react-native';

import { signedIn } from '../lib/auth';
import { BUILD } from '../lib/build';
import { supabase } from '../lib/supabase';
import { settings } from '../settings';
import { createAnalytics, newSessionId, type EventProps, type EventSink } from './analyticsQueue';

export type { EventProps } from './analyticsQueue';

const FLUSH_EVERY_MS = 30_000;

const client = supabase;
const sink: EventSink | null = client
  ? async (session, events) => {
      if (!(await signedIn())) throw new Error('not signed in');
      const { error } = await client.rpc('log_events', { p_session: session, p_events: events });
      if (error) throw error;
    }
  : null;

/** Analytics need the backend (Supabase); without it nothing is collected. */
export const analyticsAvailable = sink !== null;

const analytics = createAnalytics({
  storage: localStorage,
  sink,
  enabled: () => settings.snapshot().analytics,
  session: newSessionId(),
});

export function track(name: string, props?: EventProps): void {
  analytics.track(name, props);
}

/** Sends the player's feedback right away (even with analytics off: they chose to send it). */
export function sendFeedback(text: string, screen: string): void {
  analytics.track(
    'feedback',
    { text: text.trim().slice(0, 500), screen, version: BUILD, platform: Platform.OS },
    { always: true },
  );
}

let started = false;

/** Starts sending queued events now and then, and when the game goes to the background. Call once. */
export function startAnalytics(props: EventProps): void {
  if (started || !sink) return;
  started = true;
  track('session_start', { platform: Platform.OS, version: BUILD, ...props });
  const flush = () => void analytics.flush();
  setInterval(flush, FLUSH_EVERY_MS);
  AppState.addEventListener('change', (state) => state !== 'active' && flush());
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    // Phones close web pages without warning; send what's queued when the page is hidden.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  }
}
