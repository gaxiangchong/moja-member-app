import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  completeQueueOrder,
  fetchQueueOrderDetail,
  fetchQueueOrders,
  type QueueOrderDetail,
  type QueueOrderSummary,
} from './api';
import { ScanCollectModal } from './ScanCollectModal';

const STORAGE_KEY = 'moja_ops_api_key';
const STORAGE_BASE = 'moja_ops_api_base';
const defaultBase =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3153';

/** localStorage is shared across tabs on the same origin — required for detail windows. */
function readStoredKey(): string {
  try {
    return (
      localStorage.getItem(STORAGE_KEY)?.trim() ||
      (import.meta.env.VITE_OPS_API_KEY as string | undefined)?.trim() ||
      ''
    );
  } catch {
    return (import.meta.env.VITE_OPS_API_KEY as string | undefined)?.trim() || '';
  }
}

function readStoredBase(): string {
  try {
    return (
      localStorage.getItem(STORAGE_BASE)?.trim() ||
      (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
      defaultBase
    );
  } catch {
    return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || defaultBase;
  }
}

/** Self pickup lines from ShopFlow: `Date: yyyy-mm-dd`, `Time: hh:mm`. */
function pickupCalendarDay(summary: string[]): string | null {
  for (const line of summary) {
    const m = line.match(/Date:\s*(\d{4}-\d{2}-\d{2})/i);
    if (m) return m[1];
  }
  return null;
}

/** Sort key: pickup slot when parseable; otherwise order placed time. */
function pickupSortTimestamp(order: QueueOrderSummary): number {
  const summary = order.fulfillmentSummary;
  let dateStr: string | null = null;
  let timeStr: string | null = null;
  for (const line of summary) {
    const dm = line.match(/Date:\s*(\d{4}-\d{2}-\d{2})/i);
    if (dm) dateStr = dm[1];
    const tm = line.match(/Time:\s*(\d{1,2}:\d{2})/i);
    if (tm) timeStr = tm[1];
  }
  if (dateStr && timeStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    if (Number.isFinite(y) && Number.isFinite(h)) {
      const t = new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
      if (!Number.isNaN(t)) return t;
    }
  }
  if (dateStr) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const t = new Date(y, mo - 1, d, 12, 0, 0, 0).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return new Date(order.placedAt).getTime();
}

/** Calendar day used for From/To filter: pickup date, else placed date (yyyy-mm-dd). */
function calendarDayForPickupFilter(order: QueueOrderSummary): string {
  const p = pickupCalendarDay(order.fulfillmentSummary);
  if (p) return p;
  return order.placedAt.slice(0, 10);
}

function filterByPickupCalendarDay(
  list: QueueOrderSummary[],
  dateFrom: string,
  dateTo: string,
): QueueOrderSummary[] {
  const df = dateFrom.trim();
  const dt = dateTo.trim();
  if (!df && !dt) return list;
  const lo = df || '0000-01-01';
  const hi = dt || '9999-12-31';
  return list.filter((o) => {
    const day = calendarDayForPickupFilter(o);
    return day >= lo && day <= hi;
  });
}

function sortByPickupSlot(
  list: QueueOrderSummary[],
  dir: 'asc' | 'desc',
): QueueOrderSummary[] {
  return [...list].sort((a, b) => {
    const ta = pickupSortTimestamp(a);
    const tb = pickupSortTimestamp(b);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return dir === 'desc' ? tb - ta : ta - tb;
  });
}

/** Must match client-web `IN_STORE_FULFILLMENT_HEAD`. */
const IN_STORE_EXPEDITE_HEAD = 'In store · prepare now';

function isExpediteOrder(order: QueueOrderSummary): boolean {
  return order.fulfillmentSummary.some(
    (line) => line.trim().toLowerCase() === IN_STORE_EXPEDITE_HEAD.toLowerCase(),
  );
}

function shopTimeZone(): string {
  const raw = import.meta.env.VITE_SHOP_TIMEZONE as string | undefined;
  return raw?.trim() || 'Asia/Kuala_Lumpur';
}

function shopCalendarYmd(now: Date = new Date()): string {
  const tz = shopTimeZone();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !mo || !d) return now.toISOString().slice(0, 10);
  return `${y}-${mo}-${d}`;
}

