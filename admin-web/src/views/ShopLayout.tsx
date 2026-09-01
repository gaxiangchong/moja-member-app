import { useEffect, useMemo, useState } from 'react';
import {
  fetchShopCatalogLayout,
  fetchShopCatalogProducts,
  resolveApiAssetUrl,
  updateShopCatalogLayout,
  type ShopCatalogLayout,
  type ShopCatalogProduct,
  type ShopCatalogSection,
} from '../api';

const CATEGORY_LABELS: Record<string, string> = {
  whole_cakes: 'Whole cakes',
  cake_slices: 'Cake slices',
  drinks: 'Drinks',
  specials: 'Specials',
};

const MAX_FEATURED = 24;

function formatRm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function slugify(input: string): string {
  const base = input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return base || 'section';
}

function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function Thumb({ url }: { url: string }) {
  return (
    <span className="catalogThumb">
      {url ? <img src={resolveApiAssetUrl(url)} alt="" /> : <span className="catalogThumbEmpty" aria-hidden>—</span>}
    </span>
  );
}

/** Selected (reorderable) + searchable catalog, used for both home-featured and per-section product picks. */
function ProductPicker({
  products,
  selectedIds,
  onChange,
  cap,
}: {
  products: ShopCatalogProduct[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  cap?: number;
}) {
  const [search, setSearch] = useState('');
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const selected = selectedIds.map((id) => productById.get(id)).filter((p): p is ShopCatalogProduct => Boolean(p));
  const atCap = cap != null && selected.length >= cap;

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selSet = new Set(selectedIds);
    return products
      .filter((p) => !selSet.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.categoryLabel ?? CATEGORY_LABELS[p.category]).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, selectedIds, search]);

  function move(index: number, dir: -1 | 1) {
    const next = [...selectedIds];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="panelGrid panelGrid--2">
      <div>
        <h3 className="drawerSectionTitle">Selected ({selected.length}{cap != null ? `/${cap}` : ''})</h3>
        <table className="dataTable">
          <thead>
            <tr><th></th><th></th><th>Name</th><th></th></tr>
          </thead>
          <tbody>
            {selected.map((p, i) => (
              <tr key={p.id}>
                <td className="dataTableMuted">{i + 1}</td>
                <td><Thumb url={p.imageUrl} /></td>
                <td>
                  {p.name}
                  <div className="dataTableMuted">
                    {p.categoryLabel || CATEGORY_LABELS[p.category]} · {p.priceDisplay || formatRm(p.basePriceCents)}
                  </div>
                </td>
                <td>
                  <div className="rowActions">
                    <button type="button" className="rowActionBtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button type="button" className="rowActionBtn" disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                    <button type="button" className="variantRemove" onClick={() => onChange(selectedIds.filter((id) => id !== p.id))} aria-label="Remove">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {selected.length === 0 ? <tr><td colSpan={4} className="dataTableEmpty">Nothing selected yet.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="drawerSectionTitle">Catalog</h3>
        <input
          type="text" className="toolbarInput" style={{ maxWidth: 'none', marginBottom: 12 }}
          placeholder="Search name or category…" value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <table className="dataTable">
          <thead>
            <tr><th></th><th>Name</th><th></th></tr>
          </thead>
          <tbody>
            {available.map((p) => (
              <tr key={p.id}>
                <td><Thumb url={p.imageUrl} /></td>
                <td>
                  {p.name}
                  <div className="dataTableMuted">
                    {p.categoryLabel || CATEGORY_LABELS[p.category]} · {p.priceDisplay || formatRm(p.basePriceCents)}
                  </div>
                </td>
                <td>
                  <button type="button" className="toolbarButton" disabled={atCap} onClick={() => onChange([...selectedIds, p.id])}>
                    + Add
                  </button>
                </td>
              </tr>
            ))}
            {available.length === 0 ? <tr><td colSpan={3} className="dataTableEmpty">No matching products.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SectionForm = {
  id: string;
  title: string;
  description: string;
  productIds: string[];
  idTouched: boolean;
};

function sectionFormFromSection(s: ShopCatalogSection): SectionForm {
  return { id: s.id, title: s.title, description: s.description, productIds: s.productIds, idTouched: true };
}

export function ShopLayout() {
  const [products, setProducts] = useState<ShopCatalogProduct[] | null>(null);
  const [layout, setLayoutState] = useState<ShopCatalogLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [sectionEditorOpen, setSectionEditorOpen] = useState(false);
  const [sectionForm, setSectionForm] = useState<SectionForm | null>(null);
  const [sectionFormError, setSectionFormError] = useState<string | null>(null);
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before the fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    Promise.all([fetchShopCatalogProducts(), fetchShopCatalogLayout()])
      .then(([p, l]) => {
        setProducts(p);
        setLayoutState(l);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveLayout() {
    if (!layout) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateShopCatalogLayout(layout);
      setLayoutState(saved);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save layout');
    } finally {
      setSaving(false);
    }
  }

  function openNewSection() {
    setEditingSectionIndex(null);
    setSectionForm({ id: '', title: '', description: '', productIds: [], idTouched: false });
    setSectionFormError(null);
    setSectionEditorOpen(true);
  }

  function openEditSection(index: number) {
    if (!layout) return;
    setEditingSectionIndex(index);
    setSectionForm(sectionFormFromSection(layout.shopSections[index]));
    setSectionFormError(null);
    setSectionEditorOpen(true);
  }

  function closeSectionEditor() {
    setSectionEditorOpen(false);
  }

  function applySection() {
    if (!layout || !sectionForm) return;
    setSectionFormError(null);
    if (!sectionForm.title.trim()) return setSectionFormError('Title is required.');
    const id = sectionForm.id.trim() || slugify(sectionForm.title);
    const existingIds = new Set(
      layout.shopSections
        .filter((_, i) => i !== editingSectionIndex)
        .map((s) => s.id),
    );
    if (existingIds.has(id)) return setSectionFormError(`Section id "${id}" is already used by another section.`);

    const next: ShopCatalogSection = {
      id,
      title: sectionForm.title.trim(),
      description: sectionForm.description.trim(),
      productIds: sectionForm.productIds,
    };
    const nextSections = [...layout.shopSections];
    if (editingSectionIndex == null) nextSections.push(next);
    else nextSections[editingSectionIndex] = next;
    setLayoutState({ ...layout, shopSections: nextSections });
    setSectionEditorOpen(false);
  }

  function removeSection() {
    if (!layout || editingSectionIndex == null) return;
    if (!window.confirm('Remove this section from the layout? Click "Save layout" to make it permanent.')) return;
    setLayoutState({ ...layout, shopSections: layout.shopSections.filter((_, i) => i !== editingSectionIndex) });
    setSectionEditorOpen(false);
  }

  if (loading) return <p className="viewMuted">Loading…</p>;
  if (error) return <p className="viewError">{error}</p>;
  if (!layout || !products) return null;

  return (
    <div className="viewStack">
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2 className="panelTitle">Shop layout</h2>
            <p className="viewMuted" style={{ margin: '4px 0 0' }}>
              Drives the public shop website's home "Best sellers" grid and the /shop page sections — same catalog as the products above.
            </p>
          </div>
          <button type="button" className="toolbarButton toolbarButton--primary" onClick={handleSaveLayout} disabled={saving}>
            {saving ? 'Saving…' : 'Save layout'}
          </button>
        </div>
        {saveError ? <p className="viewError">{saveError}</p> : null}
        {!saveError && savedAt ? <p className="viewMuted">Saved.</p> : null}
      </section>

      <section className="panel">
        <h2 className="panelTitle">Home featured products</h2>
        <p className="viewMuted" style={{ marginTop: 4 }}>
          Shown on the shop site's home page "Best sellers" grid. Up to {MAX_FEATURED}. Falls back to Popular items when empty.
        </p>
        <div style={{ marginTop: 12 }}>
          <ProductPicker
            products={products}
            selectedIds={layout.homeFeaturedProductIds}
            onChange={(ids) => setLayoutState({ ...layout, homeFeaturedProductIds: ids })}
            cap={MAX_FEATURED}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Shop page sections</h2>
          <button type="button" className="toolbarButton" onClick={openNewSection}>+ Add section</button>
        </div>
        <table className="dataTable">
          <thead>
            <tr><th>Section id</th><th>Title</th><th>Description</th><th>Products</th></tr>
          </thead>
          <tbody>
            {layout.shopSections.map((s, i) => (
              <tr key={s.id} className="dataTableRowClickable" onClick={() => openEditSection(i)}>
                <td className="dataTableMuted">{s.id}</td>
                <td>{s.title}</td>
                <td className="dataTableMuted" style={{ maxWidth: 320, whiteSpace: 'normal' }}>{s.description || '—'}</td>
                <td>{s.productIds.length}</td>
              </tr>
            ))}
            {layout.shopSections.length === 0 ? (
              <tr><td colSpan={4} className="dataTableEmpty">No sections yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {sectionEditorOpen && sectionForm ? (
        <div className="drawerBackdrop" onMouseDown={closeSectionEditor}>
          <div className="drawer" style={{ width: 'min(880px, 100vw)' }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawerHead">
              <h2 className="panelTitle">{editingSectionIndex == null ? 'New section' : 'Edit section'}</h2>
              <button type="button" className="drawerClose" onClick={closeSectionEditor} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="drawerBody">
              <section>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Title
                    <input
                      type="text" maxLength={120} value={sectionForm.title}
                      onChange={(e) => {
                        const title = e.target.value;
                        setSectionForm((f) => {
                          if (!f) return f;
                          const nextId = f.idTouched
                            ? f.id
                            : uniqueSlug(
                                slugify(title),
                                new Set(layout.shopSections.filter((_, i) => i !== editingSectionIndex).map((s) => s.id)),
                              );
                          return { ...f, title, id: nextId };
                        });
                      }}
                    />
                  </label>
                  <label className="filterField">
                    Section id (URL anchor)
                    <input
                      type="text" maxLength={64} value={sectionForm.id}
                      onChange={(e) => setSectionForm((f) => (f ? { ...f, id: e.target.value, idTouched: true } : f))}
                    />
                  </label>
                </div>
                <label className="filterField" style={{ marginTop: 12 }}>
                  Description
                  <textarea
                    rows={3} maxLength={2000} value={sectionForm.description}
                    onChange={(e) => setSectionForm((f) => (f ? { ...f, description: e.target.value } : f))}
                  />
                </label>
              </section>

              <section>
                <h3 className="drawerSectionTitle">Products in this section</h3>
                <ProductPicker
                  products={products}
                  selectedIds={sectionForm.productIds}
                  onChange={(ids) => setSectionForm((f) => (f ? { ...f, productIds: ids } : f))}
                />
              </section>
            </div>

            <div className="drawerFooter">
              <div>
                {sectionFormError ? (
                  <span className="viewError">{sectionFormError}</span>
                ) : (
                  <span className="viewMuted">Click "Save layout" above to make this permanent.</span>
                )}
              </div>
              <div className="drawerRowActions">
                {editingSectionIndex != null ? (
                  <button type="button" className="toolbarButton" onClick={removeSection}>Remove section</button>
                ) : null}
                <button type="button" className="toolbarButton toolbarButton--primary" onClick={applySection}>
                  {editingSectionIndex == null ? 'Add section' : 'Apply changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
