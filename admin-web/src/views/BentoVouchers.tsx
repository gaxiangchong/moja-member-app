import { useEffect, useState } from 'react';
import {
  createBentoVoucher,
  deleteBentoVoucher,
  fetchBentoVouchers,
  updateBentoVoucher,
  type BentoVoucher,
} from '../api';

function formatRm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function toDateInput(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}

function windowStatus(v: BentoVoucher): { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' } {
  if (!v.isActive) return { label: 'Inactive', tone: 'neutral' };
  const now = Date.now();
  if (new Date(v.startsAt).getTime() > now) return { label: 'Scheduled', tone: 'neutral' };
  if (new Date(v.endsAt).getTime() <= now) return { label: 'Ended', tone: 'danger' };
  if (v.remaining <= 0) return { label: 'Full', tone: 'warning' };
  return { label: 'Active', tone: 'success' };
}

type Form = {
  code: string;
  description: string;
  amountOffRM: string;
  minSpendRM: string;
  startsAt: string;
  endsAt: string;
  redemptionCap: string;
  isActive: boolean;
};

function emptyForm(): Form {
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return { code: '', description: '', amountOffRM: '', minSpendRM: '', startsAt: today, endsAt: in30, redemptionCap: '100', isActive: true };
}

function formFromVoucher(v: BentoVoucher): Form {
  return {
    code: v.code,
    description: v.description ?? '',
    amountOffRM: (v.amountOffCents / 100).toFixed(2),
    minSpendRM: v.minSpendCents != null ? (v.minSpendCents / 100).toFixed(2) : '',
    startsAt: toDateInput(v.startsAt),
    endsAt: toDateInput(v.endsAt),
    redemptionCap: String(v.redemptionCap),
    isActive: v.isActive,
  };
}

