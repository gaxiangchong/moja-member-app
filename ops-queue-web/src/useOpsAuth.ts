import { useCallback, useEffect, useState } from 'react';
import { fetchQueueOrders } from './api';
import {
  defaultBase,
  readDevKeyPrefill,
  readStoredBase,
  readStoredKey,
  STORAGE_BASE,
  STORAGE_KEY,
} from './opsSession';

export type OpsAuthState =
  | { status: 'checking' }
  | { status: 'guest' }
  | { status: 'authenticated'; apiKey: string; apiBase: string };

export function useOpsAuth() {
  const [state, setState] = useState<OpsAuthState>({ status: 'checking' });

  const verifySession = useCallback(async (key: string, base: string) => {
    await fetchQueueOrders(key.trim(), base.trim() || defaultBase);
    setState({
      status: 'authenticated',
      apiKey: key.trim(),
      apiBase: base.trim() || defaultBase,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const key = readStoredKey();
    const base = readStoredBase();
    if (!key) {
      setState({ status: 'guest' });
      return;
    }
    fetchQueueOrders(key, base)
      .then(() => {
        if (!cancelled) {
          setState({ status: 'authenticated', apiKey: key, apiBase: base });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'guest' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== STORAGE_BASE) return;
      const key = readStoredKey();
      if (!key) {
        setState({ status: 'guest' });
        return;
      }
      const base = readStoredBase();
      fetchQueueOrders(key, base)
        .then(() => setState({ status: 'authenticated', apiKey: key, apiBase: base }))
        .catch(() => setState({ status: 'guest' }));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const signIn = useCallback(
    async (key: string, base: string) => {
      const trimmedKey = key.trim();
      const trimmedBase = base.trim() || defaultBase;
      if (!trimmedKey) throw new Error('Enter the ops API key from the server env OPS_QUEUE_API_KEY.');
      await verifySession(trimmedKey, trimmedBase);
      try {
        localStorage.setItem(STORAGE_KEY, trimmedKey);
        localStorage.setItem(STORAGE_BASE, trimmedBase);
      } catch {
        /* private mode */
      }
    },
    [verifySession],
  );

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_BASE);
    } catch {
      /* ignore */
    }
    setState({ status: 'guest' });
  }, []);

  return { state, signIn, signOut, devKeyPrefill: readDevKeyPrefill() };
}
