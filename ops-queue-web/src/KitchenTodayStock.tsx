import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchStockDayGrid,
  setStockDayQty,
  type StockDayCell,
  type StockDayGrid as Grid,
} from './api';
import { cellKey } from './KitchenDayGrid';
import {
  canonicalVariantLabel,
  ownLabelFor,
  sizesOf,
  tidyVariantLabel,
} from './variantLabel';

/** How often the screen re-reads stock, so till sales show up on their own. */
const REFRESH_MS = 30_000;

/** Size columns in a sensible order; anything else follows in catalog order. */
const SIZE_ORDER = ['6 inch', '8 inch', 'slice'];

/**
 * The columns: every size any cake has, plus "Each" for cakes without sizes.
 *
 * One column per *size*, not per spelling. Two cakes saved as "6 inch" and
 * "6  Inch" are the same size, and HTML collapses the double space, so without
 * this they drew two columns that painted identically — with the stock under
 * one of them and "—" under the other.
 */
export function sizeColumns(grid: Grid | null): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const p of grid?.products ?? []) {
    for (const raw of sizesOf(p)) {
      const label = tidyVariantLabel(raw);
      const key = canonicalVariantLabel(label);
      if (seen.has(key)) continue;
      seen.add(key);
      columns.push(label);
    }
  }
  const rank = (v: string) => {
    const i = SIZE_ORDER.indexOf(canonicalVariantLabel(v));
    return i === -1 ? SIZE_ORDER.length + (v === '' ? 1 : 0) : i;
  };
  return columns.sort((a, b) => rank(a) - rank(b));
}

/**
 * Today's shelf, per size: one big "can sell" number per cake size, with
 * what is on the shelf and held for online underneath. These counts decide
 * whether "In-store today" can be ordered in the member app; till sales
 * (SalesPlay) and online orders come off them automatically.
 */
export function KitchenTodayStock({
  apiKey,
  apiBase,
}: {
  apiKey: string;
  apiBase: string;
}) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  /** The cell being typed into, so a background refresh leaves it alone. */
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const editingRef = useRef(false);
  editingRef.current = editing !== null;

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        setGrid(await fetchStockDayGrid(apiKey, undefined, 1, apiBase));
        setUpdatedAt(Date.now());
        if (!quiet) setErr(null);
      } catch (e) {
        if (!quiet) setErr(e instanceof Error ? e.message : 'Failed to load stock');
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [apiKey, apiBase],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!editingRef.current) void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const today = grid?.from ?? '';
  const columns = useMemo(() => sizeColumns(grid), [grid]);
  const cellMap = useMemo(() => {
    const m = new Map<string, StockDayCell>();
    for (const c of grid?.cells ?? []) m.set(cellKey(c.productId, c.variant, c.businessDate), c);
    return m;
  }, [grid]);

  const save = useCallback(
    async (productId: string, variant: string, qty: number) => {
      if (!today) return;
      const key = cellKey(productId, variant, today);
      const safe = Math.max(0, Math.round(qty));
      setSavingKey(key);
      setErr(null);
      setGrid((cur) =>
        cur
          ? {
              ...cur,
              cells: cur.cells.map((c) =>
                cellKey(c.productId, c.variant, c.businessDate) === key
                  ? { ...c, qty: safe, explicit: true, sellableQty: Math.max(0, safe - c.reservedQty) }
                  : c,
              ),
            }
          : cur,
      );
      try {
        await setStockDayQty(apiKey, productId, variant, today, safe, apiBase);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not save that count');
        void load();
      } finally {
        setSavingKey((cur) => (cur === key ? null : cur));
      }
    },
    [apiKey, apiBase, today, load],
  );

  const commit = (productId: string, variant: string) => {
    const draft = editing;
    setEditing(null);
    if (!draft || draft.value.trim() === '') return;
    void save(productId, variant, Number(draft.value) || 0);
  };

  if (loading && !grid) return <p className="kitchenMuted">Loading today&apos;s stock…</p>;

  return (
    <section className="kitchenToday">
      <p className="kitchenMuted">
        Till sales and online orders come off automatically
        {updatedAt
          ? ` · updated ${new Date(updatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
          : ''}
        . In-store orders in the app only open for sizes with stock left.
      </p>
      {err ? <p className="kitchenError">{err}</p> : null}
      {grid && grid.products.length === 0 ? <p className="kitchenMuted">No cakes in the catalog.</p> : null}

      <table className="stockTable">
        <thead>
          <tr>
            <th scope="col">Cake</th>
            {columns.map((v) => (
              <th key={v || 'each'} scope="col" className="stockSizeHead">
                {v || 'Each'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(grid?.products ?? []).map((p) => {
            return (
              <tr key={p.id}>
                <th scope="row" className="stockCake">
                  {p.name}
                </th>
                {columns.map((column) => {
                  // The column is one size; this product may spell it its own
                  // way, and its stock is keyed under that spelling.
                  const v = ownLabelFor(p, column);
                  if (v === null) {
                    return (
                      <td key={column || 'each'} className="stockNa" data-label={column || 'Each'}>
                        —
                      </td>
                    );
                  }
                  const key = cellKey(p.id, v, today);
                  const cell = cellMap.get(key);
                  const label = `${p.name}${v ? ` ${v}` : ''}`;
                  const isEditing = editing?.key === key;
                  if (isEditing) {
                    return (
                      <td key={column || 'each'} data-label={column || 'Each'}>
                        <input
                          className="stockEdit"
                          type="number"
                          min={0}
                          inputMode="numeric"
                          autoFocus
                          value={editing.value}
                          onChange={(e) => setEditing({ key, value: e.target.value })}
                          onBlur={() => commit(p.id, v)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          aria-label={`${label}: how many on the shelf`}
                        />
                      </td>
                    );
                  }
                  if (!cell?.explicit) {
                    return (
                      <td key={column || 'each'} data-label={column || 'Each'}>
                        <button
                          type="button"
                          className="stockUnset"
                          onClick={() => setEditing({ key, value: '' })}
                        >
                          Not counted · tap to add
                        </button>
                      </td>
                    );
                  }
                  const left = cell.sellableQty;
                  return (
                    <td key={column || 'each'} data-label={column || 'Each'}>
                      <div className="stockCell">
                        <button
                          type="button"
                          className="stockStep"
                          disabled={savingKey === key || cell.qty <= 0}
                          onClick={() => void save(p.id, v, cell.qty - 1)}
                          aria-label={`One fewer ${label}`}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          className="stockNumber"
                          onClick={() => setEditing({ key, value: String(cell.qty) })}
                          aria-label={`${label}: ${left} can sell. Tap to type the count.`}
                        >
                          <span className={left === 0 ? 'stockSell stockSell--out' : 'stockSell'}>{left}</span>
                          <span className={left === 0 ? 'stockSub stockSub--out' : 'stockSub'}>
                            {left === 0 && cell.reservedQty === 0 ? (
                              'Sold out'
                            ) : (
                              <>
                                {cell.qty} on shelf
                                {cell.reservedQty > 0 ? <span className="stockHeld">{cell.reservedQty} held online</span> : null}
                              </>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="stockStep"
                          disabled={savingKey === key}
                          onClick={() => void save(p.id, v, cell.qty + 1)}
                          aria-label={`One more ${label}`}
                        >
                          +
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