function filterPendingTodayShop(
  list: QueueOrderSummary[],
  todayOnly: boolean,
): QueueOrderSummary[] {
  if (!todayOnly) return list;
  const today = shopCalendarYmd();
  return list.filter((o) => {
    if (isExpediteOrder(o)) return true;
    const pickupDay = pickupCalendarDay(o.fulfillmentSummary);
    if (pickupDay) return pickupDay === today;
    return calendarDayForPickupFilter(o) === today;
  });
}

function splitExpediteScheduled(list: QueueOrderSummary[]): {
  expedite: QueueOrderSummary[];
  scheduled: QueueOrderSummary[];
} {
  const expedite: QueueOrderSummary[] = [];
  const scheduled: QueueOrderSummary[] = [];
  for (const o of list) {
    (isExpediteOrder(o) ? expedite : scheduled).push(o);
  }
  return { expedite, scheduled };
}

function detailIdFromSearch(): string | null {
  return new URLSearchParams(window.location.search).get('detail');
}

function formatRm(cents: number): string {
  return `RM ${(Number(cents || 0) / 100).toFixed(2)}`;
}

function placedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortOrderId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function OrderDetailView({ orderId }: { orderId: string }) {
  const [apiKey, setApiKey] = useState(() => readStoredKey());
  const [apiBase, setApiBase] = useState(() => readStoredBase());
  const [unlockKey, setUnlockKey] = useState('');
  const [unlockBase, setUnlockBase] = useState(() => readStoredBase());
  const [data, setData] = useState<QueueOrderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    const k = apiKey.trim();
    const b = apiBase.trim() || defaultBase;
    if (!k) return;
    setErr(null);
    setData(null);
    fetchQueueOrderDetail(k, orderId, b)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'));
  }, [apiKey, apiBase, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const onUnlock = (e: FormEvent) => {
    e.preventDefault();
    const k = unlockKey.trim();
    const b = unlockBase.trim() || defaultBase;
    if (!k) return;
    try {
      localStorage.setItem(STORAGE_KEY, k);
      localStorage.setItem(STORAGE_BASE, b);
    } catch {
      /* private mode */
    }
    setApiKey(k);
    setApiBase(b);
  };

  if (!apiKey.trim()) {
    return (
      <div className="connectCard" style={{ marginTop: 24 }}>
        <h1>Order detail</h1>
        <p className="muted" style={{ lineHeight: 1.5 }}>
          This window cannot read your ops key (private browsing, or first visit here only). Paste
          the same key as <code>OPS_QUEUE_API_KEY</code> on the server, or use the main queue once
          on this browser so the key is saved.
        </p>
        <form onSubmit={onUnlock}>
          <label htmlFor="unlockBase">API base URL</label>
          <input
            id="unlockBase"
            value={unlockBase}
            onChange={(ev) => setUnlockBase(ev.target.value)}
            autoComplete="off"
          />
          <label htmlFor="unlockKey">Ops API key</label>
          <input
            id="unlockKey"
            type="password"
            value={unlockKey}
            onChange={(ev) => setUnlockKey(ev.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btnPrimary" style={{ marginTop: 16, width: '100%' }}>
            Unlock &amp; load order
          </button>
        </form>
        <button type="button" className="ghostBtn" style={{ marginTop: 14 }} onClick={() => window.close()}>
          Close window
        </button>
      </div>
    );
  }

  if (err) {
    return (
      <div className="detailShell">
        <p className="err">{err}</p>
        <p className="muted">Check the API key and that this order id exists.</p>
        <div className="btnRow" style={{ marginTop: 12 }}>
          <button type="button" className="btnGhost" onClick={() => load()}>
            Retry
          </button>
          <button type="button" className="ghostBtn" onClick={() => window.close()}>
            Close window
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="detailShell">
        <p className="muted">Loading order…</p>
      </div>
    );
  }

  return (
    <div className="detailShell">
      <header className="detailHead">
        <div>
          <h1>Order {shortOrderId(data.id)}</h1>
          <p className="muted">
            Placed {placedLabel(data.placedAt)}
            {data.completedAt ? ` · Collected ${placedLabel(data.completedAt)}` : ''} · Status{' '}
            <strong>{data.status === 'completed' ? 'Collected' : data.status}</strong>
          </p>
        </div>
        <button type="button" className="ghostBtn" onClick={() => window.close()}>
          Close
        </button>
      </header>

      <div className="detailGrid">
        <div className="detailBlock">
          <h2>Customer</h2>
          <p className="mono">{data.customer.phoneE164}</p>
          <p>{data.customer.displayName?.trim() || '—'}</p>
        </div>
        <div className="detailBlock">
          <h2>Fulfillment</h2>
          {data.fulfillmentSummary.length ? (
            <ul>
              {data.fulfillmentSummary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No fulfillment notes on this order.</p>
          )}
        </div>
        <div className="detailBlock">
          <h2>Lines</h2>
          <table className="linesTable">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Each</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.name}
                    {l.variantLabel ? ` (${l.variantLabel})` : ''}
                  </td>
                  <td>{l.qty}</td>
                  <td>{formatRm(l.unitPriceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Total {formatRm(data.totalCents)}</p>
        </div>
        <div className="detailBlock">
          <h2>Internal</h2>
          <p className="muted" style={{ margin: 0 }}>
            Order id (full)
          </p>
          <p className="mono" style={{ margin: '6px 0 0' }}>
            {data.id}
          </p>
        </div>
      </div>
    </div>
  );
}

function openOrderDetailWindow(orderId: string): void {
  const u = new URL(window.location.href);
  u.searchParams.set('detail', orderId);
  // Do not use noopener: detail tab must share same origin localStorage as the queue tab.
  window.open(u.toString(), '_blank', 'width=800,height=960');
}

function OrderCard({
  order,
  pulse,
  busy,
  onDone,
  onOpenDetail,
}: {
  order: QueueOrderSummary;
  pulse: boolean;
  busy: boolean;
  onDone: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <article className={`orderCard${pulse ? ' orderCard--pulse' : ''}`}>
      <div className="orderCardHead">
        <div>
          <div className="idline">Order {shortOrderId(order.id)}</div>
          <div className="when">{placedLabel(order.placedAt)}</div>
        </div>
        <div className="muted" style={{ fontSize: '0.9rem' }}>
          {order.customerDisplayName?.trim() || 'Member'} · {order.customerPhoneMasked}
        </div>
      </div>

      {order.fulfillmentSummary.length > 0 ? (
        <div className="pickupBlock">
          <h3>Pickup / delivery</h3>
          <ul>
            {order.fulfillmentSummary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <table className="linesTable">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.id}>
              <td>
                {l.name}
                {l.variantLabel ? ` (${l.variantLabel})` : ''}
              </td>
              <td>{l.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="orderFoot">
        <span className="totalBadge">{formatRm(order.totalCents)}</span>
        <div className="btnRow">
          <button type="button" className="btnGhost" onClick={onOpenDetail}>
            Open detail (new window)
          </button>
          <button type="button" className="btnPrimary" disabled={busy} onClick={onDone}>
            {busy ? 'Saving…' : 'Collected'}
          </button>
        </div>
      </div>
    </article>
  );
}

export function App() {
  const initialDetail = detailIdFromSearch();
  const [detailId] = useState<string | null>(initialDetail);
  const [apiKey, setApiKey] = useState(() => readStoredKey());
  const [apiBase, setApiBase] = useState(() => readStoredBase());
  const [connectKey, setConnectKey] = useState(
    () => (import.meta.env.VITE_OPS_API_KEY as string | undefined)?.trim() ?? '',
  );
  const [connectBase, setConnectBase] = useState(() => readStoredBase());
  const [connectErr, setConnectErr] = useState<string | null>(null);

  const [rawPending, setRawPending] = useState<QueueOrderSummary[]>([]);
  const [rawHistory, setRawHistory] = useState<QueueOrderSummary[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortPickup, setSortPickup] = useState<'desc' | 'asc'>('asc');
  const [todayOnly, setTodayOnly] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [pollOk, setPollOk] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [pulseIds, setPulseIds] = useState<Set<string>>(() => new Set());
  const prevPendingRef = useRef<Set<string>>(new Set());

  const pendingSections = useMemo(() => {
    const f = filterByPickupCalendarDay(rawPending, dateFrom, dateTo);
    const g = filterPendingTodayShop(f, todayOnly);
    const { expedite, scheduled } = splitExpediteScheduled(g);
    return {
      expedite: sortByPickupSlot(expedite, sortPickup),
      scheduled: sortByPickupSlot(scheduled, sortPickup),
    };
  }, [rawPending, dateFrom, dateTo, sortPickup, todayOnly]);

  const displayPendingCount =
    pendingSections.expedite.length + pendingSections.scheduled.length;

  const displayHistory = useMemo(() => {
    const f = filterByPickupCalendarDay(rawHistory, dateFrom, dateTo);
    return sortByPickupSlot(f, sortPickup);
  }, [rawHistory, dateFrom, dateTo, sortPickup]);

  const saveSession = useCallback((key: string, base: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, key);
      localStorage.setItem(STORAGE_BASE, base);
    } catch {
      /* quota / private mode */
    }
    setApiKey(key);
    setApiBase(base);
  }, []);

  const poll = useCallback(async () => {
    if (!apiKey.trim()) return;
    try {
      const data = await fetchQueueOrders(apiKey.trim(), apiBase.trim() || defaultBase);
      setRawPending(data.pending);
      setRawHistory(data.history);
      setPollErr(null);
      setPollOk(true);
    } catch (e) {
      setPollErr(e instanceof Error ? e.message : 'Poll failed');
      setPollOk(false);
    }
  }, [apiKey, apiBase]);

  useEffect(() => {
    if (!apiKey.trim()) return;
    void poll();
    const t = window.setInterval(() => void poll(), 2500);
    return () => window.clearInterval(t);
  }, [apiKey, apiBase, poll]);

  useEffect(() => {
    const next = new Set(rawPending.map((p) => p.id));
    const prev = prevPendingRef.current;
    for (const id of next) {
      if (!prev.has(id)) {
        setPulseIds((s) => new Set(s).add(id));
        window.setTimeout(() => {
          setPulseIds((s) => {
            const c = new Set(s);
            c.delete(id);
            return c;
          });
        }, 14000);
      }
    }
    prevPendingRef.current = next;
  }, [rawPending]);

  const onConnect = (e: FormEvent) => {
    e.preventDefault();
    setConnectErr(null);
    const k = connectKey.trim();
    const b = connectBase.trim() || defaultBase;
    if (!k) {
      setConnectErr('Enter the ops API key from the server env OPS_QUEUE_API_KEY.');
      return;
    }
    fetchQueueOrders(k, b)
      .then(() => {
        saveSession(k, b);
        setConnectKey('');
      })
      .catch((err) => {
        setConnectErr(err instanceof Error ? err.message : 'Could not reach API');
      });
  };

  const onDisconnect = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_BASE);
    } catch {
      /* ignore */
    }
    setApiKey('');
    setRawPending([]);
    setRawHistory([]);
    setPollErr(null);
    setPollOk(false);
  };

  const onDone = (id: string) => {
    setCompletingId(id);
    completeQueueOrder(apiKey, id, apiBase.trim() || defaultBase)
      .then(() => void poll())
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : 'Could not mark order collected');
      })
      .finally(() => setCompletingId(null));
  };

  const onScanCollect = useCallback(
    async (orderId: string) => {
      await completeQueueOrder(apiKey, orderId, apiBase.trim() || defaultBase);
      await poll();
    },
    [apiKey, apiBase, poll],
  );

  if (detailId) {
    return <OrderDetailView orderId={detailId} />;
  }

  if (!apiKey.trim()) {
    return (
      <div className="connectCard">
        <h1>Operations — order queue</h1>
        <p className="muted" style={{ lineHeight: 1.5 }}>
          Enter the same secret configured on the API as <code>OPS_QUEUE_API_KEY</code>. For local
          dev you can also set <code>VITE_OPS_API_KEY</code> in <code>ops-queue-web/.env</code> (same
          value, prefixed with <code>VITE_</code> so Vite exposes it). Key is stored in{' '}
          <strong>localStorage</strong> so detail windows on this device can load orders.
        </p>
        <form onSubmit={onConnect}>
          <label htmlFor="base">API base URL</label>
          <input
            id="base"
            value={connectBase}
            onChange={(ev) => setConnectBase(ev.target.value)}
            placeholder="http://localhost:3153"
            autoComplete="off"
          />
          <label htmlFor="key">Ops API key</label>
          <input
            id="key"
            type="password"
            value={connectKey}
            onChange={(ev) => setConnectKey(ev.target.value)}
            placeholder="From OPS_QUEUE_API_KEY"
            autoComplete="off"
          />
          {connectErr ? <p className="err">{connectErr}</p> : null}
          <button type="submit" className="btnPrimary" style={{ marginTop: 18, width: '100%' }}>
            Connect
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="queueApp">
      <header className="topBar">
        <div>
          <h1>Order queue</h1>
          <div className={`livePill${pollOk ? ' ok' : ''}`}>
            <span className="dot" aria-hidden />
            {pollOk ? 'Live · polling every 2.5s' : 'Connecting…'}
          </div>
        </div>
        <div className="btnRow">
          <button type="button" className="btnGhost" onClick={() => setScanOpen(true)}>
            Scan QR
          </button>
          <button type="button" className="btnGhost" onClick={() => void poll()}>
            Refresh now
          </button>
          <button type="button" className="btnGhost" onClick={onDisconnect}>
            Change key
          </button>
        </div>
      </header>

      <ScanCollectModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onCollect={onScanCollect}
      />

      {pollErr ? (
        <p className="err" style={{ marginBottom: 16 }}>
          {pollErr}
        </p>
      ) : null}

      <section className="queueToolbar" aria-label="Filter and sort by pickup date">
        <div className="queueToolbarRow">
          <span className="queueToolbarLabel">Pickup date (self pickup) · sort by slot</span>
          <label className="queueToolbarField">
            <span>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(ev) => setDateFrom(ev.target.value)}
              aria-label="Filter from pickup date"
            />
          </label>
          <label className="queueToolbarField">
            <span>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(ev) => setDateTo(ev.target.value)}
              aria-label="Filter to pickup date"
            />
          </label>
          <label className="queueToolbarField">
            <span>Sort</span>
            <select
              value={sortPickup}
              onChange={(ev) => setSortPickup(ev.target.value === 'asc' ? 'asc' : 'desc')}
              aria-label="Sort by pickup slot"
            >
              <option value="asc">Soonest pickup first</option>
              <option value="desc">Latest pickup first</option>
            </select>
          </label>
          <label className="queueToolbarField queueToolbarCheck">
            <span>Today</span>
            <input
              type="checkbox"
              checked={todayOnly}
              onChange={(ev) => setTodayOnly(ev.target.checked)}
              aria-label="Show only today’s pickups plus all in-store expedite"
            />
          </label>
          <button
            type="button"
            className="btnGhost"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setSortPickup('asc');
              setTodayOnly(false);
            }}
          >
            Clear filters
          </button>
        </div>
        <p className="queueToolbarHint">
          Active: {displayPendingCount} of {rawPending.length} · History: {displayHistory.length} of{' '}
          {rawHistory.length}
          {todayOnly
            ? ` (today = ${shopCalendarYmd()} in ${shopTimeZone()}; in-store expedite always included)`
            : ''}
          {(dateFrom || dateTo) &&
            ' · Range filter uses pickup date from the card; delivery-only orders use placed date for the day'}
        </p>
      </section>

      <div className="layout">
        <aside className="sidePanel">
          <h2>Recent collected</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 12 }}>
            Click a row to open full transaction data in a new window.
          </p>
          <div className="historyList">
            {displayHistory.length === 0 ? (
              <p className="muted" style={{ padding: 8 }}>
                {rawHistory.length === 0 ? 'No collected orders yet.' : 'No rows match this date filter.'}
              </p>
            ) : (
              displayHistory.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="historyRow"
                  onClick={() => openOrderDetailWindow(h.id)}
                >
                  <strong>
                    {shortOrderId(h.id)} · {formatRm(h.totalCents)}
                  </strong>
                  <div className="meta">
                    {placedLabel(h.placedAt)} · {h.customerPhoneMasked}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="mainColumn">
          {displayPendingCount === 0 ? (
            <div className="emptyQueue">
              <p style={{ margin: 0, fontSize: '1.05rem' }}>
                {rawPending.length === 0
                  ? 'No active orders in the queue.'
                  : 'No active orders match the current filters.'}
              </p>
              <p className="muted" style={{ margin: '10px 0 0' }}>
                New member purchases appear here as cards. Mark <strong>Collected</strong> when the
                member shows their QR or confirms pickup.
              </p>
            </div>
          ) : (
            <>
              {pendingSections.expedite.length > 0 ? (
                <>
                  <h2 className="queueSectionTitle">Expedite · in store now</h2>
                  {pendingSections.expedite.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      pulse={pulseIds.has(o.id)}
                      busy={completingId === o.id}
                      onDone={() => onDone(o.id)}
                      onOpenDetail={() => openOrderDetailWindow(o.id)}
                    />
                  ))}
                </>
              ) : null}
              {pendingSections.scheduled.length > 0 ? (
                <>
                  <h2 className="queueSectionTitle">Scheduled · pickup / delivery</h2>
                  {pendingSections.scheduled.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      pulse={pulseIds.has(o.id)}
                      busy={completingId === o.id}
                      onDone={() => onDone(o.id)}
                      onOpenDetail={() => openOrderDetailWindow(o.id)}
                    />
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
