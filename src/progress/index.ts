import 'expo-sqlite/localStorage/install';

import { useSyncExternalStore } from 'react';

import { createProgressStore, type ProgressSnapshot } from './progressStore';

export * from './progressStore';

export const progress = createProgressStore(localStorage);

/** The player's progress, re-rendering when it changes. */
export function useProgress(): ProgressSnapshot {
  return useSyncExternalStore(progress.subscribe, progress.snapshot, progress.snapshot);
}
