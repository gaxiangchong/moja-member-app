import { useCallback, useEffect, useState } from 'react';

/** Chrome/Edge/Android fire this before showing their own install UI. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'moja.pwa.installDismissedAt';
/** Don't nag: once dismissed, stay quiet for this long. */
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Registers `/sw.js` once the page has loaded. Dev builds skip it so Vite HMR
 * and the SW don't fight over stale assets; the production build registers it
 * and a waiting worker takes over on the next navigation.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  });
}

/** True when running as an installed app (home-screen icon), not in a browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua);
}

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export type InstallPromptState = {
  /** Show the "Add to home screen" banner. */
  visible: boolean;
  /** iOS has no install event — show manual Share → Add to Home Screen steps. */
  ios: boolean;
  /** Trigger the native prompt (no-op on iOS). Resolves to the user's choice. */
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismiss: () => void;
};

/**
 * Captures the browser's install prompt so the app can offer "Add to home
 * screen" from its own UI at a sensible moment instead of the browser's
 * mini-infobar. Hidden when already installed or recently dismissed.
 */
export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios] = useState(() => typeof navigator !== 'undefined' && isIosSafari());
  const [hidden, setHidden] = useState(() => isStandaloneDisplay() || recentlyDismissed());

  useEffect(() => {
    if (hidden) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [hidden]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* private mode etc. */
    }
    setHidden(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'dismissed') dismiss();
    else setHidden(true);
    return outcome;
  }, [deferred, dismiss]);

  return {
    visible: !hidden && (deferred !== null || ios),
    ios,
    install,
    dismiss,
  };
}
