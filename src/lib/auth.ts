import 'expo-sqlite/localStorage/install';

import { accountRemembered } from '../account/sync';
import { supabase } from './supabase';

// Every player is signed in anonymously (one account per device) the first
// time something needs the backend: leaderboards, analytics, the Claude judge.

/** Why the last anonymous sign-in failed, to show the player. */
let signInError: string | null = null;
let signingIn: Promise<boolean> | null = null;

/**
 * Signs in anonymously if needed. False when there's no backend or sign-in
 * failed. A guest session is only ever started on a device with no account:
 * if the saved login couldn't be read just now, or an account's login has
 * ended, starting a guest would overwrite the account's login, so this waits
 * instead (queued scores, stats and labels go once the player is back in).
 */
export async function signedIn(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getSession();
  if (data.session) return true;
  if (error) {
    signInError = error.message;
    return false;
  }
  if (accountRemembered(localStorage)) {
    signInError = 'Log in to your account again (👤 on the home screen).';
    return false;
  }
  signingIn ??= supabase.auth
    .signInAnonymously()
    .then(({ error }) => {
      signInError = error ? error.message : null;
      if (error) console.warn('Anonymous sign-in failed:', error.message);
      return !error;
    })
    .catch((e: unknown) => {
      signInError = String(e);
      return false;
    })
    .finally(() => (signingIn = null));
  return signingIn;
}

export function lastSignInError(): string | null {
  return signInError;
}
