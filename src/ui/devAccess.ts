// The developer tools (labelling screen, unlock-all, reset progress) need a
// PIN from .env.local (EXPO_PUBLIC_DEV_PIN). Without one, they don't exist.
// This keeps friends and testers out; it isn't real security, since the PIN
// ships inside development builds. Leave it unset for release builds.

const PIN = process.env.EXPO_PUBLIC_DEV_PIN ?? '';
let unlocked = false;

export const devToolsEnabled = PIN.length > 0;

export function isUnlocked(): boolean {
  return devToolsEnabled && unlocked;
}

export function unlock(attempt: string): boolean {
  unlocked = devToolsEnabled && attempt === PIN;
  return unlocked;
}
