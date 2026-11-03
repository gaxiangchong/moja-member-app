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

/** One row of the grid: a product, or one size of it. */
export type StockRow = { productId: string; name: string; variant: string };

/** Every size of every product, in grid order. A product without sizes is one row. */
export function stockRows(grid: Grid | null): StockRow[] {
  return (grid?.products ?? []).flatMap((p) =>
    (p.variants.length > 0 ? p.variants : ['']).map((variant) => ({
      productId: p.id,
      name: p.name,
      variant,
    })),
  );
}

export function cellKey(productId: string, variant: string, date: string): string {
  return `${productId}|${variant}|${date}`;
}

/**
 * Seven-day availability grid: how many of each cake size the kitchen can
 * supply on each day. A cell shows the count the kitchen set and, when some
 * are already spoken for by orders, how many are held.
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
      m.set(cellKey(c.productId, c.variant, c.businessDate), c);
    return m;
  }, [grid]);

  const rows = useMemo(() => stockRows(grid), [grid]);

  const save = useCallback(
    async (productId: string, variant: string, businessDate: string, qty: number) => {
      const key = cellKey(productId, variant, businessDate);
      setSavingKey(key);
      setErr(null);
      // Optimistic: the kitchen types fast and should not wait on a round trip.
      setGrid((cur) =>
        cur
          ? {
              ...cur,
              cells: cur.cells.map((c) =>
                cellKey(c.productId, c.variant, c.businessDate) === key
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
        await setStockDayQty(apiKey, productId, variant, businessDate, qty, apiBase);
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
    async (productId: string, variant: string, businessDate: string, actualQty: number) => {
      const key = cellKey(productId, variant, businessDate);
      setReconcilingKey(key);
      setReconcileErr(null);
      try {
        const updated = await reconcileStockDay(
          apiKey,
          productId,
          variant,
          businessDate,
          actualQty,
          apiBase,
        );
        setGrid((cur) =>
          cur
            ? {
                ...cur,
                cells: cur.cells.map((c) =>
                  cellKey(c.productId, c.variant, c.businessDate) === key
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
        Set how many of each size you can supply each day. A greyed count is not
        set yet. “−n” means that many are held by online orders for that day.
        Till sales come off automatically.
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
            {rows.map((r) => (
              <tr key={`${r.productId}|${r.variant}`}>
                <th scope="row" className="dayGridProduct">
                  {r.name}
                  {r.variant ? <span className="dayGridVariant"> · {r.variant}</span> : null}
                </th>
                {dates.map((d) => {
                  const key = cellKey(r.productId, r.variant, d);
                  const cell = cellMap.get(key);
                  const label = `${r.name}${r.variant ? ` ${r.variant}` : ''} on ${d}`;
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
                          void save(r.productId, r.variant, d, v);
                        }}
                        aria-label={label}
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
            {rows.map((r) => {
              const key = cellKey(r.productId, r.variant, today);
              const cell = cellMap.get(key);
              const name = `${r.name}${r.variant ? ` · ${r.variant}` : ''}`;
              return (
                <li key={key} className="dayGridReconcileRow">
                  <span className="dayGridReconcileName">{name}</span>
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
                      void reconcile(r.productId, r.variant, today, v);
                    }}
                    aria-label={`Physical count of ${name} today`}
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
