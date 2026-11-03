import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchStockDayGrid,
  setStockDayQty,
  type StockDayGrid as Grid,
} from './api';
import { cellKey } from './KitchenDayGrid';

/** How often the screen re-reads stock, so till sales show up on their own. */
const REFRESH_MS = 30_000;

const CATEGORY_LABEL: Record<string, string> = {
  whole_cakes: 'Whole cakes',
  cake_slices: 'Cake slices',
};

/**
 * Today's tray, per size: how many 6 inch, 8 inch and Slice of each cake are
 * on the shelf. These counts decide whether "In-store today" can be ordered
 * in the member app; till sales (SalesPlay) and online orders come off them
 * automatically.
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
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  /** Counts being typed, so a background refresh does not overwrite them. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const editing = useRef(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        setGrid(await fetchStockDayGrid(apiKey, undefined, 1, apiBase));
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
      if (!editing.current) void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const today = grid?.from ?? '';
  const cellMap = useMemo(() => {
    const m = new Map<string, Grid['cells'][number]>();
    for (const c of grid?.cells ?? [])
      m.set(cellKey(c.productId, c.variant, c.businessDate), c);
    return m;
  }, [grid]);

  const save = useCallback(
    async (productId: string, variant: string, qty: number) => {
      if (!today) return;
      const key = cellKey(productId, variant, today);
      setSavingKey(key);
      setErr(null);
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
        await setStockDayQty(apiKey, productId, variant, today, qty, apiBase);
        setSavedKey(key);
        window.setTimeout(() => setSavedKey((cur) => (cur === key ? null : cur)), 1500);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not save that count');
        void load();
      } finally {
        setSavingKey((cur) => (cur === key ? null : cur));
      }
    },
    [apiKey, apiBase, today, load],
  );

  const commitDraft = (productId: string, variant: string) => {
    const key = cellKey(productId, variant, today);
    const raw = drafts[key];
    editing.current = false;
    if (raw === undefined) return;
    setDrafts((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
    const qty = Math.max(0, Math.round(Number(raw) || 0));
    if (qty !== (cellMap.get(key)?.qty ?? 0)) void save(productId, variant, qty);
  };

  if (loading && !grid) return <p className="loginLead">Loading…</p>;

  return (
    <div className="todayStock">
      <p className="loginLead">
        Set how many of each size are on the shelf today. In-store orders in the
        app are only open for sizes with stock left. Till sales and online
        orders come off automatically; this screen refreshes every 30 seconds.
      </p>
      {err ? <p className="err">{err}</p> : null}
      {grid && grid.products.length === 0 ? (
        <p className="loginLead">No cake products found.</p>
      ) : null}
      <div className="todayStockList">
        {(grid?.products ?? []).map((p) => {
          const sizes = p.variants.length > 0 ? p.variants : [''];
          return (
            <div key={p.id} className="todayStockCard">
              <div className="todayStockName">
                <strong>{p.name}</strong>
                <span>{CATEGORY_LABEL[p.category] ?? p.category}</span>
              </div>
              {sizes.map((variant) => {
                const key = cellKey(p.id, variant, today);
                const cell = cellMap.get(key);
                const qty = cell?.qty ?? 0;
                const held = cell?.reservedQty ?? 0;
                const left = cell?.sellableQty ?? 0;
                const counted = Boolean(cell?.explicit);
                return (
                  <div key={key} className="todayStockRow">
                    <span className="todayStockSize">{variant || 'Each'}</span>
                    <div className="todayStockStepper">
                      <button
                        type="button"
                        className="btnGhost"
                        disabled={savingKey === key || qty <= 0}
                        onClick={() => void save(p.id, variant, qty - 1)}
                        aria-label={`One fewer ${p.name} ${variant}`}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={drafts[key] ?? String(qty)}
                        onFocus={() => {
                          editing.current = true;
                        }}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDrafts((cur) => ({ ...cur, [key]: value }));
                        }}
                        onBlur={() => commitDraft(p.id, variant)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        aria-label={`${p.name} ${variant} on the shelf`}
                      />
                      <button
                        type="button"
                        className="btnGhost"
                        disabled={savingKey === key}
                        onClick={() => void save(p.id, variant, qty + 1)}
                        aria-label={`One more ${p.name} ${variant}`}
                      >
                        +
                      </button>
                    </div>
                    <span
                      className={`todayStockStatus${
                        !counted ? ' is-unset' : left === 0 ? ' is-out' : ''
                      }`}
                    >
                      {savingKey === key
                        ? 'Saving…'
                        : savedKey === key
                          ? 'Saved'
                          : !counted
                            ? 'Not counted'
                            : left === 0
                              ? 'Sold out'
                              : `${left} left${held > 0 ? ` · ${held} held online` : ''}`}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
