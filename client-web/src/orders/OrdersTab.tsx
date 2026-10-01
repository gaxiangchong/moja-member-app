import { useCallback, useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import {
  cancelMyOrder,
  fetchMemberOrders,
  fetchMemberSavings,
  type MemberOrderRow,
  type MemberSavings,
} from '../api';
import { formatOrderPickupLabel } from '../lib/orderRef';
import { formatRm } from '../shop/data/mockCatalog';
import {
  useOrderHistoryStore,
  type PastOrder,
} from '../shop/store/useOrderHistoryStore';
import { useShopStore } from '../shop/store/useShopStore';
import {
  isHistoryOrderStatus,
  isOpenOrderStatus,
  ORDER_STATUS,
  orderStatusLabel,
} from '../lib/orderStatus';
import { OrderProgress } from './OrderProgress';

function mapRowToPastOrder(row: MemberOrderRow): PastOrder {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    placedAt: row.placedAt,
    preparingAt: row.preparingAt,
    readyAt: row.readyAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    fulfilmentType: row.fulfilmentType,
    scheduledDate: row.scheduledDate,
    scheduledSlot: row.scheduledSlot,
    deliveryFeeCents: row.deliveryFeeCents,
    cancellable: row.cancellable,
    status: row.status,
    totalCents: row.totalCents,
    fulfillmentSummary: row.fulfillmentSummary,
    lines: row.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      imageUrl: l.imageUrl ?? '',
      unitPriceCents: l.unitPriceCents,
      qty: l.qty,
      variantLabel: l.variantLabel ?? undefined,
    })),
  };
}

