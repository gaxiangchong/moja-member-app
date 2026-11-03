import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchClosedDays,
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
 * The kitchen's planning views. `week`: how many of each cake size can be
 * made on each of the next seven days (pre-orders hold against these), with
 * closed days hatched out. `count`: after close, the physical count of what
 * is left today, compared with what sales say should remain.
 */
export function KitchenDayGrid({
  apiKey,
  apiBase,
  mode,
}: {
  apiKey: string;
  apiBase: string;
  mode: 'week' | 'count';
}) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [closedDays, setClosedDays] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [reconcilingKey, setReconcilingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const next = await fetchStockDayGrid(apiKey, undefined, DAYS, apiBase);
      setGrid(next);
      const dates = [...new Set(next.cells.map((c) => c.businessDate))];
      void fetchClosedDays(dates, apiBase).then(setClosedDays);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load stock');
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
    for (const c of grid?.cells ?? []) m.set(cellKey(c.productId, c.variant, c.businessDate), c);
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
                  ? { ...c, qty, explicit: true, sellableQty: Math.max(0, qty - c.reservedQty) }
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
      setErr(null);
      try {
        const updated = await reconcileStockDay(apiKey, productId, variant, businessDate, actualQty, apiBase);
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
        setErr(e instanceof Error ? e.message : 'Could not save that count');
      } finally {
        setReconcilingKey(null);
      }
    },
    [apiKey, apiBase],
  );

  if (loading && !grid) return <p className="kitchenMuted">Loading…</p>;

  if (mode === 'count') {
    return (
      <section className="kitchenCount">
        <p className="kitchenMuted">
          After close, count what is actually left and enter it. The difference compares your count with what
          sales (online and at the till) say should remain.
        </p>
        {err ? <p className="kitchenError">{err}</p> : null}
        {today ? (
          <table className="countTable">
            <thead>
              <tr>
                <th scope="col">Cake</th>
                <th scope="col">Should be left</th>
                <th scope="col">Counted</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = cellKey(r.productId, r.variant, today);
                const cell = cellMap.get(key);
                const name = `${r.name}${r.variant ? ` · ${r.variant}` : ''}`;
                return (
                  <tr key={key}>
                    <th scope="row">{name}</th>
                    <td data-label="Should be left">{cell?.explicit ? cell.qty : '—'}</td>
                    <td data-label="Counted">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        placeholder="—"
                        className="weekInput"
                        defaultValue={cell?.actualQty ?? ''}
                        disabled={reconcilingKey === key}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === '') return;
                          void reconcile(r.productId, r.variant, today, Math.max(0, Number(raw) || 0));
                        }}
                        aria-label={`Counted ${name} left today`}
                      />
                    </td>
                    <td data-label="Difference">
                      {cell?.varianceQty != null ? (
                        <span
                          className={
                            cell.varianceQty === 0
                              ? 'countDiff'
                              : cell.varianceQty < 0
                                ? 'countDiff countDiff--short'
                                : 'countDiff countDiff--over'
                          }
                        >
                          {cell.varianceQty === 0
                            ? 'Matches'
                            : cell.varianceQty < 0
                              ? `${-cell.varianceQty} short`
                              : `${cell.varianceQty} extra`}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>
    );
  }

  return (
    <section className="kitchenWeek">
      <p className="kitchenMuted">
        How many of each size the kitchen can make each day. Pre-orders are held against these; an empty box means
        not counted yet.
      </p>
      {err ? <p className="kitchenError">{err}</p> : null}
      <div className="weekScroll">
        <table className="weekTable">
          <thead>
            <tr>
              <th scope="col" className="weekCakeHead">
                Cake
              </th>
              {dates.map((d) => {
                const { dow, date } = dayLabel(d);
                const closed = closedDays.has(d);
                return (
                  <th key={d} scope="col" className={closed ? 'weekDay weekDay--closed' : 'weekDay'}>
                    {dow} {date}
                    {closed ? <span className="weekClosedNote">Closed</span> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(grid?.products ?? []).map((p) => {
              const sizes = p.variants.length > 0 ? p.variants : [''];
              return (
                <Fragment key={p.id}>
                  {sizes.length > 1 || sizes[0] !== '' ? (
                    <tr className="weekCakeRow">
                      <th scope="rowgroup" colSpan={dates.length + 1}>
                        {p.name}
                      </th>
                    </tr>
                  ) : null}
                  {sizes.map((v) => (
                    <tr key={v || 'each'} className={v ? 'weekSizeRow' : 'weekSizeRow weekSizeRow--solo'}>
                      <th scope="row">{v || p.name}</th>
                      {dates.map((d) => {
                        const key = cellKey(p.id, v, d);
                        const cell = cellMap.get(key);
                        if (closedDays.has(d)) {
                          return <td key={d} className="weekClosed" aria-label="Closed" />;
                        }
                        return (
                          <td key={d}>
                            <input
                              type="number"
                              min={0}
                              max={999}
                              placeholder="—"
                              className={cell?.explicit ? 'weekInput' : 'weekInput weekInput--empty'}
                              value={cell?.explicit ? cell.qty : ''}
                              disabled={savingKey === key}
                              onChange={(e) => {
                                if (e.target.value === '') return;
                                void save(p.id, v, d, Math.max(0, Number(e.target.value) || 0));
                              }}
                              aria-label={`${p.name}${v ? ` ${v}` : ''} on ${d}`}
                            />
                            {cell && cell.reservedQty > 0 ? (
                              <span className="weekHeld">{cell.reservedQty} held</span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
