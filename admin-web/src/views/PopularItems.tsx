import { useEffect, useMemo, useState } from 'react';
import {
  fetchHomePopularConfig,
  fetchShopCatalogProducts,
  resolveApiAssetUrl,
  updateHomePopularConfig,
  type HomePopularConfig,
  type ShopCatalogProduct,
} from '../api';

const CATEGORY_LABELS: Record<string, string> = {
  whole_cakes: 'Whole cakes',
  cake_slices: 'Cake slices',
  drinks: 'Drinks',
  specials: 'Specials',
};

function formatRm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Thumb({ url }: { url: string }) {
  return (
    <span className="catalogThumb">
      {url ? <img src={resolveApiAssetUrl(url)} alt="" /> : <span className="catalogThumbEmpty" aria-hidden>—</span>}
    </span>
  );
}

export function PopularItems() {
  const [products, setProducts] = useState<ShopCatalogProduct[] | null>(null);
  const [config, setConfig] = useState<HomePopularConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before the fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    Promise.all([fetchShopCatalogProducts(), fetchHomePopularConfig()])
      .then(([p, c]) => {
        setProducts(p);
        setConfig(c);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const productById = useMemo(() => {
    const map = new Map<string, ShopCatalogProduct>();
    for (const p of products ?? []) map.set(p.id, p);
    return map;
  }, [products]);

  const selected = useMemo(
    () => (config?.productIds ?? []).map((id) => productById.get(id)).filter((p): p is ShopCatalogProduct => Boolean(p)),
    [config, productById],
  );

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selectedIds = new Set(config?.productIds ?? []);
    return (products ?? [])
      .filter((p) => !selectedIds.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.categoryLabel ?? CATEGORY_LABELS[p.category]).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, config, search]);

  const maxLimit = config?.maxLimit ?? 5;
  const atMax = selected.length >= maxLimit;

  function mutate(nextIds: string[], nextMax = maxLimit) {
    setConfig((c) => (c ? { ...c, productIds: nextIds, maxLimit: nextMax } : c));
  }

  function addProduct(id: string) {
    if (!config || atMax) return;
    mutate([...config.productIds, id]);
  }

  function removeProduct(id: string) {
    if (!config) return;
    mutate(config.productIds.filter((pid) => pid !== id));
  }

  function move(index: number, dir: -1 | 1) {
    if (!config) return;
    const next = [...config.productIds];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  }

  function setMaxLimit(n: number) {
    if (!config) return;
    const clamped = Math.min(100, Math.max(1, n));
    const trimmed = config.productIds.slice(0, clamped);
    mutate(trimmed, clamped);
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateHomePopularConfig(config);
      setConfig(saved);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="viewMuted">Loading…</p>;
  if (error) return <p className="viewError">{error}</p>;
  if (!config || !products) return null;

  return (
    <div className="viewStack">
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2 className="panelTitle">Popular items</h2>
            <p className="viewMuted" style={{ margin: '4px 0 0' }}>
              Shown as "Popular this week" on the member app home screen.
            </p>
          </div>
          <div className="panelHeadActions">
            <label className="filterField" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              Max shown
              <input
                type="number" min={1} max={100} step={1} value={maxLimit} style={{ width: 64 }}
                onChange={(e) => setMaxLimit(Number(e.target.value) || 1)}
              />
            </label>
            <button type="button" className="toolbarButton toolbarButton--primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {saveError ? <p className="viewError">{saveError}</p> : null}
        {!saveError && savedAt ? <p className="viewMuted">Saved.</p> : null}
      </section>

      <div className="panelGrid panelGrid--2">
        <section className="panel">
          <h2 className="panelTitle">Selected ({selected.length}/{maxLimit})</h2>
          <table className="dataTable">
            <thead>
              <tr>
                <th></th>
                <th></th>
                <th>Name</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {selected.map((p, i) => (
                <tr key={p.id}>
                  <td className="dataTableMuted">{i + 1}</td>
                  <td><Thumb url={p.imageUrl} /></td>
                  <td>
                    {p.name}
                    <div className="dataTableMuted">{p.categoryLabel || CATEGORY_LABELS[p.category]}</div>
                  </td>
                  <td>{p.priceDisplay || formatRm(p.basePriceCents)}</td>
                  <td>
                    <div className="rowActions">
                      <button type="button" className="rowActionBtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                      <button type="button" className="rowActionBtn" disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                      <button type="button" className="variantRemove" onClick={() => removeProduct(p.id)} aria-label="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {selected.length === 0 ? (
                <tr><td colSpan={5} className="dataTableEmpty">No items selected yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2 className="panelTitle">Catalog</h2>
          <input
            type="text" className="toolbarInput" style={{ maxWidth: 'none', marginBottom: 12 }}
            placeholder="Search name or category…" value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <table className="dataTable">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {available.map((p) => (
                <tr key={p.id}>
                  <td><Thumb url={p.imageUrl} /></td>
                  <td>
                    {p.name}
                    <div className="dataTableMuted">{p.categoryLabel || CATEGORY_LABELS[p.category]}</div>
                  </td>
                  <td>{p.priceDisplay || formatRm(p.basePriceCents)}</td>
                  <td>
                    <button type="button" className="toolbarButton" disabled={atMax} onClick={() => addProduct(p.id)}>
                      + Add
                    </button>
                  </td>
                </tr>
              ))}
              {available.length === 0 ? (
                <tr><td colSpan={4} className="dataTableEmpty">No matching products.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
