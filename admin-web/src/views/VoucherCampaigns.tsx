import { useEffect, useState } from 'react';
import {
  AUTO_CREDIT_TRIGGERS,
  createCampaign,
  deleteCampaign,
  fetchCampaignDetail,
  fetchCampaignTemplates,
  fetchCampaigns,
  issueCampaignToAllActive,
  issueCampaignVoucherToCustomer,
  revokeCampaignVoucher,
  updateCampaign,
  type AutoCreditTrigger,
  type CampaignDetail,
  type CampaignSummary,
  type CampaignTemplateKey,
  type CampaignTemplatePreset,
  type CampaignVoucherType,
  type VoucherLifecycleStatus,
} from '../api';
import { CustomerSearch } from '../components/CustomerSearch';

const TRIGGER_LABELS: Record<AutoCreditTrigger | '', string> = {
  '': 'None — issue manually only',
  NEW_MEMBER: 'When a member signs up',
  BIRTHDAY: "On a member's birthday",
  REFERRAL_COUNT: 'When referral count reaches…',
  INACTIVE_DAYS: 'When inactive for…',
  MIN_PURCHASE: 'When a single order reaches…',
};

function triggerNeedsThreshold(trigger: AutoCreditTrigger | ''): boolean {
  return trigger === 'REFERRAL_COUNT' || trigger === 'INACTIVE_DAYS' || trigger === 'MIN_PURCHASE';
}

function thresholdFieldLabel(trigger: AutoCreditTrigger | ''): string {
  if (trigger === 'REFERRAL_COUNT') return 'Referrals';
  if (trigger === 'INACTIVE_DAYS') return 'Days inactive';
  if (trigger === 'MIN_PURCHASE') return 'Order total (RM)';
  return '';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

const STATUS_TONE: Record<CampaignSummary['status'], 'success' | 'neutral' | 'warning' | 'danger'> = {
  active: 'success',
  scheduled: 'neutral',
  ended: 'danger',
  paused: 'warning',
};

const VOUCHER_STATUS_TONE: Record<VoucherLifecycleStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  LOCKED: 'warning',
  USED: 'neutral',
  EXPIRED: 'danger',
  VOID: 'danger',
};

const DISCOUNT_TYPES: { value: CampaignVoucherType; label: string }[] = [
  { value: 'PERCENTAGE', label: 'Percentage off' },
  { value: 'FIXED_AMOUNT', label: 'Fixed amount off' },
];

type CreateForm = {
  template: CampaignTemplateKey;
  name: string;
  description: string;
  voucherType: CampaignVoucherType;
  discountPercent: string;
  discountAmountRM: string;
  minSpendRM: string;
  startsAt: string;
  endsAt: string;
  voucherValidDays: string;
  maxTotalIssued: string;
  usageLimitPerUser: string;
  tncText: string;
  autoCreditTrigger: AutoCreditTrigger | '';
  autoCreditThresholdValue: string;
};

function emptyCreateForm(preset?: CampaignTemplatePreset): CreateForm {
  return {
    template: preset?.template ?? 'CUSTOM',
    name: '',
    description: '',
    voucherType: preset?.voucherType ?? 'FIXED_AMOUNT',
    discountPercent: preset?.discountPercent != null ? String(preset.discountPercent) : '',
    discountAmountRM: preset?.discountAmountRM != null ? String(preset.discountAmountRM) : '',
    minSpendRM: preset?.minSpendRM != null ? String(preset.minSpendRM) : '',
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: '',
    voucherValidDays: preset ? String(preset.voucherValidDays) : '30',
    maxTotalIssued: '',
    usageLimitPerUser: preset ? String(preset.usageLimitPerUser) : '1',
    tncText: preset?.tncText ?? '',
    autoCreditTrigger: (preset?.autoCreditTrigger as AutoCreditTrigger | null) ?? '',
    autoCreditThresholdValue: '',
  };
}