function OrderQrBlock({ orderNumber }: { orderNumber: number }) {
  const payload = `ORDER:${orderNumber}`;
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    toDataURL(payload, {
      margin: 1,
      width: 200,
      color: { dark: '#2B2B2B', light: '#ffffff' },
    })
      .then((u) => {
        if (alive) setSrc(u);
      })
      .catch(() => {
        if (alive) setSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [payload]);
  const label = formatOrderPickupLabel(orderNumber);
  return (
    <div className="orderQrBlock">
      {src ? (
        <img
          src={src}
          alt={`Order ${label} QR`}
          width={200}
          height={200}
          className="orderQrImg"
        />
      ) : (
        <p className="caption">Generating QR…</p>
      )}
      <p className="caption" style={{ marginBottom: 0 }}>
        Pickup code · <strong>{label}</strong>
      </p>
      <p className="caption" style={{ marginTop: 4, fontSize: 11 }}>
        Show this QR at the counter. Staff scans it to mark collected.
      </p>
    </div>
  );
}

/**
 * What the member has saved by being a member — vouchers and rewards on app
 * orders, plus discounts on in-store receipts — since they joined.
 */
function SavingsCard({ savings }: { savings: MemberSavings | null }) {
  if (!savings) {
    return (
      <section className="pmCard savingsCard" aria-busy="true">
        <p className="savingsLabel">Your savings</p>
        <p className="caption" style={{ margin: 0 }}>
          Adding up your savings…
        </p>
      </section>
    );
  }
  const since = savings.memberSince ? new Date(savings.memberSince) : null;
  const sinceLabel =
    since && !Number.isNaN(since.getTime())
      ? since.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : null;
  const saved = savings.totalSavedCents > 0;
  const splitKnown =
    savings.onlineSavedCents > 0 && savings.inStoreSavedCents > 0;
  return (
    <section className="pmCard savingsCard">
      <p className="savingsLabel">Your savings</p>
      <p
        className="savingsValue"
        aria-label={`You have saved ${formatRm(savings.totalSavedCents)}`}
      >
        {formatRm(savings.totalSavedCents)}
      </p>
      <p className="caption savingsCaption">
        {saved
          ? sinceLabel
            ? `Saved with Moja since you joined in ${sinceLabel}`
            : 'Saved with Moja since you joined'
          : 'Use a voucher or reward on your next order and your savings will add up here.'}
      </p>
      {splitKnown ? (
        <p className="caption savingsSplit">
          Online orders {formatRm(savings.onlineSavedCents)} · In store{' '}
          {formatRm(savings.inStoreSavedCents)}
        </p>
      ) : null}
    </section>
  );
}

function isBenignOrdersError(message: string): boolean {
  return /unauthorized|not signed in|invalid.*token|session.*expired|401|403/i.test(
    message,
  );
}

export function OrdersTab({
  active,
  onGoToShop,
}: {
  active: boolean;
  onGoToShop: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [savings, setSavings] = useState<MemberSavings | null>(null);
  // How many days of finished orders to list; the shop sets it. Until the
  // server says, the list is whatever it sent (it already applies the limit).
  const [historyDays, setHistoryDays] = useState<number | null>(null);
  const orders = useOrderHistoryStore((s) => s.orders);
  const setOrdersFromApi = useOrderHistoryStore((s) => s.setOrdersFromApi);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Savings is a nicety: if it fails the orders still load, and the last
      // figure stays on screen.
      const savingsPromise = fetchMemberSavings()
        .then((s) => setSavings(s))
        .catch(() => undefined);
      const { orders: rows, historyDays: days } = await fetchMemberOrders(60);
      setOrdersFromApi(rows.map(mapRowToPastOrder));
      if (days != null) setHistoryDays(days);
      setErr(null);
      await savingsPromise;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load orders';
      if (isBenignOrdersError(message)) {
        setErr(null);
        return;
      }
      setErr(
        'We could not refresh your orders. Pull to refresh again in a moment.',
      );
    } finally {
      setLoading(false);
    }
  }, [setOrdersFromApi]);

  useEffect(() => {
    if (!active) return;
    void load();
    const t = window.setInterval(() => void load(), 12000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active, load]);

  const handleCancel = async (order: PastOrder) => {
    if (
      !window.confirm(
        'Cancel this order? We have not started preparing it yet, so nothing is wasted.',
      )
    ) {
      return;
    }
    setCancellingId(order.id);
    try {
      await cancelMyOrder(order.id);
      await load();
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : 'Could not cancel this order',
      );
      // The kitchen may have just started — resync so the button disappears.
      await load();
    } finally {
      setCancellingId(null);
    }
  };

  const activeOrders = orders.filter((o) => isOpenOrderStatus(o.status));
  // The server already drops old orders; this also clears ones cached on the
  // device from before, so a stale list never lingers when the app is offline.
  const keepAfter =
    historyDays != null ? Date.now() - historyDays * 86_400_000 : null;
  const historyOrders = orders
    .filter((o) => isHistoryOrderStatus(o.status))
    .filter((o) => {
      if (keepAfter == null) return true;
      const finished = new Date(
        o.completedAt || o.cancelledAt || o.placedAt,
      ).getTime();
      return Number.isNaN(finished) || finished >= keepAfter;
    })
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.completedAt || a.placedAt).getTime();
      const tb = new Date(b.completedAt || b.placedAt).getTime();
      return tb - ta;
    });

  const handleReorder = (order: PastOrder) => {
    const add = useShopStore.getState().addToCart;
    for (const line of order.lines) {
      add({
        productId: line.productId,
        name: line.name,
        imageUrl: line.imageUrl,
        unitPriceCents: line.unitPriceCents,
        qty: line.qty,
        variantLabel: line.variantLabel,
      });
    }
    onGoToShop();
  };

  return (
    <>
      <header className="pmTopBar">
        <h2>Orders</h2>
        <button
          type="button"
          className="textAction"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      {err ? (
        <section className="pmCard">
          <p className="err" style={{ margin: 0 }}>
            {err}
          </p>
        </section>
      ) : null}

      <SavingsCard savings={savings} />

      <section className="pmCard">
        <h3 className="shopSectionTitle" style={{ marginTop: 0 }}>
          Active · show QR at pickup
        </h3>
        {!activeOrders.length ? (
          <p className="caption" style={{ margin: 0 }}>
            No open orders. Place one from Shop — your QR appears here until the
            shop marks it collected.
          </p>
        ) : (
          <div className="ordersActiveList">
            {activeOrders.map((order) => {
              const placed = new Date(order.placedAt);
              const when = Number.isNaN(placed.getTime())
                ? order.placedAt
                : placed.toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });
              return (
                <article key={order.id} className="orderActiveCard">
                  <div className="orderActiveHead">
                    <div>
                      <strong>{when}</strong>
                      <span className="orderHistoryTotal">
                        {formatRm(order.totalCents)}
                      </span>
                    </div>
                  </div>
                  {order.orderNumber != null ? (
                    <OrderQrBlock orderNumber={order.orderNumber} />
                  ) : (
                    <p className="caption" style={{ margin: 0 }}>
                      Order number not on this device yet — tap Refresh.
                    </p>
                  )}
                  <OrderProgress
                    status={order.status}
                    fulfilmentType={order.fulfilmentType}
                    placedAt={order.placedAt}
                    preparingAt={order.preparingAt}
                    readyAt={order.readyAt}
                    completedAt={order.completedAt}
                    cancelReason={order.cancelReason}
                  />
                  {order.fulfillmentSummary.length ? (
                    <p className="caption orderHistoryFulfill">
                      {order.fulfillmentSummary.join(' · ')}
                    </p>
                  ) : null}
                  {order.cancellable ? (
                    <button
                      type="button"
                      className="orderCancelBtn"
                      disabled={cancellingId === order.id}
                      onClick={() => void handleCancel(order)}
                    >
                      {cancellingId === order.id
                        ? 'Cancelling…'
                        : 'Cancel order'}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="pmCard">
        <h3 className="shopSectionTitle" style={{ marginTop: 0 }}>
          Recent orders
        </h3>
        <p className="caption" style={{ margin: '0 0 10px' }}>
          {historyDays != null
            ? `Orders from the last ${historyDays} day${historyDays === 1 ? '' : 's'}.`
            : 'Your most recent orders.'}
        </p>
        {!historyOrders.length ? (
          <p className="caption" style={{ margin: 0 }}>
            {historyDays != null
              ? `No orders in the last ${historyDays} day${historyDays === 1 ? '' : 's'}.`
              : 'No recent orders.'}
          </p>
        ) : (
          <div className="orderHistoryList">
            {historyOrders.map((order) => {
              const placed = new Date(order.placedAt);
              const when = Number.isNaN(placed.getTime())
                ? order.placedAt
                : placed.toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });
              const collectedAt = order.completedAt
                ? new Date(order.completedAt)
                : null;
              const collectedLabel =
                collectedAt && !Number.isNaN(collectedAt.getTime())
                  ? collectedAt.toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : null;
              const linePreview = order.lines
                .slice(0, 2)
                .map(
                  (l) =>
                    `${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ''} × ${l.qty}`,
                )
                .join(' · ');
              const more =
                order.lines.length > 2
                  ? ` +${order.lines.length - 2} more`
                  : '';
              return (
                <article key={order.id} className="orderHistoryCard">
                  <div className="orderHistoryHead">
                    <strong>{when}</strong>
                    <span className="orderHistoryTotal">
                      {formatRm(order.totalCents)}
                    </span>
                  </div>
                  {order.status === ORDER_STATUS.CANCELLED ||
                  order.status === ORDER_STATUS.REFUNDED ? (
                    <p className="orderHistoryCancelled">
                      {orderStatusLabel(order.status, order.fulfilmentType)}
                      {order.cancelReason ? ` — ${order.cancelReason}` : ''}
                    </p>
                  ) : collectedLabel ? (
                    <p className="caption" style={{ margin: '4px 0 0' }}>
                      {order.fulfilmentType === 'DELIVERY'
                        ? 'Delivered'
                        : 'Collected'}{' '}
                      {collectedLabel}
                    </p>
                  ) : null}
                  <p className="caption orderHistoryLines">
                    {linePreview}
                    {more}
                  </p>
                  {order.fulfillmentSummary.length ? (
                    <p className="caption orderHistoryFulfill">
                      {order.fulfillmentSummary.join(' · ')}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="ghost orderHistoryReorder"
                    onClick={() => handleReorder(order)}
                  >
                    Reorder
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
