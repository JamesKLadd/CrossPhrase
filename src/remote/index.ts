import 'expo-sqlite/localStorage/install';

import { useSyncExternalStore } from 'react';

import { supabase } from '../lib/supabase';
import { createRemoteConfigStore, type RemoteConfig } from './remoteStore';

export * from './remoteStore';

const client = supabase;

export const remoteConfig = createRemoteConfigStore(
  localStorage,
  client
    ? async () => {
        const { data, error } = await client.from('remote_config').select('key, value');
        if (error) throw error;
        return Object.fromEntries((data ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]));
      }
    : null,
);

export function useRemoteConfig(): RemoteConfig {
  return useSyncExternalStore(remoteConfig.subscribe, remoteConfig.snapshot, remoteConfig.snapshot);
}