export function VoucherCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [templates, setTemplates] = useState<CampaignTemplatePreset[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'manage'>('create');
  const [createForm, setCreateForm] = useState<CreateForm>(() => emptyCreateForm());
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CreateForm> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before the fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    Promise.all([fetchCampaigns(), fetchCampaignTemplates()])
      .then(([c, t]) => {
        setCampaigns(c);
        setTemplates(t);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load campaigns'))
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setDrawerMode('create');
    setCreateForm(emptyCreateForm());
    setCreateError(null);
    setDrawerOpen(true);
  }

  function openManage(id: string) {
    setDrawerMode('manage');
    setDetail(null);
    setDetailError(null);
    setSaveError(null);
    setSavedAt(null);
    setBulkResult(null);
    setDrawerOpen(true);
    fetchCampaignDetail(id)
      .then((d) => {
        setDetail(d);
        setEditForm({
          name: d.name,
          description: d.description ?? '',
          discountPercent: d.percentageOff != null ? String(d.percentageOff) : '',
          discountAmountRM: d.fixedAmountOffRM != null ? String(d.fixedAmountOffRM) : '',
          minSpendRM: d.minSpendRM != null ? String(d.minSpendRM) : '',
          startsAt: toDateInput(d.startsAt),
          endsAt: toDateInput(d.endsAt),
          voucherValidDays: String(d.voucherValidDays ?? ''),
          maxTotalIssued: d.totalRedemptionCap != null ? String(d.totalRedemptionCap) : '',
          usageLimitPerUser: d.usageLimitPerUser != null ? String(d.usageLimitPerUser) : '',
          tncText: d.tncText ?? '',
          autoCreditTrigger: d.autoCreditTrigger ?? '',
          autoCreditThresholdValue:
            d.autoCreditThreshold == null
              ? ''
              : String(d.autoCreditTrigger === 'MIN_PURCHASE' ? d.autoCreditThreshold / 100 : d.autoCreditThreshold),
        });
      })
      .catch((err) => setDetailError(err instanceof Error ? err.message : 'Failed to load campaign'));
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  async function handleCreate() {
    setCreateError(null);
    if (!createForm.name.trim()) return setCreateError('Name is required.');
    if (!createForm.startsAt) return setCreateError('Start date is required.');
    if (createForm.voucherType === 'PERCENTAGE' && !createForm.discountPercent) {
      return setCreateError('Enter a percentage.');
    }
    if (createForm.voucherType === 'FIXED_AMOUNT' && !createForm.discountAmountRM) {
      return setCreateError('Enter a discount amount.');
    }
    if (triggerNeedsThreshold(createForm.autoCreditTrigger) && !createForm.autoCreditThresholdValue) {
      return setCreateError(`Enter a value for "${TRIGGER_LABELS[createForm.autoCreditTrigger]}".`);
    }

    setCreating(true);
    try {
      const created = await createCampaign({
        template: createForm.template,
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        voucherType: createForm.voucherType,
        discountPercent: createForm.voucherType === 'PERCENTAGE' ? Number(createForm.discountPercent) : undefined,
        discountAmountRM: createForm.voucherType === 'FIXED_AMOUNT' ? Number(createForm.discountAmountRM) : undefined,
        minSpendRM: createForm.minSpendRM ? Number(createForm.minSpendRM) : undefined,
        trigger: createForm.autoCreditTrigger
          ? {
              type: 'AUTO',
              criteria: createForm.autoCreditTrigger,
              thresholdValue: createForm.autoCreditThresholdValue ? Number(createForm.autoCreditThresholdValue) : undefined,
            }
          : { type: 'MANUAL' },
        startsAt: new Date(createForm.startsAt).toISOString(),
        endsAt: createForm.endsAt ? new Date(createForm.endsAt).toISOString() : undefined,
        voucherValidDays: createForm.voucherValidDays ? Number(createForm.voucherValidDays) : undefined,
        maxTotalIssued: createForm.maxTotalIssued ? Number(createForm.maxTotalIssued) : undefined,
        usageLimitPerUser: createForm.usageLimitPerUser ? Number(createForm.usageLimitPerUser) : undefined,
        tncText: createForm.tncText.trim() || undefined,
      });
      setCampaigns((prev) => (prev ? [created, ...prev] : [created]));
      openManage(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit() {
    if (!detail || !editForm) return;
    setSaveError(null);
    const trigger = editForm.autoCreditTrigger ?? '';
    if (triggerNeedsThreshold(trigger) && !editForm.autoCreditThresholdValue) {
      setSaveError(`Enter a value for "${TRIGGER_LABELS[trigger]}".`);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateCampaign(detail.id, {
        name: editForm.name?.trim(),
        description: editForm.description?.trim(),
        discountPercent: detail.voucherType === 'PERCENTAGE' && editForm.discountPercent ? Number(editForm.discountPercent) : undefined,
        discountAmountRM: detail.voucherType === 'FIXED_AMOUNT' && editForm.discountAmountRM ? Number(editForm.discountAmountRM) : undefined,
        minSpendRM: editForm.minSpendRM ? Number(editForm.minSpendRM) : undefined,
        startsAt: editForm.startsAt ? new Date(editForm.startsAt).toISOString() : undefined,
        endsAt: editForm.endsAt ? new Date(editForm.endsAt).toISOString() : undefined,
        voucherValidDays: editForm.voucherValidDays ? Number(editForm.voucherValidDays) : undefined,
        maxTotalIssued: editForm.maxTotalIssued ? Number(editForm.maxTotalIssued) : undefined,
        usageLimitPerUser: editForm.usageLimitPerUser ? Number(editForm.usageLimitPerUser) : undefined,
        tncText: editForm.tncText?.trim(),
        autoCreditTrigger: editForm.autoCreditTrigger,
        autoCreditThresholdValue: editForm.autoCreditThresholdValue ? Number(editForm.autoCreditThresholdValue) : undefined,
      });
      setDetail(updated);
      setCampaigns((prev) => prev?.map((c) => (c.id === updated.id ? { ...c, name: updated.name } : c)) ?? prev);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save campaign');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!detail) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateCampaign(detail.id, { isActive: !detail.isActive });
      setDetail(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update campaign');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;
    if (!window.confirm(`Delete campaign "${detail.name}"? Only possible if no vouchers have been issued.`)) return;
    try {
      await deleteCampaign(detail.id);
      setCampaigns((prev) => prev?.filter((c) => c.id !== detail.id) ?? prev);
      closeDrawer();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to delete campaign');
    }
  }

  async function issueToMember(customerId: string) {
    if (!detail) return;
    try {
      const voucher = await issueCampaignVoucherToCustomer(detail.id, customerId);
      setDetail((d) => (d ? { ...d, vouchers: [voucher, ...d.vouchers] } : d));
      setCampaigns((prev) => prev?.map((c) => (c.id === detail.id ? { ...c, vouchersIssued: c.vouchersIssued + 1 } : c)) ?? prev);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to issue voucher');
    }
  }

  async function issueAll() {
    if (!detail) return;
    if (!window.confirm('Issue this voucher to every active member who doesn\'t already have one? This can\'t be undone in bulk.')) return;
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const res = await issueCampaignToAllActive(detail.id);
      setBulkResult(`Issued ${res.issued}, failed ${res.failed}, skipped ${res.skipped} already-holding, of ${res.eligible} eligible.`);
      openManage(detail.id);
    } catch (err) {
      setBulkResult(err instanceof Error ? err.message : 'Failed to issue to all active members');
    } finally {
      setBulkBusy(false);
    }
  }

  async function revoke(voucherId: string) {
    const reason = window.prompt('Reason for withdrawing this voucher:');
    if (reason == null) return;
    try {
      await revokeCampaignVoucher(voucherId, reason.trim() || undefined);
      setDetail((d) => (d ? { ...d, vouchers: d.vouchers.map((v) => (v.id === voucherId ? { ...v, status: 'VOID' } : v)) } : d));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to withdraw voucher');
    }
  }

  return (
    <div className="viewStack">
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2 className="panelTitle">Voucher campaigns</h2>
            <p className="viewMuted" style={{ margin: '4px 0 0' }}>
              Promo vouchers pushed straight to a member's wallet — separate from points-catalog rewards.
            </p>
          </div>
          <button type="button" className="toolbarButton toolbarButton--primary" onClick={openCreate}>
            + New campaign
          </button>
        </div>
      </section>

      {loading ? <p className="viewMuted">Loading…</p> : null}
      {error ? <p className="viewError">{error}</p> : null}

      {!loading && !error ? (
        <section className="panel">
          <table className="dataTable">
            <thead>
              <tr><th>Code</th><th>Name</th><th>Discount</th><th>Trigger</th><th>Issued</th><th>Status</th><th>Window</th></tr>
            </thead>
            <tbody>
              {(campaigns ?? []).map((c) => (
                <tr key={c.id} className="dataTableRowClickable" onClick={() => openManage(c.id)}>
                  <td className="dataTableMuted">{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.discountDisplay}</td>
                  <td>
                    {c.autoCreditTrigger ? (
                      <span className="badge badge--neutral">{TRIGGER_LABELS[c.autoCreditTrigger]}</span>
                    ) : (
                      <span className="dataTableMuted">Manual</span>
                    )}
                  </td>
                  <td>{c.vouchersIssued.toLocaleString()}{c.totalRedemptionCap ? ` / ${c.totalRedemptionCap}` : ''}</td>
                  <td><span className={`badge badge--${STATUS_TONE[c.status]}`}>{c.status}</span></td>
                  <td className="dataTableMuted">{formatDate(c.startsAt)} → {formatDate(c.endsAt)}</td>
                </tr>
              ))}
              {(campaigns ?? []).length === 0 ? (
                <tr><td colSpan={7} className="dataTableEmpty">No campaigns yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {drawerOpen ? (
        <div className="drawerBackdrop" onMouseDown={closeDrawer}>
          <div className="drawer" style={{ width: 'min(640px, 100vw)' }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawerHead">
              <h2 className="panelTitle">{drawerMode === 'create' ? 'New campaign' : detail?.name ?? 'Campaign'}</h2>
              <button type="button" className="drawerClose" onClick={closeDrawer} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {drawerMode === 'create' ? (
              <>
                <div className="drawerBody">
                  <section>
                    <h3 className="drawerSectionTitle">Start from a template</h3>
                    <div className="drawerFieldGrid">
                      {(templates ?? []).map((t) => (
                        <button
                          key={t.template}
                          type="button"
                          className={`toolbarButton${createForm.template === t.template ? ' toolbarButton--primary' : ''}`}
                          onClick={() => setCreateForm(emptyCreateForm(t))}
                        >
                          {t.template.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="drawerSectionTitle">Details</h3>
                    <label className="filterField">
                      Name
                      <input type="text" maxLength={160} value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
                    </label>
                    <label className="filterField" style={{ marginTop: 12 }}>
                      Description <span className="viewMuted">— optional</span>
                      <input type="text" value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
                    </label>
                  </section>

                  <section>
                    <h3 className="drawerSectionTitle">Discount</h3>
                    <div className="drawerFieldGrid">
                      <label className="filterField">
                        Type
                        <select value={createForm.voucherType} onChange={(e) => setCreateForm((f) => ({ ...f, voucherType: e.target.value as CampaignVoucherType }))}>
                          {DISCOUNT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      </label>
                      {createForm.voucherType === 'PERCENTAGE' ? (
                        <label className="filterField">
                          Percent off
                          <input type="number" min={0} max={100} value={createForm.discountPercent} onChange={(e) => setCreateForm((f) => ({ ...f, discountPercent: e.target.value }))} />
                        </label>
                      ) : (
                        <label className="filterField">
                          Amount off (RM)
                          <input type="number" min={0} step="0.01" value={createForm.discountAmountRM} onChange={(e) => setCreateForm((f) => ({ ...f, discountAmountRM: e.target.value }))} />
                        </label>
                      )}
                      <label className="filterField">
                        Min spend (RM) <span className="viewMuted">— optional</span>
                        <input type="number" min={0} step="0.01" value={createForm.minSpendRM} onChange={(e) => setCreateForm((f) => ({ ...f, minSpendRM: e.target.value }))} />
                      </label>
                    </div>
                  </section>

                  <section>
                    <h3 className="drawerSectionTitle">Window &amp; limits</h3>
                    <div className="drawerFieldGrid">
                      <label className="filterField">
                        Starts
                        <input type="date" value={createForm.startsAt} onChange={(e) => setCreateForm((f) => ({ ...f, startsAt: e.target.value }))} />
                      </label>
                      <label className="filterField">
                        Ends <span className="viewMuted">— optional</span>
                        <input type="date" value={createForm.endsAt} onChange={(e) => setCreateForm((f) => ({ ...f, endsAt: e.target.value }))} />
                      </label>
                      <label className="filterField">
                        Voucher valid for (days) <span className="viewMuted">— after issue</span>
                        <input type="number" min={1} value={createForm.voucherValidDays} onChange={(e) => setCreateForm((f) => ({ ...f, voucherValidDays: e.target.value }))} />
                      </label>
                      <label className="filterField">
                        Max total issued <span className="viewMuted">— optional</span>
                        <input type="number" min={1} value={createForm.maxTotalIssued} onChange={(e) => setCreateForm((f) => ({ ...f, maxTotalIssued: e.target.value }))} />
                      </label>
                      <label className="filterField">
                        Uses per member
                        <input type="number" min={1} value={createForm.usageLimitPerUser} onChange={(e) => setCreateForm((f) => ({ ...f, usageLimitPerUser: e.target.value }))} />
                      </label>
                    </div>
                    <label className="filterField" style={{ marginTop: 12 }}>
                      Terms &amp; conditions
                      <textarea rows={3} value={createForm.tncText} onChange={(e) => setCreateForm((f) => ({ ...f, tncText: e.target.value }))} />
                    </label>
                  </section>

                  <section>
                    <h3 className="drawerSectionTitle">Automatic push</h3>
                    <p className="viewMuted" style={{ marginTop: 0, marginBottom: 12 }}>
                      Push this voucher to a member's wallet automatically instead of issuing it by hand.
                    </p>
                    <div className="drawerFieldGrid">
                      <label className="filterField">
                        Trigger
                        <select
                          value={createForm.autoCreditTrigger}
                          onChange={(e) => setCreateForm((f) => ({ ...f, autoCreditTrigger: e.target.value as AutoCreditTrigger | '' }))}
                        >
                          {['', ...AUTO_CREDIT_TRIGGERS].map((t) => (
                            <option key={t} value={t}>{TRIGGER_LABELS[t as AutoCreditTrigger | '']}</option>
                          ))}
                        </select>
                      </label>
                      {triggerNeedsThreshold(createForm.autoCreditTrigger) ? (
                        <label className="filterField">
                          {thresholdFieldLabel(createForm.autoCreditTrigger)}
                          <input
                            type="number" min={0} step={createForm.autoCreditTrigger === 'MIN_PURCHASE' ? '0.01' : '1'}
                            value={createForm.autoCreditThresholdValue}
                            onChange={(e) => setCreateForm((f) => ({ ...f, autoCreditThresholdValue: e.target.value }))}
                          />
                        </label>
                      ) : null}
                    </div>
                  </section>
                </div>
                <div className="drawerFooter">
                  <div>{createError ? <span className="viewError">{createError}</span> : null}</div>
                  <button type="button" className="toolbarButton toolbarButton--primary" onClick={handleCreate} disabled={creating}>
                    {creating ? 'Creating…' : 'Create campaign'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="drawerBody">
                  {detailError ? <p className="viewError">{detailError}</p> : null}
                  {!detail ? <p className="viewMuted">Loading…</p> : null}
                  {detail && editForm ? (
                    <>
                      <section>
                        <div className="panelHead">
                          <span className="dataTableMuted">{detail.code}</span>
                          <label className="switchRow">
                            <span className="switch">
                              <input type="checkbox" checked={detail.isActive} onChange={toggleActive} disabled={saving} />
                              <span className="switchTrack" aria-hidden />
                            </span>
                            <span>Active</span>
                          </label>
                        </div>
                        <div className="hbarPanel" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                          {(Object.keys(detail.stats) as VoucherLifecycleStatus[]).map((s) => (
                            <span key={s} className={`badge badge--${VOUCHER_STATUS_TONE[s]}`}>{s}: {detail.stats[s]}</span>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3 className="drawerSectionTitle">Details</h3>
                        <label className="filterField">
                          Name
                          <input type="text" maxLength={160} value={editForm.name ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                        </label>
                        <label className="filterField" style={{ marginTop: 12 }}>
                          Description
                          <input type="text" value={editForm.description ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
                        </label>
                      </section>

                      <section>
                        <h3 className="drawerSectionTitle">Discount ({detail.voucherType === 'PERCENTAGE' ? 'percentage' : 'fixed amount'})</h3>
                        <div className="drawerFieldGrid">
                          {detail.voucherType === 'PERCENTAGE' ? (
                            <label className="filterField">
                              Percent off
                              <input type="number" min={0} max={100} value={editForm.discountPercent ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, discountPercent: e.target.value }))} />
                            </label>
                          ) : (
                            <label className="filterField">
                              Amount off (RM)
                              <input type="number" min={0} step="0.01" value={editForm.discountAmountRM ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, discountAmountRM: e.target.value }))} />
                            </label>
                          )}
                          <label className="filterField">
                            Min spend (RM)
                            <input type="number" min={0} step="0.01" value={editForm.minSpendRM ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, minSpendRM: e.target.value }))} />
                          </label>
                        </div>
                      </section>

                      <section>
                        <h3 className="drawerSectionTitle">Window &amp; limits</h3>
                        <div className="drawerFieldGrid">
                          <label className="filterField">
                            Starts
                            <input type="date" value={editForm.startsAt ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, startsAt: e.target.value }))} />
                          </label>
                          <label className="filterField">
                            Ends
                            <input type="date" value={editForm.endsAt ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, endsAt: e.target.value }))} />
                          </label>
                          <label className="filterField">
                            Voucher valid for (days)
                            <input type="number" min={1} value={editForm.voucherValidDays ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, voucherValidDays: e.target.value }))} />
                          </label>
                          <label className="filterField">
                            Max total issued
                            <input type="number" min={1} value={editForm.maxTotalIssued ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, maxTotalIssued: e.target.value }))} />
                          </label>
                          <label className="filterField">
                            Uses per member
                            <input type="number" min={1} value={editForm.usageLimitPerUser ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, usageLimitPerUser: e.target.value }))} />
                          </label>
                        </div>
                        <label className="filterField" style={{ marginTop: 12 }}>
                          Terms &amp; conditions
                          <textarea rows={3} value={editForm.tncText ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, tncText: e.target.value }))} />
                        </label>
                      </section>

                      <section>
                        <h3 className="drawerSectionTitle">Automatic push</h3>
                        <p className="viewMuted" style={{ marginTop: 0, marginBottom: 12 }}>
                          Push this voucher to a member's wallet automatically instead of issuing it by hand.
                        </p>
                        <div className="drawerFieldGrid">
                          <label className="filterField">
                            Trigger
                            <select
                              value={editForm.autoCreditTrigger ?? ''}
                              onChange={(e) => setEditForm((f) => ({ ...f, autoCreditTrigger: e.target.value as AutoCreditTrigger | '' }))}
                            >
                              {['', ...AUTO_CREDIT_TRIGGERS].map((t) => (
                                <option key={t} value={t}>{TRIGGER_LABELS[t as AutoCreditTrigger | '']}</option>
                              ))}
                            </select>
                          </label>
                          {triggerNeedsThreshold(editForm.autoCreditTrigger ?? '') ? (
                            <label className="filterField">
                              {thresholdFieldLabel(editForm.autoCreditTrigger ?? '')}
                              <input
                                type="number" min={0} step={editForm.autoCreditTrigger === 'MIN_PURCHASE' ? '0.01' : '1'}
                                value={editForm.autoCreditThresholdValue ?? ''}
                                onChange={(e) => setEditForm((f) => ({ ...f, autoCreditThresholdValue: e.target.value }))}
                              />
                            </label>
                          ) : null}
                        </div>
                        <button type="button" className="toolbarButton toolbarButton--primary" style={{ marginTop: 12 }} onClick={handleSaveEdit} disabled={saving}>
                          {saving ? 'Saving…' : 'Save changes'}
                        </button>
                        {saveError ? <p className="viewError" style={{ marginTop: 8 }}>{saveError}</p> : null}
                        {!saveError && savedAt ? <p className="viewMuted" style={{ marginTop: 8 }}>Saved.</p> : null}
                      </section>

                      <section>
                        <h3 className="drawerSectionTitle">Issue this voucher</h3>
                        <CustomerSearch actionLabel="Issue" onSelect={(c) => issueToMember(c.id)} />
                        <button type="button" className="toolbarButton" style={{ marginTop: 12 }} onClick={issueAll} disabled={bulkBusy}>
                          {bulkBusy ? 'Issuing…' : 'Issue to all active members'}
                        </button>
                        {bulkResult ? <p className="viewMuted" style={{ marginTop: 8 }}>{bulkResult}</p> : null}
                      </section>

                      <section>
                        <h3 className="drawerSectionTitle">Issued vouchers</h3>
                        <table className="dataTable dataTable--mini">
                          <thead><tr><th>Code</th><th>Member</th><th>Status</th><th>Expires</th><th></th></tr></thead>
                          <tbody>
                            {detail.vouchers.map((v) => (
                              <tr key={v.id}>
                                <td className="dataTableMuted">{v.code}</td>
                                <td>{v.customer?.displayName || v.customer?.phoneE164 || '—'}</td>
                                <td><span className={`badge badge--${VOUCHER_STATUS_TONE[v.status]}`}>{v.status}</span></td>
                                <td className="dataTableMuted">{formatDateTime(v.expiresAt)}</td>
                                <td>
                                  {v.status !== 'USED' && v.status !== 'VOID' ? (
                                    <button type="button" className="toolbarButton" onClick={() => revoke(v.id)}>Withdraw</button>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                            {detail.vouchers.length === 0 ? (
                              <tr><td colSpan={5} className="dataTableEmpty">No vouchers issued yet.</td></tr>
                            ) : null}
                          </tbody>
                        </table>
                      </section>
                    </>
                  ) : null}
                </div>
                <div className="drawerFooter">
                  <div />
                  <button type="button" className="toolbarButton" onClick={handleDelete}>Delete campaign</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
