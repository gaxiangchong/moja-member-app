import type { PurchaseCapacityInfo } from './types';

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-MY', {
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
  if (availability.canPurchase) return null;

  if (availability.ordersPaused) {
    return (
      <div className="purchaseCapacityBlock purchaseCapacityBlockPaused" role="alert">
        <p className="purchaseCapacityTitle">New orders temporarily paused</p>
        <p className="purchaseCapacityBody">
          We are not accepting new meal plans at the moment. Please check back later.
        </p>
      </div>
    );
  }

  const { requiredPacks, availablePacksInWindow, windowDays, nextAvailableDate, daysUntilAvailable } =
    availability;

  return (
    <div className="purchaseCapacityBlock" role="alert">
      <p className="purchaseCapacityTitle">Not enough pickup slots available</p>
      <p className="purchaseCapacityBody">
        This plan needs <strong>{requiredPacks} meal slots</strong>, but only{' '}
        <strong>{availablePacksInWindow}</strong> are free across the next{' '}
        <strong>{windowDays} days</strong> (our daily limit is{' '}
        {availability.dailyCapacityPacks} packs per day).
      </p>
      {nextAvailableDate ? (
        <p className="purchaseCapacityAction">
          Please come back from{' '}
          <strong>{formatDate(nextAvailableDate)}</strong>
          {daysUntilAvailable != null && daysUntilAvailable > 0
            ? ` — about ${daysUntilAvailable} day${daysUntilAvailable === 1 ? '' : 's'} from now`
            : ''}
          . We will reopen checkout once enough dates have capacity for your meals.
        </p>
      ) : (
        <p className="purchaseCapacityAction">
          Please try again later when more pickup dates have opened up.
        </p>
      )}
    </div>
  );
}
