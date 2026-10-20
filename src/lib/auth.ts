import { supabase } from './supabase';

// Every player is signed in anonymously (one account per device) the first
// time something needs the backend: leaderboards, analytics, the Claude judge.

/** Why the last anonymous sign-in failed, to show the player. */
let signInError: string | null = null;
let signingIn: Promise<boolean> | null = null;

/** Signs in anonymously if needed. False when there's no backend or sign-in failed. */
export async function signedIn(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
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
