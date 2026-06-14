import type { PurchaseCapacityInfo } from './types';
import { useI18n } from '../lib/i18n/context';

function formatDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

type Props = {
  availability: PurchaseCapacityInfo;
};

export function PurchaseCapacityNotice({ availability }: Props) {
  const { lang, t } = useI18n();
  const locale = lang === 'zh' ? 'zh-CN' : 'en-MY';

  if (availability.canPurchase) return null;

  if (availability.ordersPaused) {
    return (
      <div className="purchaseCapacityBlock purchaseCapacityBlockPaused" role="alert">
        <p className="purchaseCapacityTitle">{t('capacity.pausedTitle')}</p>
        <p className="purchaseCapacityBody">{t('capacity.pausedBody')}</p>
      </div>
    );
  }

  const { requiredPacks, availablePacksInWindow, windowDays, nextAvailableDate, daysUntilAvailable } =
    availability;

  return (
    <div className="purchaseCapacityBlock" role="alert">
      <p className="purchaseCapacityTitle">{t('capacity.slotsTitle')}</p>
      <p className="purchaseCapacityBody">
        {t('capacity.slotsBody', {
          required: requiredPacks,
          available: availablePacksInWindow,
          days: windowDays,
          daily: availability.dailyCapacityPacks,
        })}
      </p>
      {nextAvailableDate ? (
        <p className="purchaseCapacityAction">
          {t('capacity.returnFrom', {
            date: formatDate(nextAvailableDate, locale),
            wait:
              daysUntilAvailable != null && daysUntilAvailable > 0
                ? t(
                    daysUntilAvailable === 1 ? 'capacity.waitDays' : 'capacity.waitDaysPlural',
                    { count: daysUntilAvailable },
                  )
                : '',
          })}
        </p>
      ) : (
        <p className="purchaseCapacityAction">{t('capacity.tryLater')}</p>
      )}
    </div>
  );
}
