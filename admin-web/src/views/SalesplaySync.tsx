import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applySalesplaySync,
  fetchSalesplayCsvInfo,
  previewSalesplaySync,
  uploadSalesplayCsv,
  type SalesplayCsvInfo,
  type SalesplayCsvOnly,
  type SalesplaySyncOptionsInput,
  type SalesplaySyncPlan,
  type ShopCatalogProduct,
} from '../api';

const money = (cents: number | null | undefined) => (cents == null ? '-' : `RM${(cents / 100).toFixed(2)}`);

type Unit = { key: string; productId: string; variantLabel: string | null; label: string };

/** One sellable thing per product (or per size), for the "map to app product" dropdowns. */
function unitsOf(products: ShopCatalogProduct[]): Unit[] {
  const out: Unit[] = [];
  for (const p of products) {
    const variants = p.variants ?? [];
    if (variants.length === 0) {
      out.push({ key: `${p.id}::`, productId: p.id, variantLabel: null, label: p.name });
    } else {
      for (const v of variants) {
        out.push({ key: `${p.id}::${v.label}`, productId: p.id, variantLabel: v.label, label: `${p.name} · ${v.label}` });
      }
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

type Assignment = {
  productId: string;
  /** Existing size to map onto (plain mapping). */
  variantLabel: string | null;
  /** Set when adding the POS item as a NEW size of `productId`. */
  newSizeLabel?: string;
};

/** A sensible first guess for the new size's name. */
function defaultSizeLabel(csvName: string, variantLabel: string | null, productName: string): string {
  if (variantLabel) return variantLabel;
  const name = csvName.trim();
  const base = productName.trim();
  if (name.toLowerCase().startsWith(base.toLowerCase()) && name.length > base.length) {
    const rest = name.slice(base.length).trim().replace(/^[-–:·\s]+/, '').replace(/^\((.*)\)$/, '$1').trim();
    if (rest) return rest;
  }
  return name;
}

function Tag({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'neutral'; children: React.ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function ProductLabel({ name, variant, id }: { name: string; variant: string | null; id: string }) {
  return (
    <>
      <strong>{name}</strong>
      {variant ? <span className="viewMuted"> · {variant}</span> : null}
      <br />
      <span className="viewMuted" style={{ fontSize: 12 }}>{id}</span>
    </>
  );
}

/**
 * Keeps the catalog on the same product codes as the SalesPlay POS: upload the
 * Back Office "Product list" export, preview what would change, map anything the
 * matcher could not place, then apply.
 */
export function SalesplaySync({
  products,
  onCatalogChanged,
}: {
  products: ShopCatalogProduct[];
  /** Called after an apply so the products list reloads with the new codes. */
  onCatalogChanged: () => Promise<void> | void;
}) {
  const [info, setInfo] = useState<SalesplayCsvInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // `null` until the first preview tells us which categories exist.
  const [categoryChoice, setCategoryChoice] = useState<Record<string, boolean> | null>(null);
  const [updateCodes, setUpdateCodes] = useState(true);
  const [updatePrices, setUpdatePrices] = useState(false);
  const [createVariants, setCreateVariants] = useState(false);
  const [createProducts, setCreateProducts] = useState(false);
  const [missingAction, setMissingAction] = useState<'keep' | 'hide' | 'delete'>('keep');
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});

  const [plan, setPlan] = useState<SalesplaySyncPlan | null>(null);
  const [busy, setBusy] = useState<'upload' | 'preview' | 'apply' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const units = useMemo(() => unitsOf(products), [products]);
  const productChoices = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const refreshInfo = useCallback(async () => {
    try {
      setInfo(await fetchSalesplayCsvInfo());
      setInfoError(null);
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : 'Could not check the uploaded file');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the stored CSV status
    void refreshInfo();
  }, [refreshInfo]);

  function body(choice: Record<string, boolean> | null = categoryChoice): SalesplaySyncOptionsInput {
    return {
      categories: choice ? Object.keys(choice).filter((name) => choice[name]) : undefined,
      updateCodes,
      updatePrices,
      createMissingVariants: createVariants,
      createMissingProducts: createProducts,
      missingAction,
      assignments: Object.entries(assignments)
        // An "add as new size" row with no name yet is not ready to send.
        .filter(([, a]) => a.newSizeLabel === undefined || a.newSizeLabel.trim() !== '')
        .map(([code, a]) => ({ code, ...a })),
    };
  }

  async function handleUpload() {
    if (!file) {
      setUploadMsg('Choose the exported CSV first.');
      return;
    }
    setBusy('upload');
    setError(null);
    setUploadMsg('Uploading…');
    try {
      const saved = await uploadSalesplayCsv(file);
      setFile(null);
      setUploadMsg(
        `Uploaded ${saved.rowCount} POS items` +
          (saved.skippedCount ? ` (${saved.skippedCount} unusable row(s) ignored)` : '') +
          '. Now click Preview sync.',
      );
      // A new export can bring new categories; let the next preview re-seed them.
      setCategoryChoice(null);
      await refreshInfo();
    } catch (err) {
      setUploadMsg(null);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  async function runPreview(choice: Record<string, boolean> | null = categoryChoice, note?: string) {
    setBusy('preview');
    setError(null);
    setMessage('Loading preview…');
    try {
      const next = await previewSalesplaySync(body(choice));
      setPlan(next);
      if (choice == null) {
        setCategoryChoice(Object.fromEntries(next.categories.map((c) => [c.name, c.included])));
      }
      setMessage(note ?? 'Preview ready. Review the three tables, then click Apply sync.');
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    if (!plan) {
      setMessage('Run Preview sync first.');
      return;
    }
    const s = plan.summary;
    const work =
      s.codesToWrite + s.pricesToWrite + s.productsToCreate + s.variantsToCreate + s.sizesToAdd + s.toHide + s.toDelete;
    if (!work) {
      setMessage('Nothing to apply — the catalog already matches SalesPlay.');
      return;
    }
    const parts: string[] = [];
    if (s.codesToWrite) parts.push(`set ${s.codesToWrite} POS code(s)`);
    if (s.pricesToWrite) parts.push(`change ${s.pricesToWrite} price(s)`);
    if (s.variantsToCreate + s.sizesToAdd) parts.push(`add ${s.variantsToCreate + s.sizesToAdd} size(s)`);
    if (s.productsToCreate) parts.push(`create ${s.productsToCreate} hidden product(s)`);
    if (s.toHide) parts.push(`hide ${s.toHide} product(s)`);
    if (s.toDelete) parts.push(`DELETE ${s.toDelete} product(s)`);
    if (!window.confirm(`Apply sync? This will ${parts.join(', ')}.`)) return;

    // Deleting is the one step with nothing to undo: name what goes and make
    // the admin type the count instead of clicking through twice.
    if (s.toDelete) {
      const names = [
        ...new Set(plan.catalogOnly.filter((r) => r.action === 'delete').map((r) => r.productName)),
      ];
      const typed = window.prompt(
        `These ${s.toDelete} product(s) will be deleted from the catalog, along with any photos you uploaded for them. This cannot be undone.\n\n` +
          names.map((n) => `· ${n}`).join('\n') +
          `\n\nType ${s.toDelete} to confirm.`,
      );
      if (String(typed ?? '').trim() !== String(s.toDelete)) {
        setMessage('Cancelled — nothing was changed.');
        return;
      }
    }

    setBusy('apply');
    setError(null);
    setMessage('Applying sync…');
    try {
      const result = await applySalesplaySync(body());
      await onCatalogChanged();
      // The returned plan describes the catalog as it was *before* applying,
      // so re-diff rather than leave stale work on screen.
      setAssignments({});
      await runPreview(
        categoryChoice,
        `Sync applied. Updated ${result.productsUpdated}, created ${result.productsCreated}, hidden ${result.productsHidden}, deleted ${result.productsDeleted}. Tables below now show what is left.`,
      );
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : 'Apply failed');
      setBusy(null);
    }
  }

  /** `choice` is "" (unmapped), "map:<productId>::<size>" or "add:<productId>". */
  function setAssignment(row: SalesplayCsvOnly, choice: string) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (choice.startsWith('map:')) {
        const unit = units.find((u) => `map:${u.key}` === choice);
        if (unit) next[row.code] = { productId: unit.productId, variantLabel: unit.variantLabel };
        else delete next[row.code];
      } else if (choice.startsWith('add:')) {
        const productId = choice.slice(4);
        const product = products.find((p) => p.id === productId);
        if (product) {
          next[row.code] = {
            productId,
            variantLabel: null,
            // Keep what the admin already typed if they only switched product.
            newSizeLabel: prev[row.code]?.newSizeLabel ?? defaultSizeLabel(row.csvName, row.variantLabel, product.name),
          };
        } else delete next[row.code];
      } else {
        delete next[row.code];
      }
      return next;
    });
  }

  function assignmentChoice(code: string): string {
    const a = assignments[code];
    if (!a) return '';
    return a.newSizeLabel !== undefined ? `add:${a.productId}` : `map:${a.productId}::${a.variantLabel ?? ''}`;
  }

  const s = plan?.summary;

  return (
    <div className="viewStack">
      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Sync with SalesPlay POS</h2>
          <div className="panelHeadActions">
            <button type="button" className="toolbarButton" disabled={busy !== null} onClick={() => void runPreview()}>
              {busy === 'preview' ? 'Loading…' : 'Preview sync'}
            </button>
            <button
              type="button"
              className="toolbarButton toolbarButton--primary"
              disabled={busy !== null || !plan}
              onClick={() => void handleApply()}
            >
              {busy === 'apply' ? 'Applying…' : 'Apply sync'}
            </button>
          </div>
        </div>
        <p className="viewMuted" style={{ marginTop: 0 }}>
          Matches every item in the SalesPlay <strong>Product list</strong> export to a product in this catalog and
          stores its POS product code. That code is what online orders are pushed to SalesPlay with, and what folds
          in-store receipts onto the same product in Finance reports — so anything left unmatched below will not add
          up across the two channels.
        </p>

        <div className="filterField" style={{ padding: 12, background: 'var(--surface-2, #f8fafc)', borderRadius: 8 }}>
          <strong>SalesPlay product list (CSV)</strong>
          {infoError ? (
            <span className="viewError">{infoError}</span>
          ) : info?.exists ? (
            <span className="viewMuted">
              <span style={{ color: '#059669', fontWeight: 600 }}>Ready</span> — {info.rowCount} POS items on file
              {info.uploadedAt ? ` · uploaded ${new Date(info.uploadedAt).toLocaleString()}` : ''}
            </span>
          ) : info ? (
            <span className="viewMuted">
              <span style={{ color: '#b45309', fontWeight: 600 }}>Nothing uploaded yet</span> — export the product
              list from SalesPlay Back Office and upload it below.
            </span>
          ) : (
            <span className="viewMuted">Checking…</span>
          )}
          <div className="drawerRowActions" style={{ marginTop: 8 }}>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setUploadMsg(null);
              }}
            />
            <button type="button" className="toolbarButton" disabled={busy !== null || !file} onClick={() => void handleUpload()}>
              {busy === 'upload' ? 'Uploading…' : 'Upload to server'}
            </button>
          </div>
          <span className="viewMuted">
            SalesPlay Back Office → Products → Export. The file is kept on the server, so you only re-upload it when
            the POS product list changes.
          </span>
          {uploadMsg ? <span className="viewMuted">{uploadMsg}</span> : null}
        </div>

        <h3 className="drawerSectionTitle" style={{ marginTop: 18 }}>SalesPlay categories to sync</h3>
        <p className="viewMuted" style={{ marginTop: 0 }}>
          Delivery charges, GrabFood mirror items, bento and the misc drawer are off by default — they are till
          bookkeeping, not storefront products.
        </p>
        {plan && categoryChoice ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
            {plan.categories.map((c) => (
              <label key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={categoryChoice[c.name] ?? c.included}
                  onChange={(e) => setCategoryChoice({ ...categoryChoice, [c.name]: e.target.checked })}
                />
                {c.name} <span className="viewMuted">({c.rowCount})</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="viewMuted">Run Preview sync to list the categories in your export.</p>
        )}

        <h3 className="drawerSectionTitle" style={{ marginTop: 18 }}>What to do</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <label className="switchRow">
            <span className="switch">
              <input type="checkbox" checked={updateCodes} onChange={(e) => setUpdateCodes(e.target.checked)} />
              <span className="switchTrack" aria-hidden />
            </span>
            <span>Store the SalesPlay product code on every matched product</span>
          </label>
          <label className="switchRow">
            <span className="switch">
              <input type="checkbox" checked={updatePrices} onChange={(e) => setUpdatePrices(e.target.checked)} />
              <span className="switchTrack" aria-hidden />
            </span>
            <span>
              Also copy SalesPlay prices into the app <span className="viewMuted">(prices you edited by hand are kept)</span>
            </span>
          </label>
          <label className="switchRow">
            <span className="switch">
              <input type="checkbox" checked={createVariants} onChange={(e) => setCreateVariants(e.target.checked)} />
              <span className="switchTrack" aria-hidden />
            </span>
            <span>Add sizes SalesPlay sells that this product is missing (e.g. a slice)</span>
          </label>
          <label className="switchRow">
            <span className="switch">
              <input type="checkbox" checked={createProducts} onChange={(e) => setCreateProducts(e.target.checked)} />
              <span className="switchTrack" aria-hidden />
            </span>
            <span>
              Create products SalesPlay sells that the app does not have{' '}
              <span className="viewMuted">(added hidden, with no photo — publish them yourself)</span>
            </span>
          </label>
        </div>

        <label className="filterField" style={{ marginTop: 14, maxWidth: 420 }}>
          App products SalesPlay does not sell
          <select value={missingAction} onChange={(e) => setMissingAction(e.target.value as typeof missingAction)}>
            <option value="keep">Leave them alone</option>
            <option value="hide">Hide them from the storefront</option>
            <option value="delete">Delete them from the catalog</option>
          </select>
        </label>
        <p className="viewMuted">
          Deleting is permanent and takes the product's uploaded photos with it. Past orders are unaffected — they keep
          their own copy of what was bought. A product is only ever removed when <em>none</em> of its sizes match, it
          is not in an open order, and it does not look like the same thing under a different till name; anything
          doubtful is listed below with the reason instead.
        </p>

        {message ? <p className="viewMuted">{message}</p> : null}
        {error ? <p className="viewError">{error}</p> : null}
      </section>

      {plan && s ? (
        <>
          <section className="panel">
            <p style={{ margin: 0 }}>
              <strong>
                {s.matched} of {s.csvRowsInScope}
              </strong>{' '}
              POS items matched an app product · <strong>{s.codesToWrite}</strong> code(s) to write
              {s.pricesToWrite ? <> · <strong>{s.pricesToWrite}</strong> price(s) to update</> : null}
              {s.pricesLocked ? <> · <span style={{ color: '#92400e' }}>{s.pricesLocked} price(s) kept (edited by hand)</span></> : null}
              {s.productsToCreate ? <> · <strong>{s.productsToCreate}</strong> product(s) to create</> : null}
              {s.variantsToCreate + s.sizesToAdd ? <> · <strong>{s.variantsToCreate + s.sizesToAdd}</strong> size(s) to add</> : null}
              {s.toHide ? <> · <span style={{ color: '#b91c1c' }}>{s.toHide} product(s) to hide</span></> : null}
              {s.toDelete ? <> · <strong style={{ color: '#b91c1c' }}>{s.toDelete} product(s) to DELETE</strong></> : null}
              {s.removalBlocked ? <> · <span style={{ color: '#92400e' }}>{s.removalBlocked} kept for safety</span></> : null}
            </p>
            <p className="viewMuted" style={{ marginBottom: 0 }}>
              Unmatched: {s.csvOnly} in SalesPlay, {s.catalogOnly} in the app.
              {s.matchedDisabled ? ` ${s.matchedDisabled} matched item(s) are disabled in SalesPlay but still live in the app.` : ''}
              {plan.skipped.length ? ` ${plan.skipped.length} CSV row(s) unusable.` : ''}
            </p>
          </section>

          <section className="panel">
            <h3 className="panelTitle">Matched <span className="viewMuted">({s.matched})</span></h3>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>SalesPlay item</th>
                  <th>Code</th>
                  <th>App product</th>
                  <th>Code change</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {plan.matched.map((m) => (
                  <tr key={`${m.code}-${m.productId}-${m.variantLabel ?? ''}`}>
                    <td>
                      {m.csvName} {m.enabled ? null : <Tag tone="danger">Disabled in POS</Tag>}
                      <br />
                      <span className="viewMuted" style={{ fontSize: 11 }}>matched by {m.via}</span>
                    </td>
                    <td><code>{m.code}</code></td>
                    <td><ProductLabel name={m.productName} variant={m.variantLabel} id={m.productId} /></td>
                    <td>
                      {m.codeAction === 'unchanged' ? (
                        <span className="viewMuted">already set</span>
                      ) : m.codeAction === 'replace' ? (
                        <Tag tone="warning">Replaces {m.currentCode}</Tag>
                      ) : (
                        <Tag tone="success">Will set</Tag>
                      )}
                    </td>
                    <td>
                      {m.priceAction === 'unchanged' ? (
                        <span className="viewMuted">{money(m.currentPriceCents)}</span>
                      ) : m.priceAction === 'locked' ? (
                        <span style={{ color: '#92400e' }}>
                          {money(m.currentPriceCents)} (kept, POS says {money(m.csvPriceCents)})
                        </span>
                      ) : (
                        <>
                          {money(m.currentPriceCents)} → <strong>{money(m.csvPriceCents)}</strong>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {plan.matched.length === 0 ? (
                  <tr><td colSpan={5} className="dataTableEmpty">Nothing matched yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </section>

          {plan.sizeAdditions.length > 0 ? (
            <section className="panel">
              <h3 className="panelTitle">
                New sizes to add to existing products <span className="viewMuted">({plan.sizeAdditions.length})</span>
              </h3>
              <p className="viewMuted" style={{ marginTop: 0 }}>
                POS items you chose to add to a product you already have. Each becomes a new size with its SalesPlay
                price and code when you apply.
              </p>
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>SalesPlay item</th>
                    <th>Code</th>
                    <th>Added to</th>
                    <th>New size</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.sizeAdditions.map((a) => (
                    <tr key={a.code}>
                      <td>{a.csvName} {a.enabled ? null : <Tag tone="danger">Disabled in POS</Tag>}</td>
                      <td><code>{a.code}</code></td>
                      <td>
                        <ProductLabel name={a.productName} variant={null} id={a.productId} />
                        {a.convertsPlain ? (
                          <>
                            <br />
                            <span style={{ color: '#b45309' }}>
                              This product has no sizes yet — its current item becomes the size "Regular", keeping its
                              price and POS code.
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td><Tag tone="success">Add size</Tag> <strong>{a.sizeLabel}</strong></td>
                      <td>{money(a.csvPriceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="panel">
            <h3 className="panelTitle">In SalesPlay, not in the app <span className="viewMuted">({s.csvOnly})</span></h3>
            <p className="viewMuted" style={{ marginTop: 0 }}>
              Use the last column when the same product is named differently on the till — the code is written onto
              that product when you apply, and it will match on its own from then on.
            </p>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>SalesPlay item</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>What happens</th>
                  <th>Map to app product</th>
                </tr>
              </thead>
              <tbody>
                {plan.csvOnly.map((r) => (
                  <tr key={r.code}>
                    <td>{r.csvName} {r.enabled ? null : <Tag tone="danger">Disabled</Tag>}</td>
                    <td><code>{r.code}</code></td>
                    <td>{r.category}</td>
                    <td>{money(r.csvPriceCents)}</td>
                    <td>
                      {r.willCreate && r.kind === 'new-variant' ? (
                        <>
                          <Tag tone="success">Add size</Tag> to <strong>{r.suggestedProductName}</strong>
                        </>
                      ) : r.willCreate ? (
                        <>
                          <Tag tone="success">Create hidden</Tag> new product
                          {r.suggestedProductName ? (
                            <>
                              <br />
                              <span style={{ color: '#b45309' }}>
                                Careful — this looks like <strong>{r.suggestedProductName}</strong>. Map it instead if
                                it is the same thing.
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : r.skipReason ? (
                        <span style={{ color: '#b45309' }}>Skipped — {r.skipReason}</span>
                      ) : r.kind === 'new-variant' ? (
                        <span className="viewMuted">
                          Looks like a missing size of <strong>{r.suggestedProductName}</strong> — switch on "Add
                          sizes" above.
                        </span>
                      ) : r.suggestedProductName ? (
                        <span className="viewMuted">
                          Possibly <strong>{r.suggestedProductName}</strong> under another name — map it on the right.
                        </span>
                      ) : (
                        <span className="viewMuted">
                          Not in the app. Map it on the right, or switch on "Create products" above.
                        </span>
                      )}
                    </td>
                    <td>
                      <select
                        value={assignmentChoice(r.code)}
                        onChange={(e) => setAssignment(r, e.target.value)}
                        style={{ maxWidth: 260 }}
                      >
                        <option value="">— not mapped —</option>
                        <optgroup label="Same as an existing item">
                          {units.map((u) => (
                            <option key={u.key} value={`map:${u.key}`}>{u.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Add as a new size of…">
                          {productChoices.map((p) => (
                            <option key={p.id} value={`add:${p.id}`}>{p.name}</option>
                          ))}
                        </optgroup>
                      </select>
                      {assignments[r.code]?.newSizeLabel !== undefined ? (
                        <label className="filterField" style={{ marginTop: 6 }}>
                          Name of the new size
                          <input
                            type="text"
                            maxLength={80}
                            value={assignments[r.code].newSizeLabel}
                            onChange={(e) =>
                              setAssignments((prev) => ({
                                ...prev,
                                [r.code]: { ...prev[r.code], newSizeLabel: e.target.value },
                              }))
                            }
                          />
                        </label>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {plan.csvOnly.length === 0 ? (
                  <tr><td colSpan={6} className="dataTableEmpty" style={{ color: '#059669' }}>Every SalesPlay item in scope is in the app.</td></tr>
                ) : null}
              </tbody>
            </table>
            {Object.keys(assignments).length > 0 ? (
              <p className="viewMuted" style={{ marginBottom: 0 }}>
                {Object.keys(assignments).length} mapping(s) chosen —{' '}
                <button type="button" className="toolbarButton" disabled={busy !== null} onClick={() => void runPreview()}>
                  Re-run preview
                </button>{' '}
                to see them applied, then Apply sync.
              </p>
            ) : null}
          </section>

          <section className="panel">
            <h3 className="panelTitle">In the app, not in SalesPlay <span className="viewMuted">({s.catalogOnly})</span></h3>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>App product</th>
                  <th>Mapped code</th>
                  <th>Why</th>
                  <th>What happens</th>
                </tr>
              </thead>
              <tbody>
                {plan.catalogOnly.map((r) => (
                  <tr key={`${r.productId}-${r.variantLabel ?? ''}`}>
                    <td>
                      <ProductLabel name={r.productName} variant={r.variantLabel} id={r.productId} />{' '}
                      {r.isActive ? null : <Tag tone="neutral">Hidden</Tag>}
                    </td>
                    <td>{r.currentCode ? <code>{r.currentCode}</code> : <span className="viewMuted">-</span>}</td>
                    <td>
                      {r.reason === 'disabled'
                        ? 'Disabled in SalesPlay'
                        : r.reason === 'out-of-scope'
                          ? 'Its category is unticked above'
                          : 'No matching POS item'}
                    </td>
                    <td>
                      {r.action === 'delete' ? (
                        <>
                          <Tag tone="danger">Will delete</Tag> permanently, with its photos
                        </>
                      ) : r.action === 'hide' ? (
                        <>
                          <Tag tone="danger">Will hide</Tag> from the storefront
                        </>
                      ) : r.blockedReason ? (
                        <>
                          <Tag tone="warning">Kept</Tag> {r.blockedReason}
                        </>
                      ) : r.currentCode ? (
                        <span className="viewMuted">Left alone.</span>
                      ) : (
                        <span style={{ color: '#b45309' }}>
                          No POS code — in-store sales of this will not show up in reports.
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {plan.catalogOnly.length === 0 ? (
                  <tr><td colSpan={4} className="dataTableEmpty" style={{ color: '#059669' }}>Every app product maps to a SalesPlay item.</td></tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
