import { useCallback, useEffect, useState } from 'react';
import {
  fetchKitchenStock,
  setKitchenStockQty,
  type KitchenStockItem,
} from './api';
import { KitchenDayGrid } from './KitchenDayGrid';
import { OpsLoginScreen } from './OpsLoginScreen';
import { defaultBase } from './opsSession';
import { useOpsAuth } from './useOpsAuth';

const CATEGORY_LABEL: Record<string, string> = {
  whole_cakes: 'Whole cakes',
  cake_slices: 'Cake slices',
};

/** Kitchen staff set how many of each cake are ready right now (`#/kitchen`). */
export function KitchenWindowApp() {
  const { state: authState, signIn } = useOpsAuth();
  const [items, setItems] = useState<KitchenStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [view, setView] = useState<'today' | 'days'>('today');

  const load = useCallback(async () => {
    if (authState.status !== 'authenticated') return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchKitchenStock(
        authState.apiKey,
        authState.apiBase.trim() || defaultBase,
      );
      setItems(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load stock');
    } finally {
      setLoading(false);
    }
  }, [authState]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (id: string, qty: number) => {
      if (authState.status !== 'authenticated') return;
      setItems((cur) =>
        cur.map((it) => (it.id === id ? { ...it, availableQty: qty } : it)),
      );
      setSavingId(id);
      setErr(null);
      try {
        await setKitchenStockQty(
          authState.apiKey,
          id,
          qty,
          authState.apiBase.trim() || defaultBase,
        );
        setSavedId(id);
        window.setTimeout(
          () => setSavedId((cur) => (cur === id ? null : cur)),
          1500,
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to save');
        void load();
      } finally {
        setSavingId((cur) => (cur === id ? null : cur));
      }
    },
    [authState, load],
  );

  if (authState.status !== 'authenticated') {
    return (
      <OpsLoginScreen
        title="Kitchen stock"
        lead="Sign in with OPS_QUEUE_API_KEY to update how many cakes are ready."
        checking={authState.status === 'checking'}
        onSubmit={signIn}
      />
    );
  }

  const base = authState.apiBase.trim() || defaultBase;

  if (view === 'days') {
    return (
      <div className="kitchenPage">
        <div className="kitchenTabs">
          <button type="button" className="btnGhost" onClick={() => setView('today')}>
            ← Today's tray
          </button>
        </div>
        <KitchenDayGrid apiKey={authState.apiKey} apiBase={base} />
      </div>
    );
  }

  return (
    <div className="loginPage">
      <div className="loginCard" style={{ maxWidth: 520 }}>
        <div className="loginBrand">
          Moja <span>Kitchen</span>
        </div>
        <h1 className="loginTitle">Cake stock</h1>
        <button
          type="button"
          className="btnGhost"
          style={{ marginBottom: 8 }}
          onClick={() => setView('days')}
        >
          Next 7 days →
        </button>
        <p className="loginLead">
          Set how many of each cake are ready right now. The shop updates
          automatically.
        </p>
        {err ? <p className="err">{err}</p> : null}
        {loading ? <p className="loginLead">Loading…</p> : null}
        {!loading && items.length === 0 ? (
          <p className="loginLead">No cake products found.</p>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginTop: 12,
          }}
        >
          {items.map((it) => (
            <div
              key={it.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                border: '1px solid var(--border, #e5e5e5)',
                borderRadius: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{it.name}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {CATEGORY_LABEL[it.category] ?? it.category}
                  {it.soldOut ? ' · Sold out' : ''}
                  {savingId === it.id
                    ? ' · Saving…'
                    : savedId === it.id
                      ? ' · Saved'
                      : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="btnGhost"
                  disabled={savingId === it.id || (it.availableQty ?? 0) <= 0}
                  onClick={() =>
                    void save(it.id, Math.max(0, (it.availableQty ?? 0) - 1))
                  }
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={it.availableQty ?? 0}
                  onChange={(ev) => {
                    const n = Math.max(
                      0,
                      Math.round(Number(ev.target.value) || 0),
                    );
                    setItems((cur) =>
                      cur.map((x) =>
                        x.id === it.id ? { ...x, availableQty: n } : x,
                      ),
                    );
                  }}
                  onBlur={(ev) =>
                    void save(
                      it.id,
                      Math.max(0, Math.round(Number(ev.target.value) || 0)),
                    )
                  }
                  style={{ width: 64, textAlign: 'center' }}
                />
                <button
                  type="button"
                  className="btnGhost"
                  disabled={savingId === it.id}
                  onClick={() => void save(it.id, (it.availableQty ?? 0) + 1)}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
