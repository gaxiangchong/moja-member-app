import { useEffect, useMemo, useRef, useState } from 'react';
import {
  checkSalesplayCodes,
  clearShopCatalogProductImage,
  createShopCatalogProduct,
  deleteShopCatalogProduct,
  fetchSalesplayCodeSuggestions,
  type SalesplayCodeCheck,
  fetchShopCatalogProducts,
  resolveApiAssetUrl,
  SHOP_CATALOG_CATEGORIES,
  updateShopCatalogProduct,
  uploadShopCatalogProductImage,
  type ShopCatalogCategory,
  type ShopCatalogProduct,
  type ShopCatalogProductInput,
} from '../api';
import { SalesplayStatusCard } from './SalesplayStatusCard';
import { SalesplaySync } from './SalesplaySync';

type CodeVerdict = { tone: 'ok' | 'warn' | 'bad'; text: string };

/**
 * What a code check means for one code box. `self` is the product (and size)
 * being edited, so it is not reported as a clash with itself.
 */
function codeVerdict(
  check: SalesplayCodeCheck | undefined,
  self: { productId: string; variantLabel: string | null },
  listUploadedAt: string | null,
): CodeVerdict | null {
  if (!check) return null;
  const others = check.usedBy.filter(
    (u) => !(u.productId === self.productId && (u.variantLabel ?? null) === self.variantLabel),
  );
  if (others.length > 0) {
    const o = others[0];
    return { tone: 'bad', text: `Already used by ${o.name}${o.variantLabel ? ` · ${o.variantLabel}` : ''}.` };
  }
  const sold = check.tillSales > 0 ? ` Sold at the till ${check.tillSales}×.` : '';
  if (check.inProductList === true) {
    return check.productListEnabled === false
      ? { tone: 'warn', text: `In SalesPlay as “${check.productListName}”, but disabled there.${sold}` }
      : { tone: 'ok', text: `SalesPlay: ${check.productListName}.${sold}` };
  }
  if (check.inProductList === false) {
    const when = listUploadedAt ? ` (uploaded ${new Date(listUploadedAt).toLocaleDateString()})` : '';
    return check.tillSales > 0
      ? { tone: 'warn', text: `Not in the SalesPlay product list${when}, but sold at the till ${check.tillSales}× as “${check.tillName}”. Upload a newer product list to confirm.` }
      : { tone: 'bad', text: `Not found in the SalesPlay product list${when} and never sold at the till. Check for a typo.` };
  }
  // No product list uploaded: till receipts are the only evidence.
  return check.tillSales > 0
    ? { tone: 'ok', text: `Sold at the till ${check.tillSales}× as “${check.tillName}”.` }
    : { tone: 'warn', text: 'Not seen on any till receipt yet. Upload the SalesPlay product list (Sync with SalesPlay) to check it.' };
}

/** The "!" shown beside a missing or doubtful code. */
function CodeAlert({ tone, title }: { tone: 'warn' | 'bad'; title: string }) {
  return (
    <span className={tone === 'bad' ? 'codeAlert codeAlert--danger' : 'codeAlert'} title={title} aria-label={title} role="img">
      !
    </span>
  );
}

function CodeCheckLine({ verdict }: { verdict: CodeVerdict | null }) {
  if (!verdict) return null;
  return (
    <p className={`codeCheck codeCheck--${verdict.tone}`}>
      {verdict.tone === 'ok' ? <span aria-hidden>✓</span> : <CodeAlert tone={verdict.tone} title={verdict.text} />}
      <span>{verdict.text}</span>
    </p>
  );
}

