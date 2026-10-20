import 'expo-sqlite/localStorage/install';

import { useEffect, useState, useSyncExternalStore } from 'react';

import type { LivesStatus, Wallet } from '../core/economy';
import { remoteConfig } from '../remote';
import { createWalletStore } from './walletStore';

export * from './walletStore';

export const wallet = createWalletStore(localStorage, () => remoteConfig.snapshot().economy);

export function useWallet(): Wallet {
  return useSyncExternalStore(wallet.subscribe, wallet.snapshot, wallet.snapshot);
}

/** The player's hearts, ticking every second while one is on its way. */
export function useLives(): LivesStatus {
  const [status, setStatus] = useState(() => wallet.lives());
  const waiting = status.nextIn !== null;
  useEffect(() => {
    const update = () => setStatus(wallet.lives());
    const unsubscribe = wallet.subscribe(update);
    const unsubscribeConfig = remoteConfig.subscribe(update);
    const timer = waiting ? setInterval(update, 1000) : null;
    return () => {
      unsubscribe();
      unsubscribeConfig();
      if (timer) clearInterval(timer);
    };
  }, [waiting]);
  return status;
}
