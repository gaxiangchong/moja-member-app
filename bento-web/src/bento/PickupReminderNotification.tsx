import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import {
  PICKUP_ADDRESS_LINE,
  PICKUP_GOOGLE_MAPS_URL,
  PICKUP_VENUE_NAME,
} from './pickupLocation';
import { PickupPackColorBesideId } from './PickupPackColorSummary';
import type { PickupDayPackSummary } from './pickupPackSummary';
import { useI18n } from '../lib/i18n/context';

function PickupQrBlock({ pickupId }: { pickupId: string }) {
  const { t } = useI18n();
  const payload = `BENTO:${pickupId}`;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    toDataURL(payload, {
      margin: 1,
      width: 168,
      color: { dark: '#2B2B2B', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [payload]);

  return (
    <div className="pickupReminderQrBlock">
      {src ? (
        <img
          src={src}
          alt={t('pickup.qrAlt', { id: pickupId })}
          width={168}
          height={168}
          className="pickupReminderQrImg"
        />
      ) : (
        <p className="pickupReminderQrLoading">{t('pickup.qrLoading')}</p>
      )}
      <p className="pickupReminderQrHint">{t('pickup.qrHint')}</p>
    </div>
  );
}

type Props = {
  justConfirmed?: boolean;
  pickupId?: string | null;
  nextPickup?: PickupDayPackSummary | null;
};

export function PickupReminderNotification({
  justConfirmed = false,
  pickupId,
  nextPickup,
}: Props) {
  const { t } = useI18n();
  const showIdBlock = Boolean(pickupId) || (nextPickup && nextPickup.totalPacks > 0);

  return (
    <div
      className={`pickupReminderNotification${justConfirmed ? ' pickupReminderNotificationConfirmed' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="pickupReminderIcon" aria-hidden>
        {justConfirmed ? '✅' : '📍'}
      </div>
      <div className="pickupReminderBody">
        <p className="pickupReminderTitle">
          {justConfirmed ? t('pickup.confirmedTitle') : t('pickup.title')}
        </p>
        <p className="pickupReminderText">
          {justConfirmed ? t('pickup.confirmedText') : t('pickup.text')}
        </p>

        <div className="pickupReminderAddress">
          <div className="pickupReminderAddressHead">
            <span className="pickupReminderAddressLabel">{t('pickup.addressLabel')}</span>
            <a
              href={PICKUP_GOOGLE_MAPS_URL}
              className="pickupMapLink"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('pickup.mapAria')}
              title={t('pickup.mapTitle')}
            >
              <svg className="pickupMapIcon" viewBox="0 0 24 24" aria-hidden focusable="false">
                <path
                  fill="currentColor"
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
                />
              </svg>
            </a>
          </div>
          <strong>{PICKUP_VENUE_NAME}</strong>
          <span>{PICKUP_ADDRESS_LINE}</span>
        </div>

        {showIdBlock && (
          <div className="pickupReminderIdBlock">
            <span className="pickupReminderAddressLabel">{t('pickup.idLabel')}</span>
            <div className="pickupReminderIdRow">
              {pickupId && <strong className="pickupReminderId">{pickupId}</strong>}
              {nextPickup && nextPickup.totalPacks > 0 && (
                <PickupPackColorBesideId summary={nextPickup} />
              )}
            </div>
            {pickupId ? <PickupQrBlock pickupId={pickupId} /> : null}
            <span className="pickupReminderIdHint">{t('pickup.idHint')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
