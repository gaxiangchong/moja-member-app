import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchStockDayGrid,
  reconcileStockDay,
  setStockDayQty,
  type StockDayGrid as Grid,
} from './api';

const DAYS = 7;

function dayLabel(ymd: string): { dow: string; date: string } {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { dow: '', date: ymd };
  return {
    dow: d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
    date: d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }),
  };
}

/**
 * Seven-day availability grid: how many of each cake the kitchen can supply
 * on each day. A cell shows the count the kitchen set and, when some are
 * already spoken for by paid orders, how many are still sellable.
 */
export function KitchenDayGrid({
  apiKey,
  apiBase,
}: {
  apiKey: string;
  apiBase: string;
}) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [reconcilingKey, setReconcilingKey] = useState<string | null>(null);
  const [reconcileErr, setReconcileErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setGrid(await fetchStockDayGrid(apiKey, undefined, DAYS, apiBase));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load the day grid');
    } finally {
      setLoading(false);
    }
  }, [apiKey, apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  const dates = useMemo(() => {
    if (!grid) return [];
    return [...new Set(grid.cells.map((c) => c.businessDate))].sort();
  }, [grid]);

  const cellMap = useMemo(() => {
    const m = new Map<string, Grid['cells'][number]>();
    for (const c of grid?.cells ?? [])
      m.set(`${c.productId}|${c.businessDate}`, c);
    return m;
  }, [grid]);

  const save = useCallback(
    async (productId: string, businessDate: string, qty: number) => {
      const key = `${productId}|${businessDate}`;
      setSavingKey(key);
      setErr(null);
      // Optimistic: the kitchen types fast and should not wait on a round trip.
      setGrid((cur) =>
        cur
          ? {
              ...cur,
              cells: cur.cells.map((c) =>
                c.productId === productId && c.businessDate === businessDate
                  ? {
                      ...c,
                      qty,
                      explicit: true,
                      sellableQty: Math.max(0, qty - c.reservedQty),
                    }
                  : c,
              ),
            }
          : cur,
      );
      try {
        await setStockDayQty(apiKey, productId, businessDate, qty, apiBase);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not save that count');
        await load();
      } finally {
        setSavingKey(null);
      }
    },
    [apiKey, apiBase, load],
  );

  /** First date in the loaded range — the grid always loads from today. */
  const today = dates[0] ?? null;

  const reconcile = useCallback(
    async (productId: string, businessDate: string, actualQty: number) => {
      const key = `${productId}|${businessDate}`;
      setReconcilingKey(key);
      setReconcileErr(null);
      try {
        const updated = await reconcileStockDay(
          apiKey,
          productId,
          businessDate,
          actualQty,
          apiBase,
        );
        setGrid((cur) =>
          cur
            ? {
                ...cur,
                cells: cur.cells.map((c) =>
                  c.productId === productId && c.businessDate === businessDate
                    ? { ...c, actualQty: updated.actualQty, varianceQty: updated.varianceQty }
                    : c,
                ),
              }
            : cur,
        );
      } catch (e) {
        setReconcileErr(
          e instanceof Error ? e.message : 'Could not save that count',
        );
      } finally {
        setReconcilingKey(null);
      }
    },
    [apiKey, apiBase],
  );

  if (loading && !grid) return <p className="muted">Loading day grid…</p>;

  return (
    <div className="dayGridWrap">
      <div className="dayGridHead">
        <h2>Availability · next {DAYS} days</h2>
        <button type="button" className="btnGhost" onClick={() => void load()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="dayGridHint">
        Set how many you can supply each day. A greyed count is not set yet and
        falls back to the product-level number. “−n” means that many are already
        sold for that day.
      </p>
      {err && (
        <p className="memberError" role="alert">
          {err}
        </p>
      )}

      <div className="dayGridScroll">
        <table className="dayGrid">
          <thead>
            <tr>
              <th scope="col" className="dayGridProductHead">
                Cake
              </th>
              {dates.map((d) => {
                const { dow, date } = dayLabel(d);
                return (
                  <th key={d} scope="col">
                    <span className="dayGridDow">{dow}</span>
                    <span className="dayGridDate">{date}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(grid?.products ?? []).map((p) => (
              <tr key={p.id}>
                <th scope="row" className="dayGridProduct">
                  {p.name}
                </th>
                {dates.map((d) => {
                  const cell = cellMap.get(`${p.id}|${d}`);
                  const key = `${p.id}|${d}`;
                  return (
                    <td key={d}>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        className={`dayGridInput${cell?.explicit ? '' : ' is-implicit'}`}
                        value={cell?.qty ?? 0}
                        disabled={savingKey === key}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0);
                          void save(p.id, d, v);
                        }}
                        aria-label={`${p.name} on ${d}`}
                      />
                      {cell && cell.reservedQty > 0 && (
                        <span className="dayGridReserved">
                          −{cell.reservedQty}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {today && (
        <div className="dayGridReconcile">
          <h3>End-of-day count · today</h3>
          <p className="dayGridHint">
            After close, count what is actually left and enter it here. The
            variance compares your count to what sales (online + in-store)
            say should remain.
          </p>
          {reconcileErr && (
            <p className="memberError" role="alert">
              {reconcileErr}
            </p>
          )}
          <ul className="dayGridReconcileList">
            {(grid?.products ?? []).map((p) => {
              const cell = cellMap.get(`${p.id}|${today}`);
              const key = `${p.id}|${today}`;
              return (
                <li key={p.id} className="dayGridReconcileRow">
                  <span className="dayGridReconcileName">{p.name}</span>
                  <span className="dayGridReconcileExpected">
                    Expect {cell?.qty ?? 0}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    placeholder="#"
                    className="dayGridInput"
                    defaultValue={cell?.actualQty ?? ''}
                    disabled={reconcilingKey === key}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === '') return;
                      const v = Math.max(0, Number(raw) || 0);
                      void reconcile(p.id, today, v);
                    }}
                    aria-label={`Physical count of ${p.name} today`}
                  />
                  {cell?.varianceQty != null && (
                    <span
                      className={
                        cell.varianceQty === 0
                          ? 'dayGridVariance is-even'
                          : cell.varianceQty < 0
                            ? 'dayGridVariance is-short'
                            : 'dayGridVariance is-over'
                      }
                    >
                      {cell.varianceQty > 0 ? `+${cell.varianceQty}` : cell.varianceQty}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
