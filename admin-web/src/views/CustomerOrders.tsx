import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCommerceOrder,
  fetchCommerceOrders,
  fetchOrdersSummary,
  setOrderStatus,
  type AdminOrder,
  type AdminOrderDetail,
  type OrderKind,
  type OrderTab,
  type OrdersSummary,
} from '../api';
import { formatPhone, openMemberProfile } from '../memberNav';

const SHOP_TZ = 'Asia/Kuala_Lumpur';

function formatRm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** yyyy-mm-dd in the shop's timezone. */
function shopYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TZ }).format(d);
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Period = 'today' | 'week' | 'month' | 'custom';

/** From/to (inclusive) for a period button; the week starts on Monday. */
function periodRange(period: Period, custom: { from: string; to: string }): { from?: string; to?: string } {
  const today = shopYmd();
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { from: addDays(today, -((dow + 6) % 7)), to: today };
  }
  if (period === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: custom.from || undefined, to: custom.to || undefined };
}

const PERIOD_LABEL: Record<Period, string> = {
  today: 'today',
  week: 'this week',
  month: 'this month',
  custom: 'in this period',
};

const TABS: { id: OrderTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'to_make', label: 'To make' },
  { id: 'ready', label: 'Ready' },
  { id: 'collected', label: 'Collected' },
  { id: 'awaiting_payment', label: 'Awaiting payment' },
  { id: 'cancelled', label: 'Cancelled & refunded' },
];

const KIND_LABEL: Record<OrderKind, string> = {
  in_store: 'In store',
  pickup: 'Self pickup',
  delivery: 'Local delivery',
  parcel: 'Parcel',
};

