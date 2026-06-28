import { useEffect } from 'react';

/** Keeps --app-vh in sync with the visible viewport (iOS address bar / keyboard). */
export function useVisualViewportHeight(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      document.documentElement.style.removeProperty('--app-vh');
      document.documentElement.classList.remove('bento-shell-locked');
      return;
    }

    document.documentElement.classList.add('bento-shell-locked');

    const sync = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-vh', `${h}px`);
    };

    sync();
    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);

    return () => {
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      document.documentElement.style.removeProperty('--app-vh');
      document.documentElement.classList.remove('bento-shell-locked');
    };
  }, [enabled]);
}
