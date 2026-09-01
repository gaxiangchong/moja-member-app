import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clearShopCatalogProductImage,
  createShopCatalogProduct,
  deleteShopCatalogProduct,
  fetchShopCatalogProducts,
  resolveApiAssetUrl,
  SHOP_CATALOG_CATEGORIES,
  updateShopCatalogProduct,
  uploadShopCatalogProductImage,
  type ShopCatalogCategory,
  type ShopCatalogProduct,
  type ShopCatalogProductInput,
} from '../api';

const CATEGORY_LABELS: Record<ShopCatalogCategory, string> = {
  whole_cakes: 'Whole cakes',
  cake_slices: 'Cake slices',
  drinks: 'Drinks',
  specials: 'Specials',
};

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function formatRm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function centsToRmInput(cents: number | undefined): string {
  return cents != null ? (cents / 100).toFixed(2) : '';
}

function rmInputToCents(value: string): number | null {
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

type VariantRow = { id?: string; label: string; priceRm: string; available: boolean };

type EditorForm = {
  category: ShopCatalogCategory;
  categoryLabel: string;
  name: string;
  shortDescription: string;
  description: string;
  priceRm: string;
  priceDisplay: string;
  badge: string;
  sortOrder: string;
  isActive: boolean;
  soldOut: boolean;
  imageOffsetX: number;
  imageOffsetY: number;
  imageScale: number;
  variants: VariantRow[];
};

function emptyForm(nextSortOrder: number): EditorForm {
  return {
    category: 'specials',
    categoryLabel: '',
    name: '',
    shortDescription: '',
    description: '',
    priceRm: '',
    priceDisplay: '',
    badge: '',
    sortOrder: String(nextSortOrder),
    isActive: true,
    soldOut: false,
    imageOffsetX: 50,
    imageOffsetY: 50,
    imageScale: 1,
    variants: [],
  };
}

function formFromProduct(p: ShopCatalogProduct): EditorForm {
  return {
    category: p.category,
    categoryLabel: p.categoryLabel ?? '',
    name: p.name,
    shortDescription: p.shortDescription ?? '',
    description: p.description ?? '',
    priceRm: centsToRmInput(p.basePriceCents),
    priceDisplay: p.priceDisplay ?? '',
    badge: p.badge ?? '',
    sortOrder: String(p.sortOrder ?? 0),
    isActive: p.isActive !== false,
    soldOut: Boolean(p.soldOut),
    imageOffsetX: p.imageOffsetX ?? 50,
    imageOffsetY: p.imageOffsetY ?? 50,
    imageScale: p.imageScale ?? 1,
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      label: v.label,
      priceRm: centsToRmInput(v.priceCents),
      available: v.available !== false,
    })),
  };
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="switchRow">
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switchTrack" aria-hidden />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function SalesCatalog() {
  const [products, setProducts] = useState<ShopCatalogProduct[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ShopCatalogCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'soldout'>('all');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopCatalogProduct | null>(null);
  const [form, setForm] = useState<EditorForm>(() => emptyForm(0));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before the fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    fetchShopCatalogProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load catalog'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => categoryFilter === 'all' || p.category === categoryFilter)
      .filter((p) => {
        if (statusFilter === 'active') return p.isActive !== false;
        if (statusFilter === 'inactive') return p.isActive === false;
        if (statusFilter === 'soldout') return Boolean(p.soldOut);
        return true;
      })
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [products, search, categoryFilter, statusFilter]);

  function openCreate() {
    const nextSort = products && products.length ? Math.max(...products.map((p) => p.sortOrder ?? 0)) + 10 : 0;
    setEditingProduct(null);
    setForm(emptyForm(nextSort));
    setFormError(null);
    setImageError(null);
    setSavedAt(null);
    setEditorOpen(true);
  }

  function openEdit(p: ShopCatalogProduct) {
    setEditingProduct(p);
    setForm(formFromProduct(p));
    setFormError(null);
    setImageError(null);
    setSavedAt(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
  }

  function updateVariant(index: number, patch: Partial<VariantRow>) {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  }

  function addVariant() {
    setForm((f) => ({ ...f, variants: [...f.variants, { label: '', priceRm: '', available: true }] }));
  }

  function removeVariant(index: number) {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setFormError(null);
    if (!form.name.trim()) return setFormError('Name is required.');
    const priceCents = rmInputToCents(form.priceRm);
    if (priceCents == null) return setFormError('Base price must be a valid amount.');
    for (const v of form.variants) {
      if (!v.label.trim()) return setFormError('Every variant needs a label.');
      if (rmInputToCents(v.priceRm) == null) return setFormError(`Variant "${v.label}" needs a valid price.`);
    }

    const input: ShopCatalogProductInput = {
      category: form.category,
      categoryLabel: form.categoryLabel.trim() || undefined,
      name: form.name.trim(),
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      imageUrl: editingProduct?.imageUrl ?? '',
      imageOffsetX: form.imageOffsetX,
      imageOffsetY: form.imageOffsetY,
      imageScale: form.imageScale,
      basePriceCents: priceCents,
      priceDisplay: form.priceDisplay.trim() || undefined,
      badge: form.badge.trim() || undefined,
      sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
      isActive: form.isActive,
      soldOut: form.soldOut,
      variants: form.variants.map((v) => ({
        id: v.id,
        label: v.label.trim(),
        priceCents: rmInputToCents(v.priceRm) ?? 0,
        available: v.available,
      })),
    };

    setSaving(true);
    try {
      const saved = editingProduct
        ? await updateShopCatalogProduct(editingProduct.id, input)
        : await createShopCatalogProduct(input);
      setEditingProduct(saved);
      setForm(formFromProduct(saved));
      setProducts((prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx < 0) return [...prev, saved];
        return prev.map((p) => (p.id === saved.id ? saved : p));
      });
      setSavedAt(Date.now());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingProduct) return;
    if (!window.confirm(`Delete "${editingProduct.name}"? This can't be undone.`)) return;
    setSaving(true);
    try {
      await deleteShopCatalogProduct(editingProduct.id);
      setProducts((prev) => (prev ? prev.filter((p) => p.id !== editingProduct.id) : prev));
      closeEditor();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete product');
    } finally {
      setSaving(false);
    }
  }

  async function handleImageFile(file: File) {
    if (!editingProduct) return;
    setImageError(null);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setImageError('Unsupported image type. Use PNG, JPEG, WEBP, or GIF.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Image too large. Max 5 MB.');
      return;
    }
    setImageBusy(true);
    try {
      const updated = await uploadShopCatalogProductImage(editingProduct.id, file);
      setEditingProduct(updated);
      setProducts((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setImageBusy(false);
    }
  }

  async function handleRemoveImage() {
    if (!editingProduct) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const updated = await clearShopCatalogProductImage(editingProduct.id);
      setEditingProduct(updated);
      setProducts((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to remove image');
    } finally {
      setImageBusy(false);
    }
  }

  const previewImageUrl = editingProduct?.imageUrl ? resolveApiAssetUrl(editingProduct.imageUrl) : '';

  return (
    <div className="viewStack">
      <div className="filterGrid">
        <label className="filterField">
          Search
          <input
            type="text"
            placeholder="Product name or id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="filterField">
          Category
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}>
            <option value="all">All categories</option>
            {SHOP_CATALOG_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label className="filterField">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="soldout">Sold out</option>
          </select>
        </label>
        <button type="button" className="toolbarButton toolbarButton--primary filterSubmit" onClick={openCreate}>
          + New product
        </button>
      </div>

      {loading ? <p className="viewMuted">Loading…</p> : null}
      {error ? <p className="viewError">{error}</p> : null}

      {!loading && !error ? (
        <section className="panel">
          <table className="dataTable">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Status</th>
                <th>Sort</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="dataTableRowClickable" onClick={() => openEdit(p)}>
                  <td>
                    <span className="catalogThumb">
                      {p.imageUrl ? (
                        <img src={resolveApiAssetUrl(p.imageUrl)} alt="" />
                      ) : (
                        <span className="catalogThumbEmpty" aria-hidden>—</span>
                      )}
                    </span>
                  </td>
                  <td>
                    {p.name}
                    {p.badge ? <span className="badge badge--neutral" style={{ marginLeft: 8 }}>{p.badge}</span> : null}
                  </td>
                  <td>{p.categoryLabel || CATEGORY_LABELS[p.category]}</td>
                  <td>{p.priceDisplay || formatRm(p.basePriceCents)}</td>
                  <td>
                    <span className={`badge badge--${p.isActive === false ? 'neutral' : 'success'}`}>
                      {p.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                    {p.soldOut ? <span className="badge badge--danger" style={{ marginLeft: 6 }}>Sold out</span> : null}
                  </td>
                  <td>{p.sortOrder}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="dataTableEmpty">No products match these filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {editorOpen ? (
        <div className="drawerBackdrop" onMouseDown={closeEditor}>
          <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawerHead">
              <h2 className="panelTitle">{editingProduct ? 'Edit product' : 'New product'}</h2>
              <button type="button" className="drawerClose" onClick={closeEditor} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="drawerBody">
              <section>
                <h3 className="drawerSectionTitle">Photo</h3>
                {editingProduct ? (
                  <>
                    <div
                      className={`imageDropzone${dragOver ? ' dragOver' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) void handleImageFile(file);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {previewImageUrl ? (
                        <div className="imageFocalFrame">
                          <img
                            src={previewImageUrl}
                            alt=""
                            style={{
                              objectPosition: `${form.imageOffsetX}% ${form.imageOffsetY}%`,
                              transform: `scale(${form.imageScale})`,
                              transformOrigin: `${form.imageOffsetX}% ${form.imageOffsetY}%`,
                            }}
                          />
                        </div>
                      ) : (
                        <p className="imageDropzoneHint">
                          {imageBusy ? 'Uploading…' : 'Click or drag a photo here — PNG, JPEG, WEBP, or GIF, max 5 MB'}
                        </p>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void handleImageFile(file);
                        }}
                      />
                    </div>
                    {imageError ? <p className="viewError">{imageError}</p> : null}
                    {previewImageUrl ? (
                      <>
                        <div className="focalSliders">
                          <label className="filterField">
                            Focal point — horizontal
                            <input
                              type="range" min={0} max={100} value={form.imageOffsetX}
                              onChange={(e) => setForm((f) => ({ ...f, imageOffsetX: Number(e.target.value) }))}
                            />
                          </label>
                          <label className="filterField">
                            Focal point — vertical
                            <input
                              type="range" min={0} max={100} value={form.imageOffsetY}
                              onChange={(e) => setForm((f) => ({ ...f, imageOffsetY: Number(e.target.value) }))}
                            />
                          </label>
                          <label className="filterField">
                            Zoom
                            <input
                              type="range" min={1} max={3} step={0.1} value={form.imageScale}
                              onChange={(e) => setForm((f) => ({ ...f, imageScale: Number(e.target.value) }))}
                            />
                          </label>
                        </div>
                        <div className="drawerRowActions">
                          <button type="button" className="toolbarButton" onClick={() => fileInputRef.current?.click()} disabled={imageBusy}>
                            Replace photo
                          </button>
                          <button type="button" className="toolbarButton" onClick={handleRemoveImage} disabled={imageBusy}>
                            Remove photo
                          </button>
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <p className="viewMuted">Save the product first, then upload its photo.</p>
                )}
              </section>

              <section>
                <h3 className="drawerSectionTitle">Details</h3>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Category
                    <select
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ShopCatalogCategory }))}
                    >
                      {SHOP_CATALOG_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="filterField">
                    Category label shown to customers (optional)
                    <input
                      type="text" maxLength={80} placeholder={CATEGORY_LABELS[form.category]}
                      value={form.categoryLabel}
                      onChange={(e) => setForm((f) => ({ ...f, categoryLabel: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="filterField" style={{ marginTop: 12 }}>
                  Name
                  <input
                    type="text" maxLength={200} value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="filterField" style={{ marginTop: 12 }}>
                  Short description <span className="viewMuted">— shown on the product card</span>
                  <input
                    type="text" maxLength={500} value={form.shortDescription}
                    onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
                  />
                </label>
                <label className="filterField" style={{ marginTop: 12 }}>
                  Full description
                  <textarea
                    rows={4} maxLength={4000} value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </label>
                <label className="filterField" style={{ marginTop: 12 }}>
                  Badge <span className="viewMuted">— optional, e.g. "New"</span>
                  <input
                    type="text" maxLength={80} value={form.badge}
                    onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                  />
                </label>
              </section>

              <section>
                <h3 className="drawerSectionTitle">Price</h3>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Base price (RM)
                    <input
                      type="number" min={0} step="0.01" value={form.priceRm}
                      onChange={(e) => setForm((f) => ({ ...f, priceRm: e.target.value }))}
                    />
                  </label>
                  <label className="filterField">
                    Price label override <span className="viewMuted">— optional, e.g. "from RM13.90"</span>
                    <input
                      type="text" maxLength={40} value={form.priceDisplay}
                      onChange={(e) => setForm((f) => ({ ...f, priceDisplay: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="variantList">
                  {form.variants.map((v, i) => (
                    <div className="variantRow" key={i}>
                      <input
                        type="text" placeholder="Size / label" value={v.label}
                        onChange={(e) => updateVariant(i, { label: e.target.value })}
                      />
                      <input
                        type="number" min={0} step="0.01" placeholder="RM" value={v.priceRm}
                        onChange={(e) => updateVariant(i, { priceRm: e.target.value })}
                      />
                      <Toggle checked={v.available} onChange={(val) => updateVariant(i, { available: val })} label="Available" />
                      <button type="button" className="variantRemove" onClick={() => removeVariant(i)} aria-label="Remove variant">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button type="button" className="toolbarButton" onClick={addVariant}>+ Add size / variant</button>
                </div>
              </section>

              <section>
                <h3 className="drawerSectionTitle">Visibility</h3>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Sort order <span className="viewMuted">— lower shows first</span>
                    <input
                      type="number" value={form.sortOrder}
                      onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="drawerRowActions" style={{ marginTop: 10 }}>
                  <Toggle checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} label="Show in shop" />
                  <Toggle checked={form.soldOut} onChange={(v) => setForm((f) => ({ ...f, soldOut: v }))} label="Sold out" />
                </div>
              </section>
            </div>

            <div className="drawerFooter">
              <div>
                {formError ? <span className="viewError">{formError}</span> : null}
                {!formError && savedAt ? <span className="viewMuted">Saved.</span> : null}
              </div>
              <div className="drawerRowActions">
                {editingProduct ? (
                  <button type="button" className="toolbarButton" onClick={handleDelete} disabled={saving}>
                    Delete
                  </button>
                ) : null}
                <button type="button" className="toolbarButton toolbarButton--primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : editingProduct ? 'Save changes' : 'Create product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
