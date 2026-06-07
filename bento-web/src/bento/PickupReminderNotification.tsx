import {
  PICKUP_ADDRESS_LINE,
  PICKUP_GOOGLE_MAPS_URL,
  PICKUP_VENUE_NAME,
} from './pickupLocation';
import { PickupPackColorBesideId } from './PickupPackColorSummary';
import type { PickupDayPackSummary } from './pickupPackSummary';

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
          {justConfirmed ? 'Schedule confirmed — pick up at Moja Maison' : 'Pick up at Moja Maison'}
        </p>
        <p className="pickupReminderText">
          {justConfirmed
            ? 'Your pickup days are saved. Please collect your meals at our store on your scheduled dates.'
            : 'Please collect your meals at our store on your scheduled pickup dates.'}
        </p>

        <div className="pickupReminderAddress">
          <div className="pickupReminderAddressHead">
            <span className="pickupReminderAddressLabel">Pickup address</span>
            <a
              href={PICKUP_GOOGLE_MAPS_URL}
              className="pickupMapLink"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open pickup address in Google Maps"
              title="Open in Google Maps"
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
            <span className="pickupReminderAddressLabel">Your pickup ID</span>
            <div className="pickupReminderIdRow">
              {pickupId && <strong className="pickupReminderId">{pickupId}</strong>}
              {nextPickup && nextPickup.totalPacks > 0 && (
                <PickupPackColorBesideId summary={nextPickup} />
              )}
            </div>
            <span className="pickupReminderIdHint">
              Show this ID and the colour dots to Moja staff when collecting your meals.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
