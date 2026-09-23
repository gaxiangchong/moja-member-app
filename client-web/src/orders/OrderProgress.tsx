import { ORDER_STATUS, orderProgressStep } from '../lib/orderStatus';

const STEPS = ['Order received', 'Preparing', 'Ready', 'Collected'] as const;

/** "Ready" and "Collected" read differently for a delivery. */
function stepLabels(isDelivery: boolean): readonly string[] {
  if (!isDelivery) return STEPS;
  return ['Order received', 'Preparing', 'Out for delivery', 'Delivered'];
}

function timeLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Four-step tracker for an active order — the Luckin-style "where is my cake"
 * view. Cancelled orders show a single explanatory line instead of the steps.
 */
export function OrderProgress({
  status,
  fulfilmentType,
  placedAt,
  preparingAt,
  readyAt,
  completedAt,
  cancelReason,
}: {
  status: string | null | undefined;
  fulfilmentType?: string | null;
  placedAt: string;
  preparingAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  cancelReason?: string | null;
}) {
  if (status === ORDER_STATUS.CANCELLED) {
    return (
      <p className="orderProgressCancelled">
        Cancelled{cancelReason ? ` — ${cancelReason}` : ''}
      </p>
    );
  }

  const current = orderProgressStep(status);
  const labels = stepLabels(fulfilmentType === 'DELIVERY');
  const times = [placedAt, preparingAt, readyAt, completedAt];

  return (
    <ol className="orderProgress" aria-label="Order progress">
      {labels.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        const at = timeLabel(times[i]);
        return (
          <li key={label} className={`orderProgressStep is-${state}`}>
            <span className="orderProgressDot" aria-hidden />
            <span className="orderProgressLabel">
              {label}
              {at && <span className="orderProgressTime">{at}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
