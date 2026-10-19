// The labelling screen is for the developer only: it needs a PIN from
// .env.local (EXPO_PUBLIC_DEV_PIN). Without one, the screen doesn't exist.
// This keeps friends and testers out; it isn't real security, since the PIN
// ships inside development builds. Leave it unset for release builds.

const PIN = process.env.EXPO_PUBLIC_DEV_PIN ?? '';
let unlocked = false;

export const labellingEnabled = PIN.length > 0;

export function isUnlocked(): boolean {
  return labellingEnabled && unlocked;
}

export function unlock(attempt: string): boolean {
  unlocked = labellingEnabled && attempt === PIN;
  return unlocked;
}