const CATEGORY_LABELS: Record<ShopCatalogCategory, string> = {
  whole_cakes: 'Whole cakes',
  cake_slices: 'Cake slices',
  drinks: 'Drinks',
  specials: 'Specials',
  cookies: 'Cookies',
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

/**
 * How well a product is linked to the SalesPlay POS: how many of its sellable
 * units (the product, or each size) have no code, and which codes it has.
 */
function posCodeStatus(p: ShopCatalogProduct): { missing: number; total: number; codes: string[] } {
  const productCode = p.salesplayProductCode?.trim() || '';
  const variants = p.variants ?? [];
  if (variants.length === 0) {
    return { missing: productCode ? 0 : 1, total: 1, codes: productCode ? [productCode] : [] };
  }
  const codes: string[] = [];
  let missing = 0;
  for (const v of variants) {
    const own = p.salesplayVariantCodes?.[v.label]?.trim() || '';
    if (own) codes.push(own);
    else if (!productCode) missing += 1;
  }
  if (productCode) codes.unshift(productCode);
  return { missing, total: variants.length, codes };
}

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

type VariantRow = { id?: string; label: string; priceRm: string; available: boolean; salesplayCode: string };

type EditorForm = {
  /** Product ID (slug). Editable only while creating. */
  id: string;
  /** SalesPlay POS product code for the whole product. */
  salesplayCode: string;
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
  shippable: boolean;
  imageOffsetX: number;
  imageOffsetY: number;
  imageScale: number;
  variants: VariantRow[];
};

function emptyForm(nextSortOrder: number): EditorForm {
  return {
    id: '',
    salesplayCode: '',
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
    shippable: false,
    imageOffsetX: 50,
    imageOffsetY: 50,
    imageScale: 1,
    variants: [],
  };
}

function formFromProduct(p: ShopCatalogProduct): EditorForm {
  return {
    id: p.id,
    salesplayCode: p.salesplayProductCode ?? '',
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
    shippable: Boolean(p.shippable),
    imageOffsetX: p.imageOffsetX ?? 50,
    imageOffsetY: p.imageOffsetY ?? 50,
    imageScale: p.imageScale ?? 1,
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      label: v.label,
      priceRm: centsToRmInput(v.priceCents),
      available: v.available !== false,
      salesplayCode: p.salesplayVariantCodes?.[v.label] ?? '',
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'soldout' | 'nocode' | 'shippable' | 'localonly'>('all');
  const [section, setSection] = useState<'products' | 'sync'>('products');
  const [codeSuggestions, setCodeSuggestions] = useState<string[]>([]);

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
  /** Results of "Check codes with SalesPlay", keyed by lower-case code. */
  const [codeChecks, setCodeChecks] = useState<Record<string, SalesplayCodeCheck>>({});
  const [codeListUploadedAt, setCodeListUploadedAt] = useState<string | null>(null);
  const [checkingCodes, setCheckingCodes] = useState(false);
  const [codeCheckError, setCodeCheckError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before the fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    fetchShopCatalogProducts()
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load catalog'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Suggestions are a convenience; the field still works without them.
    fetchSalesplayCodeSuggestions().then(setCodeSuggestions).catch(() => undefined);
  }, []);

  async function reloadProducts() {
    setProducts(await fetchShopCatalogProducts());
  }

  const missingCodeCount = useMemo(
    () => (products ?? []).filter((p) => p.isActive !== false && posCodeStatus(p).missing > 0).length,
    [products],
  );

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => categoryFilter === 'all' || p.category === categoryFilter)
      .filter((p) => {
        if (statusFilter === 'active') return p.isActive !== false;
        if (statusFilter === 'inactive') return p.isActive === false;
        if (statusFilter === 'soldout') return Boolean(p.soldOut);
        if (statusFilter === 'shippable') return Boolean(p.shippable);
        if (statusFilter === 'localonly') return !p.shippable;
        if (statusFilter === 'nocode') return posCodeStatus(p).missing > 0;
        return true;
      })
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          posCodeStatus(p).codes.some((c) => c.toLowerCase().includes(q)),
      )
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
    setCodeChecks({});
    setCodeCheckError(null);
  }

  function openEdit(p: ShopCatalogProduct) {
    const next = formFromProduct(p);
    setEditingProduct(p);
    setForm(next);
    setFormError(null);
    setImageError(null);
    setSavedAt(null);
    setEditorOpen(true);
    setCodeChecks({});
    void runCodeCheck(next);
  }

  /** Every code typed in the editor: the product's own, then each size's. */
  function formCodes(f: EditorForm): string[] {
    return [f.salesplayCode, ...f.variants.map((v) => v.salesplayCode)].map((c) => c.trim()).filter(Boolean);
  }

  /** Looks the editor's codes up in the SalesPlay product list and till receipts. */
  async function runCodeCheck(f: EditorForm = form) {
    const codes = formCodes(f);
    setCodeCheckError(null);
    if (codes.length === 0) {
      setCodeChecks({});
      return;
    }
    setCheckingCodes(true);
    try {
      const res = await checkSalesplayCodes(codes);
      setCodeChecks(Object.fromEntries(res.results.map((r) => [r.code.toLowerCase(), r])));
      setCodeListUploadedAt(res.productListUploadedAt);
    } catch (err) {
      setCodeCheckError(err instanceof Error ? err.message : 'Could not check the codes');
    } finally {
      setCheckingCodes(false);
    }
  }

  const editingId = editingProduct?.id ?? form.id.trim();
  const verdictFor = (code: string, variantLabel: string | null): CodeVerdict | null =>
    code.trim()
      ? codeVerdict(codeChecks[code.trim().toLowerCase()], { productId: editingId, variantLabel }, codeListUploadedAt)
      : null;

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
    setForm((f) => ({ ...f, variants: [...f.variants, { label: '', priceRm: '', available: true, salesplayCode: '' }] }));
  }

  function removeVariant(index: number) {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setFormError(null);
    if (!form.name.trim()) return setFormError('Name is required.');
    const priceCents = rmInputToCents(form.priceRm);
    if (priceCents == null) return setFormError('Base price must be a valid amount.');
    const slug = form.id.trim();
    if (!editingProduct && slug && !SLUG_RE.test(slug)) {
      return setFormError('Product ID can only use lowercase letters, numbers, "-" and "_".');
    }
    for (const v of form.variants) {
      if (!v.label.trim()) return setFormError('Every variant needs a label.');
      if (rmInputToCents(v.priceRm) == null) return setFormError(`Variant "${v.label}" needs a valid price.`);
    }

    const variantCodes: Record<string, string> = {};
    for (const v of form.variants) {
      if (v.label.trim() && v.salesplayCode.trim()) variantCodes[v.label.trim()] = v.salesplayCode.trim();
    }
    const input: ShopCatalogProductInput = {
      ...(editingProduct || !slug ? {} : { id: slug }),
      salesplayProductCode: form.salesplayCode.trim(),
      salesplayVariantCodes: variantCodes,
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
      shippable: form.shippable,
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

  /** Quick switch from the list: flips one product's shipping flag without opening the editor. */
  async function setShippable(p: ShopCatalogProduct, value: boolean) {
    setProducts((prev) => (prev ? prev.map((x) => (x.id === p.id ? { ...x, shippable: value } : x)) : prev));
    try {
      const saved = await updateShopCatalogProduct(p.id, { shippable: value });
      setProducts((prev) => (prev ? prev.map((x) => (x.id === saved.id ? saved : x)) : prev));
    } catch (err) {
      setProducts((prev) => (prev ? prev.map((x) => (x.id === p.id ? { ...x, shippable: !value } : x)) : prev));
      setError(err instanceof Error ? err.message : 'Could not update shipping for this product');
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

  const switcher = (
    <div className="drawerRowActions">
      <button
        type="button"
        className={section === 'products' ? 'toolbarButton toolbarButton--primary' : 'toolbarButton'}
        onClick={() => setSection('products')}
      >
        Products
      </button>
      <button
        type="button"
        className={section === 'sync' ? 'toolbarButton toolbarButton--primary' : 'toolbarButton'}
        onClick={() => setSection('sync')}
      >
        Sync with SalesPlay
      </button>
    </div>
  );

  if (section === 'sync') {
    return (
      <div className="viewStack">
        {switcher}
        <SalesplayStatusCard />
        <SalesplaySync products={products ?? []} onCatalogChanged={reloadProducts} />
      </div>
    );
  }

  return (
    <div className="viewStack">
      {switcher}
      <SalesplayStatusCard />
      {missingCodeCount > 0 ? (
        <p className="viewMuted" style={{ background: '#fffbeb', padding: '10px 12px', borderRadius: 8, margin: 0 }}>
          <strong>{missingCodeCount} live product{missingCodeCount === 1 ? ' has' : 's have'} no SalesPlay code.</strong>{' '}
          Without it, online orders can't be pushed to the POS and in-store sales won't add up with online in reports.{' '}
          <button type="button" className="toolbarButton" onClick={() => setSection('sync')}>
            Sync with SalesPlay
          </button>{' '}
          <button type="button" className="toolbarButton" onClick={() => setStatusFilter('nocode')}>
            Show them
          </button>
        </p>
      ) : null}
      <datalist id="salesplayCodeList">
        {codeSuggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="filterGrid">
        <label className="filterField">
          Search
          <input
            type="text"
            placeholder="Name, product ID or SalesPlay code"
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
            <option value="nocode">No SalesPlay code</option>
            <option value="shippable">Ships nationwide</option>
            <option value="localonly">Local only (no shipping)</option>
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
                <th>SalesPlay code</th>
                <th>Status</th>
                <th title="Can be posted anywhere in the country">Ships nationwide</th>
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
                    {(() => {
                      const st = posCodeStatus(p);
                      const shown = st.codes.slice(0, 2).join(', ');
                      return (
                        <>
                          {st.missing > 0 ? (
                            <CodeAlert
                              tone="warn"
                              title="Missing SalesPlay code — till sales can't be matched to this product, so they won't come off kitchen stock or show in reports"
                            />
                          ) : null}
                          {st.codes.length ? (
                            <code title={st.codes.join(', ')} style={{ marginLeft: st.missing > 0 ? 6 : 0 }}>
                              {shown}{st.codes.length > 2 ? ` +${st.codes.length - 2}` : ''}
                            </code>
                          ) : null}
                          {st.missing > 0 ? (
                            <span
                              className="badge badge--warning"
                              style={{ marginLeft: 6 }}
                              title="No SalesPlay product code — in-store sales cannot be matched to this product in reports"
                            >
                              {st.codes.length && st.total > 1 ? `${st.missing} of ${st.total} sizes: no code` : 'No POS code'}
                            </span>
                          ) : null}
                        </>
                      );
                    })()}
                  </td>
                  <td>
                    <span className={`badge badge--${p.isActive === false ? 'neutral' : 'success'}`}>
                      {p.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                    {p.soldOut ? <span className="badge badge--danger" style={{ marginLeft: 6 }}>Sold out</span> : null}
                  </td>
                  <td>
                    <label className="switchRow" title="Members can have this product posted anywhere in the country">
                      <span className="switch">
                        <input
                          type="checkbox"
                          checked={Boolean(p.shippable)}
                          onChange={(e) => void setShippable(p, e.target.checked)}
                          aria-label={`${p.name} ships nationwide`}
                        />
                        <span className="switchTrack" aria-hidden />
                      </span>
                    </label>
                  </td>
                  <td>{p.sortOrder}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="dataTableEmpty">No products match these filters.</td>
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
                <h3 className="drawerSectionTitle">SalesPlay link</h3>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Product ID {editingProduct ? <span className="viewMuted">— fixed once created</span> : <span className="viewMuted">— leave blank to use the name</span>}
                    <input
                      type="text" maxLength={64} placeholder="e.g. caramel-espresso-gateau"
                      value={form.id} disabled={Boolean(editingProduct)}
                      onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.toLowerCase() }))}
                    />
                  </label>
                  <label className="filterField">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      SalesPlay product code
                      {!form.salesplayCode.trim() && form.variants.length === 0 ? (
                        <CodeAlert tone="warn" title="Missing SalesPlay code" />
                      ) : null}
                    </span>
                    <input
                      type="text" list="salesplayCodeList" maxLength={64} placeholder="Code of the matching product in the POS"
                      value={form.salesplayCode}
                      onChange={(e) => setForm((f) => ({ ...f, salesplayCode: e.target.value }))}
                    />
                    <CodeCheckLine verdict={verdictFor(form.salesplayCode, null)} />
                  </label>
                </div>
                <div className="drawerRowActions" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="toolbarButton"
                    disabled={checkingCodes || formCodes(form).length === 0}
                    onClick={() => void runCodeCheck()}
                    title="Look up each code in the SalesPlay product list and on till receipts"
                  >
                    {checkingCodes ? 'Checking…' : 'Check codes with SalesPlay'}
                  </button>
                  {codeCheckError ? <span className="viewError">{codeCheckError}</span> : null}
                </div>
                <p className="viewMuted" style={{ marginBottom: 0 }}>
                  Links this product to its POS product, so online orders pushed to SalesPlay carry the POS code and
                  in-store receipts count toward the same product in reports. For sized products, fill the{' '}
                  <strong>POS code</strong> box on each size below — a size code wins over this one. Each POS code can
                  belong to only one product. Not sure? Use <em>Sync with SalesPlay</em> to fill them from the POS export.
                </p>
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
                  {form.variants.map((v, i) => {
                    const verdict = verdictFor(v.salesplayCode, v.label.trim() || null);
                    const missing = !v.salesplayCode.trim() && !form.salesplayCode.trim();
                    return (
                      <div key={i}>
                        <div className="variantRow">
                          <input
                            type="text" placeholder="Size / label" value={v.label}
                            onChange={(e) => updateVariant(i, { label: e.target.value })}
                          />
                          <input
                            type="number" min={0} step="0.01" placeholder="RM" value={v.priceRm}
                            onChange={(e) => updateVariant(i, { priceRm: e.target.value })}
                          />
                          <span className="variantCodeField">
                            <input
                              type="text" list="salesplayCodeList" placeholder="POS code" maxLength={64} value={v.salesplayCode}
                              onChange={(e) => updateVariant(i, { salesplayCode: e.target.value })}
                              aria-label="SalesPlay code for this size"
                            />
                            {missing ? (
                              <CodeAlert tone="warn" title={`Missing SalesPlay code for ${v.label || 'this size'}`} />
                            ) : verdict && verdict.tone !== 'ok' ? (
                              <CodeAlert tone={verdict.tone} title={verdict.text} />
                            ) : null}
                          </span>
                          <Toggle checked={v.available} onChange={(val) => updateVariant(i, { available: val })} label="Available" />
                          <button type="button" className="variantRemove" onClick={() => removeVariant(i)} aria-label="Remove variant">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <CodeCheckLine verdict={verdict} />
                      </div>
                    );
                  })}
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
                <div className="drawerRowActions" style={{ marginTop: 10 }}>
                  <Toggle
                    checked={form.shippable}
                    onChange={(v) => setForm((f) => ({ ...f, shippable: v }))}
                    label="Can be shipped nationwide"
                  />
                </div>
                <p className="viewMuted" style={{ marginTop: 4 }}>
                  Members can have this posted anywhere in Malaysia (shipping fee applies). Leave it off for fresh
                  items such as cakes. A cart with any item that is not shippable cannot be shipped.
                </p>
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
