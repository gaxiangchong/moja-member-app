import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchQueueOrders, SESSION_EXPIRED_EVENT } from './api';
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
  const [sessionExpired, setSessionExpired] = useState(false);

  // Track the latest status so the 401 listener can tell a live session from a
  // failed sign-in attempt without re-subscribing on every state change.
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

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

  // A background request was rejected with 401 (the ops key was rotated or
  // revoked). Drop the live session and prompt for re-login. Ignore 401s from
  // sign-in attempts (status is not yet 'authenticated'), which surface their
  // own inline error.
  useEffect(() => {
    const onExpired = () => {
      if (statusRef.current !== 'authenticated') return;
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_BASE);
      } catch {
        /* ignore */
      }
      setState({ status: 'guest' });
      setSessionExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const signIn = useCallback(
    async (key: string, base: string) => {
      const trimmedKey = key.trim();
      const trimmedBase = base.trim() || defaultBase;
      if (!trimmedKey) throw new Error('Enter the ops API key from the server env OPS_QUEUE_API_KEY.');
      await verifySession(trimmedKey, trimmedBase);
      setSessionExpired(false);
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

  return { state, signIn, signOut, sessionExpired, devKeyPrefill: readDevKeyPrefill() };
}