const STATUS: Record<string, { label: string; tone: string }> = {
  pending_payment: { label: 'Awaiting payment', tone: 'pay' },
  placed: { label: 'New', tone: 'new' },
  preparing: { label: 'Preparing', tone: 'prep' },
  ready: { label: 'Ready', tone: 'ready' },
  completed: { label: 'Collected', tone: 'done' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  refunded: { label: 'Refunded', tone: 'bad' },
};

function StatusPill({ order }: { order: Pick<AdminOrder, 'status' | 'kind'> }) {
  const s = STATUS[order.status] ?? { label: order.status, tone: 'new' };
  const label = order.status === 'completed' && order.kind === 'parcel' ? 'Posted' : s.label;
  return <span className={`orderPill orderPill--${s.tone}`}>{label}</span>;
}

/** "5 min ago", "2 h ago", "yesterday", "3 days ago", or a date. */
function ago(iso: string, now = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** When the order is due: "Wed 4 Nov, 11:00 AM", "Today, from 3:40 PM", or the parcel promise. */
function pickupLabel(o: AdminOrder): string {
  if (o.kind === 'parcel') return 'Post within 2–5 days';
  if (o.kind === 'in_store' && !o.scheduledDate) {
    const from = o.fulfillmentSummary.find((l) => /^collect today from/i.test(l));
    const day = shopYmd(new Date(o.placedAt)) === shopYmd() ? 'Today' : new Date(o.placedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return from ? `${day}, ${from.replace(/^collect today /i, '')}` : day;
  }
  if (!o.scheduledDate) return '—';
  const d = new Date(`${o.scheduledDate}T00:00:00Z`);
  const day =
    o.scheduledDate === shopYmd()
      ? 'Today'
      : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return o.scheduledSlot ? `${day}, ${clock12(o.scheduledSlot)}` : day;
}

function itemsLabel(o: AdminOrder): string {
  const parts = o.lines
    .filter((l) => !l.productId.startsWith('addon-'))
    .map((l) => `${l.name}${l.variantLabel ? ` ${l.variantLabel}` : ''}${l.qty > 1 ? ` ×${l.qty}` : ''}`);
  const extras = o.lines.filter((l) => l.productId.startsWith('addon-')).length;
  return parts.join(', ') + (extras ? ` + ${extras} extra${extras > 1 ? 's' : ''}` : '');
}

function downloadCsv(rows: AdminOrder[]): void {
  // A leading ' stops Excel running a customer's name as a formula.
  const esc = (v: string | number) => {
    const text = String(v);
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [
    ['Order', 'Placed', 'Status', 'Type', 'Pickup', 'Customer', 'Phone', 'Items', 'Total (RM)'],
    ...rows.map((o) => [
      o.orderNumber,
      o.placedAt,
      STATUS[o.status]?.label ?? o.status,
      o.kind ? KIND_LABEL[o.kind] : '',
      pickupLabel(o),
      o.customerDisplayName ?? '',
      o.customerPhone ?? o.customerPhoneMasked,
      itemsLabel(o),
      (o.totalCents / 100).toFixed(2),
    ]),
  ].map((r) => r.map(esc).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders-${shopYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CustomerOrders() {
  const [period, setPeriod] = useState<Period>('week');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [tab, setTab] = useState<OrderTab>('all');
  const [kind, setKind] = useState<OrderKind | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const range = useMemo(() => periodRange(period, custom), [period, custom]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before each fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    const filters = { ...range, kind: kind || undefined, search: search || undefined };
    Promise.all([
      fetchCommerceOrders({ ...filters, tab, dayZone: 'shop', sort: 'placed_desc', limit: 200 }),
      fetchOrdersSummary(filters),
    ])
      .then(([list, sum]) => {
        if (cancelled) return;
        setOrders(list.orders);
        setTotal(list.total ?? list.orders.length);
        setSummary(sum);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load orders');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, tab, kind, search, reloadKey]);

  const change =
    summary && summary.previousPaidCents != null && summary.previousPaidCents > 0
      ? Math.round(((summary.paidCents - summary.previousPaidCents) / summary.previousPaidCents) * 100)
      : null;

  const comparedDays =
    range.from && range.to
      ? Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1
      : 0;

  return (
    <div className="ordersView">
      <div className="ordersHead">
        <div className="segmented" role="group" aria-label="Period">
          {(['today', 'week', 'month', 'custom'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              className={period === p ? 'segmentedItem segmentedItem--on' : 'segmentedItem'}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'Custom'}
            </button>
          ))}
        </div>
        {period === 'custom' ? (
          <span className="ordersCustom">
            <input type="date" aria-label="From" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <span>to</span>
            <input type="date" aria-label="To" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </span>
        ) : null}
        <span className="gridToolbarSpacer" />
        <button type="button" className="toolbarButton" disabled={!orders?.length} onClick={() => orders && downloadCsv(orders)}>
          Export CSV
        </button>
      </div>

      {summary ? (
        <section className="statStrip" aria-label="Totals">
          <div>
            <b>{formatRm(summary.paidCents)}</b>
            <span>
              paid {PERIOD_LABEL[period]}
              {change != null ? (
                <em className={change >= 0 ? 'statUp' : 'statDown'}>
                  {change >= 0 ? '+' : ''}
                  {change}% on the {comparedDays === 1 ? 'day' : `${comparedDays} days`} before
                </em>
              ) : null}
            </span>
          </div>
          <div>
            <b>{summary.paidOrders}</b>
            <span>paid orders</span>
          </div>
          <div>
            <b>{formatRm(summary.averageCents)}</b>
            <span>average order</span>
          </div>
          <div>
            <b>{summary.openOrders}</b>
            <span>still to make or collect</span>
          </div>
        </section>
      ) : null}

      <div className="tabRow" role="tablist" aria-label="Order status">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tabItem${tab === t.id ? ' tabItem--on' : ''}${t.id === 'awaiting_payment' && (summary?.tabs[t.id] ?? 0) > 0 ? ' tabItem--warn' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <b>{summary?.tabs[t.id] ?? '·'}</b>
          </button>
        ))}
      </div>

      <div className="gridToolbar">
        <input
          type="search"
          className="toolbarInput gridToolbarSearch"
          placeholder="Order number, customer or cake"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search orders"
        />
        <select className="gridFilterInput" value={kind} onChange={(e) => setKind(e.target.value as OrderKind | '')} aria-label="Order type">
          <option value="">All types</option>
          {(Object.keys(KIND_LABEL) as OrderKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="viewError">{error}</p> : null}

      <section className="panel ordersTablePanel">
        <table className="dataTable ordersTable">
          <thead>
            <tr>
              <th>Order</th>
              <th>Pickup</th>
              <th>Customer</th>
              <th>Items</th>
              <th className="gridNumeric">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr
                key={o.id}
                className={`dataTableRowClickable${openId === o.id ? ' rowSelected' : ''}`}
                onClick={() => setOpenId(o.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setOpenId(o.id);
                }}
                tabIndex={0}
              >
                <td>
                  <strong>#{o.orderNumber}</strong>
                  <span className="cellSub">{ago(o.placedAt)}</span>
                </td>
                <td>
                  <strong>{pickupLabel(o)}</strong>
                  <span className="cellSub">{o.kind ? KIND_LABEL[o.kind] : ''}</span>
                </td>
                <td>
                  <strong>{o.customerDisplayName?.trim() || 'No name yet'}</strong>
                  <span className="cellSub">{o.customerPhone ? formatPhone(o.customerPhone) : o.customerPhoneMasked}</span>
                </td>
                <td className="ordersItems">{itemsLabel(o)}</td>
                <td className="gridNumeric">{formatRm(o.totalCents)}</td>
                <td>
                  <StatusPill order={o} />
                </td>
              </tr>
            ))}
            {!loading && orders && orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="dataTableEmpty">
                  No orders {PERIOD_LABEL[period]}
                  {tab !== 'all' || kind || search ? ' match these filters' : ''}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="tableFoot">
          {loading ? 'Loading…' : orders ? `Showing ${orders.length} of ${total.toLocaleString()}` : ''}
        </p>
      </section>

      {openId ? (
        <OrderPanel
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}

const CHANNEL_LABEL: Record<string, string> = {
  CREDITS: 'wallet credits',
  FPX: 'FPX online banking',
  CARDS: 'card',
  CARD: 'card',
  TOUCHNGO: "Touch 'n Go eWallet",
  GRABPAY: 'GrabPay',
  SHOPEEPAY: 'ShopeePay',
  BOOST: 'Boost',
  DUITNOW_QR: 'DuitNow QR',
};

function channelLabel(code: string): string {
  const key = code.toUpperCase();
  for (const [k, v] of Object.entries(CHANNEL_LABEL)) if (key.includes(k)) return v;
  return code.replace(/_/g, ' ').toLowerCase();
}

function when(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** The order side panel: progress, items, payment and the next step. */
function OrderPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetchCommerceOrder(id)
      .then(setOrder)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the order'));
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before loading another order
    setOrder(null);
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const move = async (status: 'preparing' | 'ready' | 'completed' | 'cancelled') => {
    let reason: string | undefined;
    if (status === 'cancelled') {
      const online = order && order.paidWithCreditsCents < order.totalCents && order.status !== 'pending_payment';
      const r = window.prompt(
        `${online ? 'Card and online payments are NOT refunded automatically: refund it in Xendit afterwards. Credits and reward points go back on their own.\n\n' : ''}Why is this order cancelled? The member sees this.`,
      );
      if (r === null) return;
      reason = r.trim() || undefined;
    }
    setBusy(true);
    setError(null);
    try {
      await setOrderStatus(id, status, reason);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the order');
    } finally {
      setBusy(false);
    }
  };

  const o = order;
  const next =
    o?.status === 'placed'
      ? { status: 'preparing' as const, label: 'Start preparing' }
      : o?.status === 'preparing'
        ? { status: 'ready' as const, label: 'Mark ready' }
        : o?.status === 'ready'
          ? { status: 'completed' as const, label: o.kind === 'parcel' ? 'Mark posted' : 'Mark collected' }
          : null;
  const canCancel = o ? ['placed', 'preparing', 'ready'].includes(o.status) : false;
  const phoneDigits = o?.customerPhone?.replace(/\D/g, '') ?? '';

  const steps = o
    ? [
        { label: o.payment ? `Paid by ${channelLabel(o.payment.channel)}` : 'Placed', at: o.payment?.at ?? o.placedAt, done: o.status !== 'pending_payment' },
        { label: 'Preparing', at: o.preparingAt, done: Boolean(o.preparingAt) },
        { label: o.kind === 'parcel' ? 'Packed' : 'Ready', at: o.readyAt, done: Boolean(o.readyAt) },
        { label: o.kind === 'parcel' ? 'Posted' : 'Collected', at: o.completedAt, done: Boolean(o.completedAt) },
      ]
    : [];
  const nowIndex = steps.findIndex((s) => !s.done);

  return (
    <aside className="sidePanel" role="dialog" aria-modal="false" aria-labelledby="order-panel-title">
      <header className="sidePanelHead">
        <div>
          <h2 id="order-panel-title">Order #{o?.orderNumber ?? '…'}</h2>
          {o ? (
            <>
              <p>
                {o.kind ? KIND_LABEL[o.kind] : ''} · <strong>{pickupLabel(o)}</strong>
              </p>
              <p>
                {o.customerDisplayName?.trim() || 'No name yet'} · {o.customerPhone ? formatPhone(o.customerPhone) : ''} ·{' '}
                {o.customerId ? (
                  <button type="button" className="linkButton" onClick={() => openMemberProfile(o.customerId!)}>
                    View member
                  </button>
                ) : null}
              </p>
            </>
          ) : null}
        </div>
        <button type="button" className="sidePanelClose" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      {o ? (
        <div className="sidePanelActions">
          {next ? (
            <button type="button" className="toolbarButton toolbarButton--primary" disabled={busy} onClick={() => void move(next.status)}>
              {next.label}
            </button>
          ) : null}
          {phoneDigits ? (
            <a className="toolbarButton" href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          ) : null}
          {canCancel ? (
            <button type="button" className="toolbarButton" disabled={busy} onClick={() => void move('cancelled')}>
              Cancel order
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="sidePanelBody">
        {error ? <p className="viewError">{error}</p> : null}
        {!o && !error ? <p className="viewMuted">Loading…</p> : null}
        {o ? (
          <>
            {o.status === 'cancelled' || o.status === 'refunded' ? (
              <p className="panelNote panelNote--bad">
                {o.status === 'refunded' ? 'Refunded' : 'Cancelled'} {when(o.cancelledAt)}
                {o.cancelReason ? ` · ${o.cancelReason}` : ''}
              </p>
            ) : o.status === 'pending_payment' ? (
              <p className="panelNote">Not paid yet. Unpaid orders are cancelled automatically after 30 minutes.</p>
            ) : (
              <section>
                <h3>Progress</h3>
                <ol className="timeline">
                  {steps.map((s, i) => (
                    <li key={s.label} className={s.done ? 'timelineDone' : i === nowIndex ? 'timelineNow' : ''}>
                      <span>{s.label}</span>
                      <small>{s.done ? when(s.at) : '—'}</small>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section>
              <h3>Items</h3>
              <ul className="panelList">
                {o.lines.map((l) => (
                  <li key={l.id}>
                    <b>{l.qty} ×</b>
                    <span>
                      {l.name}
                      {l.variantLabel ? <small>{l.variantLabel}</small> : null}
                    </span>
                    <span className="gridNumeric">{l.unitPriceCents === 0 ? 'Free' : formatRm(l.unitPriceCents * l.qty)}</span>
                  </li>
                ))}
                {o.earlyOrderDiscountCents > 0 ? (
                  <li>
                    <b />
                    <span>Early-order discount</span>
                    <span className="gridNumeric">−{formatRm(o.earlyOrderDiscountCents)}</span>
                  </li>
                ) : null}
                {o.deliveryFeeCents > 0 ? (
                  <li>
                    <b />
                    <span>Delivery</span>
                    <span className="gridNumeric">{formatRm(o.deliveryFeeCents)}</span>
                  </li>
                ) : null}
                <li className="panelListTotal">
                  <b />
                  <span>Total {o.status === 'pending_payment' ? 'due' : 'paid'}</span>
                  <span className="gridNumeric">{formatRm(o.totalCents)}</span>
                </li>
              </ul>
              {o.rewardTitle ? (
                <p className="viewMuted">
                  Reward used: {o.rewardTitle} ({o.rewardPointsSpent.toLocaleString()} points)
                </p>
              ) : null}
            </section>

            {o.delivery ? (
              <section>
                <h3>{o.kind === 'parcel' ? 'Ship to' : 'Deliver to'}</h3>
                <p className="panelText">
                  {o.delivery.address}
                  <br />
                  {o.delivery.contactName} · {o.delivery.contactPhone}
                </p>
              </section>
            ) : null}

            <section>
              <h3>Payment and points</h3>
              <dl className="panelKv">
                <dt>Paid with</dt>
                <dd>
                  {o.paidWithCreditsCents > 0 && o.paidWithCreditsCents < o.totalCents
                    ? `${formatRm(o.paidWithCreditsCents)} credits + ${o.payment ? channelLabel(o.payment.channel) : 'online'}`
                    : o.payment
                      ? channelLabel(o.payment.channel)
                      : '—'}
                </dd>
                <dt>Points earned</dt>
                <dd>{o.pointsEarned > 0 ? `+${o.pointsEarned.toLocaleString()}` : '—'}</dd>
                <dt>In SalesPlay</dt>
                <dd>{o.salesplay ? `Yes · ${when(o.salesplay.at)}` : 'Not sent'}</dd>
              </dl>
            </section>
          </>
        ) : null}
      </div>
    </aside>
  );
}
