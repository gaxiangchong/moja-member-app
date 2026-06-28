import { useState } from 'react';
import { useI18n } from '../lib/i18n/context';

const SUPPRESS_KEY = 'bento-voucher-announcement-dismissed';

function readSuppressed(): boolean {
  try {
    return localStorage.getItem(SUPPRESS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Closeable floating window shown on the weekly menu page announcing the active
 * discount-voucher promo (enter the emailed code at checkout for money off). It
 * appears fresh on every visit/login unless the user ticks "Don't show this
 * again", which suppresses it permanently (persisted in localStorage).
 */
export function LaunchAnnouncement() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => !readSuppressed());
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!open) return null;

  const close = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(SUPPRESS_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  };

  return (
    <div className="launchAnnounceOverlay" role="dialog" aria-live="polite" aria-label={t('launch.title')}>
      <div className="launchAnnounceCard">
        <button
          type="button"
          className="launchAnnounceClose"
          onClick={close}
          aria-label={t('common.close')}
        >
          ×
        </button>
        <span className="launchAnnounceBadge">{t('launch.badge')}</span>
        <h3 className="launchAnnounceTitle">{t('launch.title')}</h3>
        <p className="launchAnnounceText">{t('launch.body')}</p>
        <p className="launchAnnouncePickup">
          <span className="launchAnnouncePin">📍</span>
          {t('launch.pickup')}
        </p>
        <button type="button" className="btnPrimary launchAnnounceCta" onClick={close}>
          {t('launch.gotIt')}
        </button>
        <label className="launchAnnounceDismiss">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          {t('launch.dontShowAgain')}
        </label>
      </div>
    </div>
  );
}
