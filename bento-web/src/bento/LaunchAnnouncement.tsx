import { useState } from 'react';
import { useI18n } from '../lib/i18n/context';

/**
 * Closeable floating window shown on the weekly menu page announcing the bento
 * launch (22 June) and pickup location (Moja Maison Eco Botanic). It appears
 * fresh on every visit/login; closing only hides it for the current view.
 */
export function LaunchAnnouncement() {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);

  if (!open) return null;

  const close = () => setOpen(false);

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
      </div>
    </div>
  );
}
