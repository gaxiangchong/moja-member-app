import { useCallback, useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { fetchMemberOrders, type MemberOrderRow } from '../api';
import { formatOrderPickupLabel } from '../lib/orderRef';
import { formatRm } from '../shop/data/mockCatalog';
import { useOrderHistoryStore, type PastOrder } from '../shop/store/useOrderHistoryStore';
import { useShopStore } from '../shop/store/useShopStore';

function mapRowToPastOrder(row: MemberOrderRow): PastOrder {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    placedAt: row.placedAt,
    completedAt: row.completedAt,
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
        <img src={src} alt={`Order ${label} QR`} width={200} height={200} className="orderQrImg" />
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

export function OrdersTab({ active, onGoToShop }: { active: boolean; onGoToShop: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const orders = useOrderHistoryStore((s) => s.orders);
  const setOrdersFromApi = useOrderHistoryStore((s) => s.setOrdersFromApi);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { orders: rows } = await fetchMemberOrders(60);
      setOrdersFromApi(rows.map(mapRowToPastOrder));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load orders');
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

  const activeOrders = orders.filter((o) => (o.status ?? 'placed') === 'placed');
  const historyOrders = orders
    .filter((o) => o.status === 'completed')
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
        <button type="button" className="textAction" onClick={() => void load()} disabled={loading}>
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

      <section className="pmCard">
        <h3 className="shopSectionTitle" style={{ marginTop: 0 }}>
          Active · show QR at pickup
        </h3>
        {!activeOrders.length ? (
          <p className="caption" style={{ margin: 0 }}>
            No open orders. Place one from Shop — your QR appears here until the shop marks it collected.
          </p>
        ) : (
          <div className="ordersActiveList">
            {activeOrders.map((order) => {
              const placed = new Date(order.placedAt);
              const when = Number.isNaN(placed.getTime())
                ? order.placedAt
                : placed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
              return (
                <article key={order.id} className="orderActiveCard">
                  <div className="orderActiveHead">
                    <div>
                      <strong>{when}</strong>
                      <span className="orderHistoryTotal">{formatRm(order.totalCents)}</span>
                    </div>
                  </div>
                  {order.orderNumber != null ? (
                    <OrderQrBlock orderNumber={order.orderNumber} />
                  ) : (
                    <p className="caption" style={{ margin: 0 }}>
                      Order number not on this device yet — tap Refresh.
                    </p>
                  )}
                  {order.fulfillmentSummary.length ? (
                    <p className="caption orderHistoryFulfill">{order.fulfillmentSummary.join(' · ')}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="pmCard">
        <h3 className="shopSectionTitle" style={{ marginTop: 0 }}>
          History · collected
        </h3>
        {!historyOrders.length ? (
          <p className="caption" style={{ margin: 0 }}>
            Collected orders will appear here.
          </p>
        ) : (
          <div className="orderHistoryList">
            {historyOrders.map((order) => {
              const placed = new Date(order.placedAt);
              const when = Number.isNaN(placed.getTime())
                ? order.placedAt
                : placed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
              const collectedAt = order.completedAt
                ? new Date(order.completedAt)
                : null;
              const collectedLabel =
                collectedAt && !Number.isNaN(collectedAt.getTime())
                  ? collectedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                  : null;
              const linePreview = order.lines
                .slice(0, 2)
                .map((l) => `${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ''} × ${l.qty}`)
                .join(' · ');
              const more = order.lines.length > 2 ? ` +${order.lines.length - 2} more` : '';
              return (
                <article key={order.id} className="orderHistoryCard">
                  <div className="orderHistoryHead">
                    <strong>{when}</strong>
                    <span className="orderHistoryTotal">{formatRm(order.totalCents)}</span>
                  </div>
                  {collectedLabel ? (
                    <p className="caption" style={{ margin: '4px 0 0' }}>
                      Collected {collectedLabel}
                    </p>
                  ) : null}
                  <p className="caption orderHistoryLines">
                    {linePreview}
                    {more}
                  </p>
                  {order.fulfillmentSummary.length ? (
                    <p className="caption orderHistoryFulfill">{order.fulfillmentSummary.join(' · ')}</p>
                  ) : null}
                  <button type="button" className="ghost orderHistoryReorder" onClick={() => handleReorder(order)}>
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
