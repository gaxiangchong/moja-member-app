import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  completeQueueOrder,
  fetchQueueOrderDetail,
  fetchQueueAlerts,
  fetchQueueOrders,
  type QueueOrderDetail,
  setQueueOrderStatus,
  type QueueOrderSummary,
  type StaffEmailStatus,
} from './api';
import { OpsLoginScreen } from './OpsLoginScreen';
import { defaultBase, readStoredBase, readStoredKey, STORAGE_BASE, STORAGE_KEY } from './opsSession';
import { useOpsAuth } from './useOpsAuth';
import {
  desktopNotificationsSupported,
  installAudioUnlock,
  playChime,
  requestDesktopNotifications,
  showDesktopNotification,
  soundBlocked,
} from './newOrderAlert';
import { formatOrderPickupLabel } from './orderRef';

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

/** yyyy-mm-dd in shop TZ for an instant (e.g. when the order was collected). */
function shopDateFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tz = shopTimeZone();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!y || !mo || !day) return iso.slice(0, 10);
  return `${y}-${mo}-${day}`;
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

function OrderDetailView({
  orderId,
  onDismiss,
}: {
  orderId: string;
  /** When set (e.g. in-app modal), replaces window.close(). */
  onDismiss?: () => void;
}) {
  const [apiKey, setApiKey] = useState(() => readStoredKey());
  const [apiBase, setApiBase] = useState(() => readStoredBase());
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

  const detailShellClass = `detailShell${onDismiss ? ' detailShell--embedded' : ''}`;

  if (!apiKey.trim()) {
    return (
      <OpsLoginScreen
        title="Order detail"
        lead="Sign in with your admin email and password — the same account as the admin dashboard."
        onSubmit={async (key, base) => {
          await fetchQueueOrderDetail(key, orderId, base);
          try {
            localStorage.setItem(STORAGE_KEY, key);
            localStorage.setItem(STORAGE_BASE, base);
          } catch {
            /* private mode */
          }
          setApiKey(key);
          setApiBase(base);
        }}
        footer={
          <button
            type="button"
            className="ghostBtn"
            style={{ marginTop: 14 }}
            onClick={() => (onDismiss ? onDismiss() : window.close())}
          >
            {onDismiss ? 'Close' : 'Close window'}
          </button>
        }
      />
    );
  }

  if (err) {
    return (
      <div className={detailShellClass}>
        <p className="err">{err}</p>
        <p className="muted">Check the API key and that this order id exists.</p>
        <div className="btnRow" style={{ marginTop: 12 }}>
          <button type="button" className="btnGhost" onClick={() => load()}>
            Retry
          </button>
          <button type="button" className="ghostBtn" onClick={() => (onDismiss ? onDismiss() : window.close())}>
            {onDismiss ? 'Close' : 'Close window'}
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={detailShellClass}>
        <p className="muted">Loading order…</p>
      </div>
    );
  }

  return (
    <div className={detailShellClass}>
      <header className="detailHead">
        <div>
          <h1 id="order-detail-title">Order {formatOrderPickupLabel(data.orderNumber)}</h1>
          <p className="muted">
            Placed {placedLabel(data.placedAt)}
            {data.completedAt ? ` · Collected ${placedLabel(data.completedAt)}` : ''} · Status{' '}
            <strong>{data.status === 'completed' ? 'Collected' : data.status}</strong>
          </p>
        </div>
        <button type="button" className="ghostBtn" onClick={() => (onDismiss ? onDismiss() : window.close())}>
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

function openScanPopup(): void {
  const u = new URL(window.location.href);
  u.hash = '#/scan';
  window.open(
    u.toString(),
    'mojaOpsScan',
    'width=520,height=780,scrollbars=yes,resizable=yes',
  );
}

function openTimesheetPopup(): void {
  const u = new URL(window.location.href);
  u.hash = '#/timesheet';
  window.open(
    u.toString(),
    'mojaOpsTimesheet',
    'width=440,height=560,scrollbars=yes,resizable=yes',
  );
}

function openKitchenPopup(): void {
  const u = new URL(window.location.href);
  u.hash = '#/kitchen';
  window.open(
    u.toString(),
    'mojaOpsKitchen',
    'width=1200,height=860,scrollbars=yes,resizable=yes',
  );
}

/** Member desk: look up a member, register a walk-in, redeem points. */
function openMemberPopup(): void {
  const u = new URL(window.location.href);
  u.hash = '#/member';
  window.open(
    u.toString(),
    'mojaOpsMember',
    'width=560,height=860,scrollbars=yes,resizable=yes',
  );
}

/** Short labels for the ticket's state tag. */
const QUEUE_STATUS_LABEL: Record<string, string> = {
  placed: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Collected',
  cancelled: 'Cancelled',
};

/** A parcel is posted, not collected: it has its own list and its own verb. */
function isParcel(order: QueueOrderSummary): boolean {
  return order.fulfillmentSummary.some((l) => l.trim().toLowerCase() === 'shipping');
}

/** "16:00" -> "4:00 PM". */
function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** The pickup slot written on a scheduled order: `Date: yyyy-mm-dd`, `Time: hh:mm`. */
function pickupSlot(order: QueueOrderSummary): { date: string | null; time: string | null; at: number | null } {
  let date: string | null = null;
  let time: string | null = null;
  for (const line of order.fulfillmentSummary) {
    const dm = line.match(/Date:\s*(\d{4}-\d{2}-\d{2})/i);
    if (dm) date = dm[1];
    const tm = line.match(/Time:\s*(\d{1,2}:\d{2})/i);
    if (tm) time = tm[1].padStart(5, '0');
  }
  const ts = date && time ? pickupSortTimestamp(order) : null;
  return { date, time, at: ts };
}

/** In-store orders say "Collect today from 3:40 PM"; that's when it is due. */
function inStoreReadyFrom(order: QueueOrderSummary): string | null {
  for (const line of order.fulfillmentSummary) {
    const m = line.match(/Collect today from\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}

/** "3 min", "1 h 20 min", "2 days". Rough drops the minutes once past an hour. */
function durationLabel(ms: number, rough = false): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return mins % 60 && !rough ? `${hours} h ${mins % 60} min` : `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/** Lines that only repeat what the ticket already shows (lane, date, time). */
function extraNotes(order: QueueOrderSummary): string[] {
  return order.fulfillmentSummary.filter(
    (l) =>
      !/^(self pickup|in store · prepare now|shipping)$/i.test(l.trim()) &&
      !/^(date|time):/i.test(l.trim()) &&
      !/^collect today/i.test(l.trim()),
  );
}

function Ticket({
  order,
  lane,
  now,
  pulse,
  busy,
  onDone,
  onAdvance,
  onOpenDetail,
}: {
  order: QueueOrderSummary;
  lane: 'instore' | 'pickup' | 'parcel' | 'upcoming';
  now: number;
  pulse: boolean;
  busy: boolean;
  onDone: () => void;
  onAdvance: (next: 'preparing' | 'ready') => void;
  onOpenDetail: () => void;
}) {
  const slot = pickupSlot(order);
  const late =
    lane === 'pickup' && slot.at != null && slot.at < now && order.status !== 'ready';
  const who = order.customerDisplayName?.trim() || order.customerPhoneMasked;
  const notes = extraNotes(order);
  const readyFrom = lane === 'instore' ? inStoreReadyFrom(order) : null;
  const doneLabel = lane === 'parcel' ? 'Posted' : 'Collected';

  // One main button: the next step for this order.
  const next =
    order.status === 'placed'
      ? { label: 'Start preparing', className: 'tBtn tBtn--next', run: () => onAdvance('preparing') }
      : order.status === 'preparing'
        ? { label: 'Mark ready', className: 'tBtn tBtn--ready', run: () => onAdvance('ready') }
        : { label: doneLabel, className: 'tBtn tBtn--next', run: onDone };

  const stateClass = late ? 'late' : order.status;
  return (
    <article
      className={`ticket ticket--${lane} ticket--${stateClass}${pulse ? ' ticket--arrived' : ''}`}
    >
      <div className="tWhen">
        {lane === 'instore' ? (
          <>
            <span className="tBig">{durationLabel(now - new Date(order.placedAt).getTime())}</span>
            <span className="tSmall">waiting</span>
          </>
        ) : lane === 'parcel' ? (
          <>
            <span className="tBig tBig--date">{placedLabel(order.placedAt)}</span>
            <span className="tSmall">ordered</span>
          </>
        ) : (
          <>
            <span className="tBig">{slot.time ? clock12(slot.time) : '—'}</span>
          </>
        )}
      </div>

      <div className="tBody">
        <div className="tMeta">
          {late ? (
            <span className="state state--late">Late {durationLabel(now - (slot.at ?? now), true)}</span>
          ) : (
            <span className={`state state--${order.status}`}>
              {QUEUE_STATUS_LABEL[order.status] ?? order.status}
            </span>
          )}
          <span className="tNum">#{formatOrderPickupLabel(order.orderNumber)}</span>
          <span className="tWho">{who}</span>
        </div>
        <ul className="tItems">
          {order.lines.map((l) => (
            <li key={l.id}>
              <span className="tQty">{l.qty}</span>
              <span>
                {l.name}
                {l.variantLabel ? <span className="tSize"> · {l.variantLabel}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {readyFrom ? (
          <p className="tNote">
            Ready from <strong>{readyFrom}</strong>
          </p>
        ) : null}
        {notes.map((n) => (
          <p key={n} className="tNote">
            {n}
          </p>
        ))}
      </div>

      <div className="tActions">
        <button type="button" className={next.className} disabled={busy} onClick={next.run}>
          {busy ? 'Saving…' : next.label}
        </button>
        <div className="tLinks">
          <button type="button" className="tLink" onClick={onOpenDetail}>
            Details
          </button>
          {order.status !== 'ready' ? (
            <button type="button" className="tLink" disabled={busy} onClick={onDone}>
              {doneLabel}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Later pickups grouped by day, with a bake list per day: how many of each
 * product and size, adding up every order for that day (add-ons left out).
 */
function upcomingByDay(orders: QueueOrderSummary[]): {
  date: string;
  orders: QueueOrderSummary[];
  bake: { name: string; qty: number }[];
}[] {
  const days = new Map<string, QueueOrderSummary[]>();
  for (const o of orders) {
    const date = pickupCalendarDay(o.fulfillmentSummary) ?? o.placedAt.slice(0, 10);
    days.set(date, [...(days.get(date) ?? []), o]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const tally = new Map<string, number>();
      for (const o of list) {
        for (const l of o.lines) {
          if (l.productId.startsWith('addon-')) continue;
          const name = l.variantLabel ? `${l.name} ${l.variantLabel}` : l.name;
          tally.set(name, (tally.get(name) ?? 0) + l.qty);
        }
      }
      return {
        date,
        orders: list,
        bake: [...tally.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, qty]) => ({ name, qty })),
      };
    });
}

/** "2026-11-05" -> "Thu 5 Nov". */
function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const SOUND_PREF = 'moja_ops_new_order_sound';
const DESKTOP_PREF = 'moja_ops_new_order_desktop';
/** While new orders are unacknowledged, the chime repeats this often. */
const CHIME_REPEAT_MS = 30_000;

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writePref(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* private mode */
  }
}

export function App() {
  const { state: authState, signIn, signOut, sessionExpired } =
    useOpsAuth();
  const [detailModalId, setDetailModalId] = useState<string | null>(() => detailIdFromSearch());
  const apiKey = authState.status === 'authenticated' ? authState.apiKey : '';
  const apiBase = authState.status === 'authenticated' ? authState.apiBase : readStoredBase();

  const [rawPending, setRawPending] = useState<QueueOrderSummary[]>([]);
  const [rawHistory, setRawHistory] = useState<QueueOrderSummary[]>([]);
  /** Shop day whose collected orders are listed (yyyy-mm-dd). */
  const [collectedDay, setCollectedDay] = useState(() => shopCalendarYmd());
  /** Which folded list is open under the lanes. */
  const [openFold, setOpenFold] = useState<'parcels' | 'collected' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Ticks every 30s so waiting times and late flags stay current. */
  const [now, setNow] = useState(() => Date.now());
  const [staffEmail, setStaffEmail] = useState<StaffEmailStatus | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [pollOk, setPollOk] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [pulseIds, setPulseIds] = useState<Set<string>>(() => new Set());
  const prevPendingRef = useRef<Set<string>>(new Set());
  // The first load seeds what is already in the queue, so only orders that
  // arrive after that ring the bell.
  const seededRef = useRef(false);
  const [soundOn, setSoundOn] = useState(() => readPref(SOUND_PREF, true));
  const [desktopOn, setDesktopOn] = useState(
    () =>
      readPref(DESKTOP_PREF, false) &&
      desktopNotificationsSupported() &&
      Notification.permission === 'granted',
  );
  const [audioLocked, setAudioLocked] = useState(() => soundBlocked());
  /** Order numbers that arrived since the cashier last pressed "Got it". */
  const [unseen, setUnseen] = useState<number[]>([]);

  /**
   * The lanes: in-store orders by how long they've waited; today's pickups
   * (and any overdue from earlier days) by time; later pickups and parcels
   * folded away.
   */
  const lanes = useMemo(() => {
    const today = shopCalendarYmd(new Date(now));
    const instore: QueueOrderSummary[] = [];
    const pickups: QueueOrderSummary[] = [];
    const upcoming: QueueOrderSummary[] = [];
    const parcels: QueueOrderSummary[] = [];
    for (const o of rawPending) {
      if (isExpediteOrder(o)) instore.push(o);
      else if (isParcel(o)) parcels.push(o);
      else if ((pickupCalendarDay(o.fulfillmentSummary) ?? today) > today) upcoming.push(o);
      else pickups.push(o);
    }
    const byPlaced = (a: QueueOrderSummary, b: QueueOrderSummary) =>
      new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime();
    return {
      instore: instore.sort(byPlaced),
      pickups: sortByPickupSlot(pickups, 'asc'),
      upcoming: sortByPickupSlot(upcoming, 'asc'),
      parcels: parcels.sort(byPlaced),
    };
  }, [rawPending, now]);

  const lateCount = lanes.pickups.filter((o) => {
    const at = pickupSlot(o).at;
    return at != null && at < now && o.status !== 'ready';
  }).length;
  const toMakeCount = lanes.instore.length + lanes.pickups.length;

  const collected = useMemo(
    () =>
      rawHistory
        .filter((h) => h.status === 'completed' && shopDateFromIso(h.completedAt ?? h.placedAt) === collectedDay)
        .sort((a, b) => new Date(b.completedAt ?? b.placedAt).getTime() - new Date(a.completedAt ?? a.placedAt).getTime()),
    [rawHistory, collectedDay],
  );

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // The More menu closes on Escape or a click anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest('.qMenu')) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  // Whether the shop gets an email for each new order: shown in the top bar.
  useEffect(() => {
    if (!apiKey.trim()) return;
    let alive = true;
    void fetchQueueAlerts(apiKey.trim(), apiBase.trim() || defaultBase)
      .then((res) => {
        if (alive) setStaffEmail(res.staffEmail);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [apiKey, apiBase]);

  const poll = useCallback(async () => {
    if (!apiKey.trim()) return;
    try {
      const data = await fetchQueueOrders(apiKey.trim(), apiBase.trim() || defaultBase);
      if (!seededRef.current) {
        prevPendingRef.current = new Set(data.pending.map((o) => o.id));
        seededRef.current = true;
      }
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
    if (!seededRef.current) return;
    const next = new Set(rawPending.map((p) => p.id));
    const prev = prevPendingRef.current;
    const arrived = rawPending.filter((o) => !prev.has(o.id));
    if (arrived.length > 0) {
      const numbers = arrived.map((o) => o.orderNumber);
      setUnseen((u) => [...u, ...numbers.filter((n) => !u.includes(n))]);
      if (soundOn) playChime();
      if (desktopOn) {
        showDesktopNotification(
          arrived.length === 1 ? `New order #${numbers[0]}` : `${arrived.length} new orders`,
          numbers.map((n) => `#${n}`).join(', '),
        );
      }
    }
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
    // Only a change in the queue should ring, not toggling the alert settings.
  }, [rawPending]);

  // Keep ringing until someone presses "Got it", so a busy counter can't miss it.
  useEffect(() => {
    if (!soundOn || unseen.length === 0) return;
    const t = window.setInterval(() => playChime(), CHIME_REPEAT_MS);
    return () => window.clearInterval(t);
  }, [soundOn, unseen.length]);

  // The tab title shows the count, so it stands out among other tabs.
  useEffect(() => {
    const base = 'Moja — Order queue';
    document.title = unseen.length > 0 ? `(${unseen.length}) New order — ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [unseen.length]);

  // Browsers keep a page silent until it is tapped once.
  useEffect(() => installAudioUnlock(() => setAudioLocked(false)), []);

  const toggleSound = () => {
    setSoundOn((on) => {
      writePref(SOUND_PREF, !on);
      if (!on) playChime(1); // one quick ring so the cashier hears the volume
      return !on;
    });
  };

  const toggleDesktop = async () => {
    if (desktopOn) {
      writePref(DESKTOP_PREF, false);
      setDesktopOn(false);
      return;
    }
    const ok = await requestDesktopNotifications();
    if (!ok) {
      window.alert('Desktop alerts are blocked for this site. Allow notifications in the browser settings, then try again.');
      return;
    }
    writePref(DESKTOP_PREF, true);
    setDesktopOn(true);
  };

  const onDisconnect = () => {
    signOut();
    setRawPending([]);
    setRawHistory([]);
    setPollErr(null);
    setPollOk(false);
    setUnseen([]);
    seededRef.current = false;
    prevPendingRef.current = new Set();
  };

  const onDone = (id: string) => {
    setCompletingId(id);
    completeQueueOrder(apiKey, id, apiBase.trim() || defaultBase)
      .then(() => {
        setDetailModalId((openId) => (openId === id ? null : openId));
        void poll();
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : 'Could not mark order collected');
      })
      .finally(() => setCompletingId(null));
  };

  /** Start preparing / mark ready. Re-polls so a second tablet sees it too. */
  const onAdvance = (id: string, next: 'preparing' | 'ready') => {
    setCompletingId(id);
    setQueueOrderStatus(apiKey, id, next, {}, apiBase.trim() || defaultBase)
      .then(() => void poll())
      .catch((err) => {
        window.alert(
          err instanceof Error ? err.message : 'Could not update this order',
        );
        // Another device may have moved it — resync rather than leave a stale card.
        void poll();
      })
      .finally(() => setCompletingId(null));
  };

  if (authState.status !== 'authenticated') {
    return (
      <OpsLoginScreen
        title="Order queue"
        lead="Sign in with your admin email and password — the same account as the admin dashboard."
        checking={authState.status === 'checking'}
        notice={sessionExpired ? 'Your session has expired. Please sign in again.' : null}
        onSubmit={signIn}
      />
    );
  }

  const ticketProps = (o: QueueOrderSummary) => ({
    order: o,
    now,
    pulse: pulseIds.has(o.id),
    busy: completingId === o.id,
    onDone: () => onDone(o.id),
    onAdvance: (next: 'preparing' | 'ready') => onAdvance(o.id, next),
    onOpenDetail: () => setDetailModalId(o.id),
  });

  return (
    <div className="queueApp">
      <header className="qBar">
        <h1>Order queue</h1>
        <p className="qCount">
          <strong>{toMakeCount} to make</strong>
          {lateCount > 0 ? <span className="qLate"> · {lateCount} late</span> : null}
          {!pollOk ? <span className="qOffline"> · Reconnecting…</span> : null}
        </p>
        <span className="qSpacer" />
        <button
          type="button"
          className={soundOn ? 'qStatus qStatus--on' : 'qStatus qStatus--off'}
          onClick={toggleSound}
          aria-pressed={soundOn}
          title="Chime when a new order comes in"
        >
          {soundOn ? 'Sound on' : 'Sound off'}
        </button>
        {staffEmail ? (
          <span
            className={staffEmail.on ? 'qStatus qStatus--on' : 'qStatus qStatus--off'}
            title={
              staffEmail.on
                ? `Each new order is emailed to ${staffEmail.recipient}`
                : staffEmail.reason ?? 'New-order emails are off'
            }
          >
            {staffEmail.on ? 'Email alerts on' : 'Email alerts off'}
          </span>
        ) : null}
        <button type="button" className="qBtn" onClick={() => openScanPopup()}>
          Scan QR
        </button>
        <button type="button" className="qBtn" onClick={() => void poll()}>
          Refresh
        </button>
        <div className="qMenu">
          <button
            type="button"
            className="qBtn"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            More ▾
          </button>
          {menuOpen ? (
            <div className="qMenuList" role="menu" onClick={() => setMenuOpen(false)}>
              <button type="button" role="menuitem" onClick={() => openKitchenPopup()}>
                Kitchen stock
              </button>
              <button type="button" role="menuitem" onClick={() => openMemberPopup()}>
                Member desk
              </button>
              <button type="button" role="menuitem" onClick={() => openTimesheetPopup()}>
                Timesheet
              </button>
              {desktopNotificationsSupported() ? (
                <button type="button" role="menuitem" onClick={() => void toggleDesktop()}>
                  {desktopOn ? 'Turn off desktop alerts' : 'Turn on desktop alerts'}
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={onDisconnect}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {unseen.length > 0 ? (
        <div className="newOrderBanner" role="alert">
          <span>
            {unseen.length === 1 ? 'New order' : `${unseen.length} new orders`}:{' '}
            <strong>{unseen.map((n) => `#${n}`).join(', ')}</strong>
          </span>
          <button type="button" className="tBtn tBtn--next" onClick={() => setUnseen([])}>
            Got it
          </button>
        </div>
      ) : null}
      {soundOn && audioLocked ? (
        <p className="newOrderSoundHint" role="status">
          Tap anywhere on this page once to turn on the new-order sound.
        </p>
      ) : null}
      {pollErr ? <p className="qError">{pollErr}</p> : null}

      <div className="rail">
        <section className="lane" aria-labelledby="lane-instore">
          <h2 id="lane-instore">
            In store now <small>{lanes.instore.length} waiting</small>
          </h2>
          {lanes.instore.length === 0 ? (
            <p className="laneEmpty">No one is waiting. In-store orders from the app appear here.</p>
          ) : (
            <div className="tickets">
              {lanes.instore.map((o) => (
                <Ticket key={o.id} lane="instore" {...ticketProps(o)} />
              ))}
            </div>
          )}
        </section>

        <section className="lane" aria-labelledby="lane-pickups">
          <h2 id="lane-pickups">
            Today&apos;s pickups{' '}
            <small>
              {dayLabel(shopCalendarYmd(new Date(now)))} · {lanes.pickups.length} left
            </small>
          </h2>
          {lanes.pickups.length === 0 ? (
            <p className="laneEmpty">No more pickups today.</p>
          ) : (
            <div className="tickets">
              {lanes.pickups.map((o) => (
                <Ticket key={o.id} lane="pickup" {...ticketProps(o)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Always open: these are cakes to bake and get ready for later days. */}
      <section className="upcoming" aria-labelledby="lane-upcoming">
        <h2 id="lane-upcoming">
          Coming up <small>{lanes.upcoming.length} {lanes.upcoming.length === 1 ? 'order' : 'orders'} to prepare</small>
        </h2>
        {lanes.upcoming.length === 0 ? (
          <p className="laneEmpty">No pickups booked for later days yet.</p>
        ) : (
          upcomingByDay(lanes.upcoming).map((day) => (
            <div key={day.date} className="upcomingDay">
              <div className="upcomingDayHead">
                <h3>{dayLabel(day.date)}</h3>
                <p className="bakeList">
                  To bake:{' '}
                  {day.bake.map((b, i) => (
                    <span key={b.name}>
                      {i > 0 ? ', ' : ''}
                      <strong>{b.qty}×</strong> {b.name}
                    </span>
                  ))}
                </p>
              </div>
              <div className="tickets">
                {day.orders.map((o) => (
                  <Ticket key={o.id} lane="upcoming" {...ticketProps(o)} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <div className="folds">
        <FoldButton
          label="Parcels to post"
          count={lanes.parcels.length}
          open={openFold === 'parcels'}
          onToggle={() => setOpenFold((f) => (f === 'parcels' ? null : 'parcels'))}
        />
        <FoldButton
          label="Collected"
          count={collected.length}
          open={openFold === 'collected'}
          onToggle={() => setOpenFold((f) => (f === 'collected' ? null : 'collected'))}
        />
      </div>

      {openFold === 'parcels' ? (
        <section className="foldPanel" aria-label="Parcels to post">
          {lanes.parcels.length === 0 ? (
            <p className="laneEmpty">No parcels waiting to be posted.</p>
          ) : (
            <div className="tickets">
              {lanes.parcels.map((o) => (
                <Ticket key={o.id} lane="parcel" {...ticketProps(o)} />
              ))}
            </div>
          )}
        </section>
      ) : null}
      {openFold === 'collected' ? (
        <section className="foldPanel" aria-label="Collected orders">
          <label className="foldDate">
            Collected on
            <input
              type="date"
              value={collectedDay}
              max={shopCalendarYmd(new Date(now))}
              onChange={(e) => setCollectedDay(e.target.value || shopCalendarYmd())}
            />
          </label>
          {collected.length === 0 ? (
            <p className="laneEmpty">Nothing collected on {dayLabel(collectedDay)}.</p>
          ) : (
            <ul className="collectedList">
              {collected.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => setDetailModalId(h.id)}>
                    <span className="tNum">#{formatOrderPickupLabel(h.orderNumber)}</span>
                    <span>{h.customerDisplayName?.trim() || h.customerPhoneMasked}</span>
                    <span className="collectedAt">
                      {h.completedAt
                        ? new Date(h.completedAt).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                    <span>{formatRm(h.totalCents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {detailModalId ? (
        <div
          className="detailModalBackdrop"
          role="presentation"
          onClick={() => setDetailModalId(null)}
        >
          <div
            className="detailModalPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <OrderDetailView orderId={detailModalId} onDismiss={() => setDetailModalId(null)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FoldButton({
  label,
  count,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={open ? 'fold fold--open' : 'fold'}
      aria-expanded={open}
      onClick={onToggle}
    >
      <strong>{label}</strong>
      <span>
        {count} {open ? '▴' : '▾'}
      </span>
    </button>
  );
}