export function BentoVouchers() {
  const [vouchers, setVouchers] = useState<BentoVoucher[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<BentoVoucher | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before the fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    fetchBentoVouchers()
      .then(setVouchers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load vouchers'))
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(v: BentoVoucher) {
    setEditing(v);
    setForm(formFromVoucher(v));
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  async function handleSave() {
    setFormError(null);
    const amountOffCents = Math.round(Number(form.amountOffRM) * 100);
    if (!Number.isFinite(amountOffCents) || amountOffCents <= 0) return setFormError('Enter a valid amount off.');
    const redemptionCap = Number(form.redemptionCap);
    if (!Number.isInteger(redemptionCap) || redemptionCap < 1) return setFormError('Redemption capacity must be at least 1.');
    if (!form.startsAt || !form.endsAt) return setFormError('Start and end dates are required.');
    if (new Date(form.endsAt) <= new Date(form.startsAt)) return setFormError('End date must be after the start date.');
    const minSpendCents = form.minSpendRM ? Math.round(Number(form.minSpendRM) * 100) : undefined;

    setSaving(true);
    try {
      if (editing) {
        const updated = await updateBentoVoucher(editing.id, {
          description: form.description.trim() || undefined,
          amountOffCents,
          minSpendCents,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          redemptionCap,
          isActive: form.isActive,
        });
        setVouchers((prev) => prev?.map((v) => (v.id === updated.id ? updated : v)) ?? prev);
      } else {
        if (!form.code.trim()) return setFormError('Code is required.');
        const created = await createBentoVoucher({
          code: form.code.trim(),
          description: form.description.trim() || undefined,
          amountOffCents,
          minSpendCents,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          redemptionCap,
        });
        setVouchers((prev) => (prev ? [created, ...prev] : [created]));
      }
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save voucher');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Delete voucher "${editing.code}"? Only possible if it has never been redeemed.`)) return;
    try {
      await deleteBentoVoucher(editing.id);
      setVouchers((prev) => prev?.filter((v) => v.id !== editing.id) ?? prev);
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete voucher');
    }
  }

  return (
    <div className="viewStack">
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2 className="panelTitle">Bento vouchers</h2>
            <p className="viewMuted" style={{ margin: '4px 0 0' }}>
              Shared discount codes typed in at Bento checkout — not tied to any one member.
            </p>
          </div>
          <button type="button" className="toolbarButton toolbarButton--primary" onClick={openCreate}>
            + New voucher
          </button>
        </div>
      </section>

      {loading ? <p className="viewMuted">Loading…</p> : null}
      {error ? <p className="viewError">{error}</p> : null}

      {!loading && !error ? (
        <section className="panel">
          <table className="dataTable">
            <thead>
              <tr><th>Code</th><th>Amount off</th><th>Min spend</th><th>Window</th><th>Redeemed</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(vouchers ?? []).map((v) => {
                const s = windowStatus(v);
                return (
                  <tr key={v.id} className="dataTableRowClickable" onClick={() => openEdit(v)}>
                    <td>
                      {v.code}
                      {v.description ? <div className="dataTableMuted">{v.description}</div> : null}
                    </td>
                    <td>{formatRm(v.amountOffCents)}</td>
                    <td className="dataTableMuted">{v.minSpendCents ? formatRm(v.minSpendCents) : '—'}</td>
                    <td className="dataTableMuted">{formatDate(v.startsAt)} → {formatDate(v.endsAt)}</td>
                    <td>{v.redeemedCount} / {v.redemptionCap}</td>
                    <td><span className={`badge badge--${s.tone}`}>{s.label}</span></td>
                  </tr>
                );
              })}
              {(vouchers ?? []).length === 0 ? (
                <tr><td colSpan={6} className="dataTableEmpty">No Bento vouchers yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {drawerOpen ? (
        <div className="drawerBackdrop" onMouseDown={closeDrawer}>
          <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawerHead">
              <h2 className="panelTitle">{editing ? 'Edit voucher' : 'New voucher'}</h2>
              <button type="button" className="drawerClose" onClick={closeDrawer} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="drawerBody">
              <section>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Code
                    <input
                      type="text" maxLength={64} value={form.code} disabled={Boolean(editing)}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="BENTO10"
                    />
                  </label>
                  <label className="filterField">
                    Description <span className="viewMuted">— optional</span>
                    <input type="text" maxLength={500} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                  </label>
                </div>
              </section>

              <section>
                <h3 className="drawerSectionTitle">Discount</h3>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Amount off (RM)
                    <input type="number" min={0} step="0.01" value={form.amountOffRM} onChange={(e) => setForm((f) => ({ ...f, amountOffRM: e.target.value }))} />
                  </label>
                  <label className="filterField">
                    Min spend (RM) <span className="viewMuted">— optional</span>
                    <input type="number" min={0} step="0.01" value={form.minSpendRM} onChange={(e) => setForm((f) => ({ ...f, minSpendRM: e.target.value }))} />
                  </label>
                </div>
              </section>

              <section>
                <h3 className="drawerSectionTitle">Window &amp; capacity</h3>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Starts
                    <input type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
                  </label>
                  <label className="filterField">
                    Ends
                    <input type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
                  </label>
                  <label className="filterField">
                    Redemption capacity
                    <input type="number" min={1} value={form.redemptionCap} onChange={(e) => setForm((f) => ({ ...f, redemptionCap: e.target.value }))} />
                  </label>
                </div>
                {editing ? (
                  <p className="viewMuted" style={{ marginTop: 8 }}>{editing.redeemedCount} already redeemed.</p>
                ) : null}
              </section>

              {editing ? (
                <section>
                  <label className="switchRow">
                    <span className="switch">
                      <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                      <span className="switchTrack" aria-hidden />
                    </span>
                    <span>Active</span>
                  </label>
                </section>
              ) : null}
            </div>

            <div className="drawerFooter">
              <div>{formError ? <span className="viewError">{formError}</span> : null}</div>
              <div className="drawerRowActions">
                {editing ? (
                  <button type="button" className="toolbarButton" onClick={handleDelete}>Delete</button>
                ) : null}
                <button type="button" className="toolbarButton toolbarButton--primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create voucher'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
