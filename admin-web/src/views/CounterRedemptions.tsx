import { useEffect, useState } from 'react';
import { fetchCounterRedemptions, type CounterRedemptionsDay } from '../api';

const rm = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;
const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

/**
 * Points redeemed by cashiers at the counter, for ticking off against SalesPlay
 * at closing: each discount should appear on a till receipt.
 */
export function CounterRedemptions() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<CounterRedemptionsDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCounterRedemptions(date)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => {
      alive = false;
    };
  }, [date]);

  return (
    <div className="viewStack">
      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Counter redemptions</h2>
          <label className="filterField" style={{ maxWidth: 200 }}>
            Day
            <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        </div>
        <p className="dataTableMuted" style={{ marginTop: 0 }}>
          Points a cashier redeemed for a member at the counter. Each discount should appear on a SalesPlay receipt — use
          this list to tick them off at closing. Cashiers can note the receipt number when they redeem.
        </p>
        {error ? <p className="viewError">{error}</p> : null}
        {data ? (
          <p style={{ margin: '0 0 12px' }}>
            <strong>{data.totals.count}</strong> redemption(s) · <strong>{data.totals.pointsSpent.toLocaleString()}</strong> points ·{' '}
            <strong>{rm(data.totals.cashDiscountCents)}</strong> in cash discounts
            {data.totals.undone ? <> · {data.totals.undone} undone</> : null}
            {data.totals.withoutReceipt ? (
              <>
                {' '}
                · <span style={{ color: '#b45309' }}>{data.totals.withoutReceipt} with no receipt number noted</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="viewMuted">Loading…</p>
        )}
        <table className="dataTable">
          <thead>
            <tr>
              <th>Time</th>
              <th>Member</th>
              <th>Reward</th>
              <th>Discount to key in</th>
              <th>Points</th>
              <th>Code</th>
              <th>Cashier</th>
              <th>Receipt no.</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => (
              <tr key={r.id} style={r.status === 'UNDONE' ? { opacity: 0.55 } : undefined}>
                <td>{new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>
                  {r.member.displayName || '—'}
                  <br />
                  <span className="dataTableMuted">{r.member.phoneE164}</span>
                </td>
                <td>{r.rewardTitle}</td>
                <td>{r.percentageOff != null ? `${r.percentageOff}% off` : rm(r.discountCents ?? 0)}</td>
                <td>{r.pointsSpent}</td>
                <td><code>{r.voucherCode}</code></td>
                <td>
                  {r.staffCode}
                  {r.staffName ? <span className="dataTableMuted"> · {r.staffName}</span> : null}
                  <br />
                  <span className="dataTableMuted">{r.verification === 'QR' ? 'QR scan' : 'typed number'}</span>
                </td>
                <td>{r.salesplayReceiptRef ?? <span className="dataTableMuted">—</span>}</td>
                <td>
                  {r.status === 'UNDONE' ? (
                    <>
                      <span className="badge badge--neutral">Undone</span>
                      {r.undoReason ? <div className="dataTableMuted">{r.undoReason}</div> : null}
                    </>
                  ) : (
                    <span className="badge badge--success">Redeemed</span>
                  )}
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="dataTableEmpty">No counter redemptions on this day.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
