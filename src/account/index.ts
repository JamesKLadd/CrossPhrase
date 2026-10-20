import 'expo-sqlite/localStorage/install';

import { FunctionsHttpError } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { track } from '../analytics';
import { dayKey } from '../data/dailies';
import { wallet } from '../economy';
import { lastSignInError, signedIn } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { EMPTY_PROGRESS, progress } from '../progress';
import { clearScoreOutbox } from '../scores';
import { accountEmail, passwordProblem, usernameProblem } from '../../supabase/functions/_shared/accountRules';
import { createAccountSync, type AccountState, type SaveBackend } from './sync';

export type { AccountState } from './sync';
export { passwordProblem, usernameProblem };

// Accounts: a username and password that keep a player's progress, hearts
// and feathers in a cloud save, so they can play on any device. Without one,
// a player is a guest on this device (still on the leaderboards, as
// "Anonymous owl"). Needs the backend (Supabase); see README.

const client = supabase;
export const accountsAvailable = client !== null;

/** Waits this long after a change before saving, so a burst of changes is one save. */
const SAVE_DELAY_MS = 3_000;

const backend: SaveBackend = {
  async userId() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.user.id ?? null;
  },
  async get() {
    const { data, error } = await client!.rpc('get_save');
    if (error) throw error;
    const row = (data as { data: unknown; updated_at: string }[] | null)?.[0];
    return row ? { data: row.data, updatedAt: row.updated_at } : null;
  },
  async put(data, expected) {
    const { data: at, error } = await client!.rpc('put_save', { p_data: data, p_expected: expected });
    if (error) throw error;
    return (at as string | null) ?? null;
  },
};

const sync = createAccountSync({ storage: localStorage, backend, progress, wallet, today: () => dayKey() });

export function useAccount(): AccountState {
  return useSyncExternalStore(sync.subscribe, sync.state, sync.state);
}

export function syncAccount(): Promise<unknown> {
  return sync.sync();
}

/** Asks the server whether this account is the game's admin (only the buttons depend on it). */
async function refreshAdmin(): Promise<void> {
  if (!client || !sync.state().userId) return;
  const { data, error } = await client.rpc('is_admin');
  if (!error) sync.setAdmin(data === true);
}

/** The message in a failed function call's response, if it has one. */
async function functionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await (error.context as Response).json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Not JSON: fall through.
    }
  }
  return "Couldn't reach the server. Check your connection and try again.";
}

/**
 * Turns this device's player into an account. Their progress here becomes
 * the account's. Returns null on success, or what went wrong.
 */
export async function createAccount(username: string, password: string): Promise<string | null> {
  if (!client) return 'Accounts need the online backend.';
  const name = username.trim();
  const problem = usernameProblem(name) ?? passwordProblem(password);
  if (problem) return problem;
  if (!(await signedIn())) return `Couldn't connect: ${lastSignInError() ?? 'no connection'}`;
  const { data, error } = await client.functions.invoke('account', { body: { action: 'signup', username: name, password } });
  if (error) return functionError(error);
  const { data: session } = await client.auth.refreshSession();
  const userId = session.user?.id ?? (await backend.userId());
  if (!userId) return 'The account was made, but signing in failed. Log in with it.';
  sync.signIn(userId, (data as { username?: string })?.username ?? name);
  track('account', { action: 'created' });
  void sync.sync();
  void refreshAdmin();
  return null;
}

/**
 * Logs in to an account. Progress made on this device as a guest is added to
 * it. Returns null on success, or what went wrong.
 */
export async function logIn(username: string, password: string): Promise<string | null> {
  if (!client) return 'Accounts need the online backend.';
  const name = username.trim();
  if (usernameProblem(name) || !password) return 'Wrong username or password.';
  const { data, error } = await client.auth.signInWithPassword({ email: accountEmail(name), password });
  if (error) {
    return /invalid login/i.test(error.message)
      ? 'Wrong username or password.'
      : `Couldn't log in: ${error.message}`;
  }
  const { data: row } = await client.from('accounts').select('username').eq('user_id', data.user.id).maybeSingle();
  sync.signIn(data.user.id, (row as { username?: string } | null)?.username ?? name);
  track('account', { action: 'login' });
  await sync.sync();
  await refreshAdmin();
  return null;
}

/** Starts this device over as a new guest: the account's progress stays in the cloud. */
function clearDevice() {
  progress.replace({ ...EMPTY_PROGRESS, unlockAll: progress.snapshot().unlockAll });
  wallet.reset();
  clearScoreOutbox();
  sync.forget();
}

/**
 * Saves, then logs out on this device only (other devices stay logged in).
 * Returns 'unsaved' without logging out if the save failed, unless `anyway`.
 */
export async function logOut(anyway = false): Promise<'done' | 'unsaved'> {
  if (!client) return 'done';
  const saved = await sync.sync();
  if (!anyway && (saved === 'offline' || saved === 'signed-out')) return 'unsaved';
  track('account', { action: 'logout' });
  await client.auth.signOut({ scope: 'local' });
  clearDevice();
  return 'done';
}

/** Deletes the account, its cloud save and its scores, everywhere. Returns null on success. */
export async function deleteAccount(): Promise<string | null> {
  if (!client) return 'Accounts need the online backend.';
  const { error } = await client.functions.invoke('account', { body: { action: 'delete' } });
  if (error) return functionError(error);
  await client.auth.signOut({ scope: 'local' });
  clearDevice();
  return null;
}

export async function changePassword(password: string): Promise<string | null> {
  if (!client) return 'Accounts need the online backend.';
  const problem = passwordProblem(password);
  if (problem) return problem;
  const { error } = await client.auth.updateUser({ password });
  return error ? `Couldn't change it: ${error.message}` : null;
}

let started = false;

/** Keeps the cloud save up to date: at start, a moment after each change, and when the game goes to the background. Call once. */
export function startAccountSync(): void {
  if (started || !client) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = () => {
    if (sync.applying() || !sync.state().userId) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void sync.sync(), SAVE_DELAY_MS);
  };
  progress.subscribe(soon);
  wallet.subscribe(soon);
  // Back in front: catch up with other devices. Going away: save now.
  AppState.addEventListener('change', () => void sync.sync());
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => void sync.sync());
  }
  void sync.sync().then(refreshAdmin);
}
