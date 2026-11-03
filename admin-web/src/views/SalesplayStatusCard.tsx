import { useCallback, useEffect, useState } from 'react';
import { fetchSalesplaySyncHealth, pullSalesplayNow, type SalesplaySyncHealth } from '../api';

/** How often the card re-reads the status while it is on screen. */
const REFRESH_MS = 30_000;

const money = (cents: number) => `RM${(cents / 100).toFixed(2)}`;

function every(seconds: number): string {
  if (seconds < 60) return `every ${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? 'every minute' : `every ${minutes} minutes`;
}

/** "just now", "4 min ago", "2 h ago", or a date for anything older than a day. */
function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const mins = Math.round((now - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function clock(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * SalesPlay sync at a glance: is it connected, how often receipts are pulled,
 * when the last webhook or pull happened, and the last till receipt received.
 */
export function SalesplayStatusCard() {
  const [health, setHealth] = useState<SalesplaySyncHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullNote, setPullNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setHealth(await fetchSalesplaySyncHealth());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the SalesPlay status');
    } finally {
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; no data-fetching lib in this repo yet
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function pullNow() {
    setPulling(true);
    setPullNote(null);
    try {
      await pullSalesplayNow();
      setPullNote('Pulled the latest receipts from SalesPlay.');
      await load();
    } catch (err) {
      setPullNote(err instanceof Error ? err.message : 'Pull failed');
    } finally {
      setPulling(false);
    }
  }

  const live = health?.live;
  const failing = (live?.consecutiveFailures ?? 0) > 0;
  const tone = !health
    ? 'neutral'
    : !health.configured
      ? 'danger'
      : failing
        ? 'warning'
        : 'success';
  const statusText = !health
    ? 'Checking…'
    : !health.configured
      ? 'Not connected'
      : failing
        ? `Having trouble · ${live?.consecutiveFailures} failed pull${live?.consecutiveFailures === 1 ? '' : 's'}`
        : 'Connected';
  const last = health?.lastReceipt;

  return (
    <section className="panel salesplayStatus">
      <div className="panelHead">
        <h2 className="panelTitle">
          SalesPlay sync <span className={`badge badge--${tone}`} style={{ marginLeft: 8 }}>{statusText}</span>
        </h2>
        <div className="drawerRowActions" style={{ margin: 0 }}>
          <button type="button" className="toolbarButton" onClick={() => void load()}>
            Refresh
          </button>
          <button
            type="button"
            className="toolbarButton"
            disabled={pulling || !health?.configured}
            onClick={() => void pullNow()}
            title="Fetch recent receipts from SalesPlay now, in case a webhook was missed"
          >
            {pulling ? 'Pulling…' : 'Pull receipts now'}
          </button>
        </div>
      </div>
      {error ? <p className="viewError">{error}</p> : null}
      {pullNote ? <p className="viewMuted">{pullNote}</p> : null}
      {health ? (
        <dl className="salesplayStatusGrid">
          <div>
            <dt>Receipt refresh</dt>
            <dd>
              {live?.receiptsEnabled ? (
                <>
                  <strong>{every(live.intervalSec)}</strong>
                  <span className="viewMuted"> · last {ago(live.lastSuccessAt, now)}</span>
                </>
              ) : (
                <>
                  <strong>Off</strong>
                  <span className="viewMuted"> · webhook only</span>
                </>
              )}
              {failing && live?.lastErrorAt ? (
                <span className="viewMuted"> · last error {ago(live.lastErrorAt, now)}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Webhook</dt>
            <dd>
              <strong>{ago(health.lastWebhookAt, now)}</strong>
              <span className="viewMuted"> · SalesPlay pushes each sale as it happens</span>
            </dd>
          </div>
          <div>
            <dt>Full check</dt>
            <dd>
              {health.reconcileEnabled ? (
                <>
                  <strong>every {health.intervalHours} h</strong>
                  <span className="viewMuted">
                    {' '}
                    · last {ago(health.lastPulledAt, now)}
                    {health.nextPullDueAt ? ` · next ${clock(health.nextPullDueAt)}` : ''}
                    {health.pullInProgress ? ' · running now' : ''}
                  </span>
                </>
              ) : (
                <strong>Off</strong>
              )}
            </dd>
          </div>
          <div>
            <dt>Last receipt</dt>
            <dd>
              {last ? (
                <>
                  <strong>
                    #{last.receiptNumber ?? '—'} · {money(last.netCents)}
                  </strong>
                  <span className="viewMuted">
                    {' '}
                    · received {ago(last.receivedAt, now)}
                    {last.soldAt ? ` (sold ${clock(last.soldAt)})` : ''} via{' '}
                    {last.source === 'PULL' ? 'pull' : 'webhook'} ·{' '}
                    {last.matchedMember ? 'member' : 'walk-in'}
                  </span>
                </>
              ) : (
                <strong>None yet</strong>
              )}
            </dd>
          </div>
          <div>
            <dt>Today</dt>
            <dd>
              <strong>
                {health.receiptsToday} receipt{health.receiptsToday === 1 ? '' : 's'}
              </strong>
              <span className="viewMuted">
                {' '}
                · {health.creditNotesToday} refund{health.creditNotesToday === 1 ? '' : 's'} ·{' '}
                {health.unmatchedReceiptsToday} not linked to a member
              </span>
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
