import { useCallback, useEffect, useState } from 'react';
import { fetchTodayRedemptions, undoCounterRedemption, type TodayRedemption } from './api';

/** Today's counter redemptions, so a cashier can check what was keyed in and undo a mistake. */
export function TodayRedemptions({
  apiKey,
  base,
  staffCode,
  refreshKey,
}: {
  apiKey: string;
  base: string;
  staffCode: string;
  /** Change this to reload (e.g. after a redemption). */
  refreshKey: number;
}) {
  const [rows, setRows] = useState<TodayRedemption[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchTodayRedemptions(apiKey, base));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
  }, [apiKey, base]);

  useEffect(() => {
    if (open) void load();
  }, [open, refreshKey, load]);

  async function undo(r: TodayRedemption) {
    if (!staffCode.trim()) {
      setError('Enter your staff code first.');
      return;
    }
    const reason = window.prompt(`Undo ${r.rewardTitle} for ${r.member.displayName || r.member.phoneMasked}? Reason (optional):`, '');
    if (reason === null) return;
    setBusyId(r.id);
    try {
      await undoCounterRedemption(apiKey, r.id, { staffCode, reason: reason.trim() || undefined }, base);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo');
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = rows?.filter((r) => r.status === 'ACTIVE').length ?? 0;
  return (
    <section className="memberCard todayRedemptions">
      <button type="button" className="todayToggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Today&apos;s redemptions{rows ? ` (${activeCount})` : ''} {open ? '▴' : '▾'}
      </button>
      {open ? (
        <>
          {error ? <p className="memberError" role="alert">{error}</p> : null}
          {rows && rows.length === 0 ? <p className="memberHint">None yet today.</p> : null}
          <ul className="redeemList">
            {(rows ?? []).map((r) => (
              <li key={r.id} className={`redeemRow${r.status === 'UNDONE' ? ' redeemRow--undone' : ''}`}>
                <div>
                  <strong>
                    {r.discountLabel} · {r.member.displayName || r.member.phoneMasked}
                  </strong>
                  <span className="memberHint" style={{ display: 'block', margin: 0 }}>
                    {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {r.pointsSpent} pts ·{' '}
                    {r.voucherCode} · {r.staffCode}
                    {r.salesplayReceiptRef ? ` · receipt ${r.salesplayReceiptRef}` : ''}
                    {r.status === 'UNDONE' ? ' · UNDONE' : ''}
                  </span>
                </div>
                {r.undoable ? (
                  <button type="button" className="redeemUndo" disabled={busyId === r.id} onClick={() => void undo(r)}>
                    Undo
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
