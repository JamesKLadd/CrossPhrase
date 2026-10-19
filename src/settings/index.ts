import 'expo-sqlite/localStorage/install';

import { useSyncExternalStore } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { createSettingsStore, type Settings } from './settingsStore';

export * from './settingsStore';

export const settings = createSettingsStore(localStorage);

export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, settings.snapshot, settings.snapshot);
}

/** True when animations should be kept to a minimum: the player's choice or the phone's. */
export function useReduceMotion(): boolean {
  const system = useReducedMotion();
  return useSettings().reduceMotion || system;
}
