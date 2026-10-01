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
  runVoucherAutomationNow,
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
  NEW_MEMBER: 'Welcome — when a member first signs in',
  BIRTHDAY: "Birthday — before a member's birthday",
  REFERRAL_PURCHASE: 'Referral — when a referred friend makes their first purchase',
  REFERRAL_COUNT: 'Referral milestone — when referral count reaches…',
  INACTIVE_DAYS: 'Win-back — when a past buyer has not bought for…',
  MIN_PURCHASE: 'Spend — when a single order reaches…',
  ALL_MEMBERS: 'Every member — including people who join later',
};

/** What each trigger does, in the words the person setting it up needs. */
const TRIGGER_HELP: Record<AutoCreditTrigger, string> = {
  NEW_MEMBER: 'Each member gets this once, the first time they sign in.',
  BIRTHDAY:
    'Appears in the member’s wallet this many days before their birthday, once per year, and stays usable until the “valid for” days after the birthday.',
  REFERRAL_PURCHASE:
    'The member who referred a friend earns one voucher per friend, once that friend’s first paid order reaches the minimum.',
  REFERRAL_COUNT:
    'Earned once, when this many of a member’s referred friends have made a purchase.',
  INACTIVE_DAYS:
    'Sent once to members who have bought before but not within this many days. If they come back and lapse again, they are sent another. Members who never bought are not included.',
  MIN_PURCHASE: 'Earned once, the first time a single order reaches this total.',
  ALL_MEMBERS:
    'Goes to every active member now, and to anyone who joins while the campaign is running. Once a member uses it, it is gone.',
};

type ThresholdSpec = { label: string; step: string; required: boolean; hint: string };

/** The number a trigger needs, if any. Birthday, referral and win-back all have sensible defaults. */
function thresholdSpec(trigger: AutoCreditTrigger | ''): ThresholdSpec | null {
  switch (trigger) {
    case 'BIRTHDAY':
      return { label: 'Appears (days before birthday)', step: '1', required: false, hint: 'Blank = 30.' };
    case 'REFERRAL_PURCHASE':
      return { label: 'Max vouchers per referrer', step: '1', required: false, hint: '0 or blank = unlimited.' };
    case 'REFERRAL_COUNT':
      return { label: 'Referred friends who bought', step: '1', required: true, hint: '' };
    case 'INACTIVE_DAYS':
      return { label: 'Days since last purchase', step: '1', required: false, hint: 'Blank = 60.' };
    case 'MIN_PURCHASE':
      return { label: 'Order total (RM)', step: '0.01', required: true, hint: '' };
    default:
      return null;
  }
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
  /** REFERRAL_PURCHASE: the friend's first order must reach this many RM. */
  qualifyingMinSpendRM: string;
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
    // Seed the template's own defaults so what the admin sees is what gets saved.
    autoCreditThresholdValue: preset?.defaultThreshold != null ? String(preset.defaultThreshold) : '',
    qualifyingMinSpendRM: preset?.qualifyingMinSpendRM != null ? String(preset.qualifyingMinSpendRM) : '',
  };
}

/** Trigger picker plus whatever numbers that trigger needs, with a plain-language explanation. */
function TriggerFields(props: {
  trigger: AutoCreditTrigger | '';
  onTrigger: (t: AutoCreditTrigger | '') => void;
  threshold: string;
  onThreshold: (v: string) => void;
  minSpend: string;
  onMinSpend: (v: string) => void;
}) {
  const spec = thresholdSpec(props.trigger);
  return (
    <>
      <div className="drawerFieldGrid">
        <label className="filterField">
          Trigger
          <select value={props.trigger} onChange={(e) => props.onTrigger(e.target.value as AutoCreditTrigger | '')}>
            {['', ...AUTO_CREDIT_TRIGGERS].map((t) => (
              <option key={t} value={t}>{TRIGGER_LABELS[t as AutoCreditTrigger | '']}</option>
            ))}
          </select>
        </label>
        {props.trigger === 'REFERRAL_PURCHASE' ? (
          <label className="filterField">
            Friend’s first order must be at least (RM)
            <input
              type="number" min={0} step="0.01" value={props.minSpend}
              onChange={(e) => props.onMinSpend(e.target.value)}
            />
            <span className="viewMuted">0 = no minimum. Delivery fees don’t count.</span>
          </label>
        ) : null}
        {spec ? (
          <label className="filterField">
            {spec.label}{spec.required ? '' : <span className="viewMuted"> — optional</span>}
            <input
              type="number" min={0} step={spec.step} value={props.threshold}
              onChange={(e) => props.onThreshold(e.target.value)}
            />
            {spec.hint ? <span className="viewMuted">{spec.hint}</span> : null}
          </label>
        ) : null}
      </div>
      {props.trigger ? (
        <p className="viewMuted" style={{ marginTop: 12, marginBottom: 0 }}>{TRIGGER_HELP[props.trigger]}</p>
      ) : null}
    </>
  );
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
  const [runBusy, setRunBusy] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

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

  /** Birthday and win-back vouchers go out every morning (9am Malaysia time); this does it now. */
  async function runNow() {
    setRunBusy(true);
    setRunResult(null);
    try {
      const r = await runVoucherAutomationNow();
      setRunResult(
        `Issued ${r.birthday} birthday, ${r.winback} win-back and ${r.allMembers} all-member voucher(s). Nobody is ever issued the same one twice.`,
      );
      const refreshed = await fetchCampaigns();
      setCampaigns(refreshed);
    } catch (err) {
      setRunResult(err instanceof Error ? err.message : 'Could not run the automation');
    } finally {
      setRunBusy(false);
    }
  }

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
          qualifyingMinSpendRM: d.qualifyingMinSpendRM != null ? String(d.qualifyingMinSpendRM) : '',
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
    const createSpec = thresholdSpec(createForm.autoCreditTrigger);
    if (createSpec?.required && !createForm.autoCreditThresholdValue) {
      return setCreateError(`Enter a value for "${createSpec.label}".`);
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
        qualifyingMinSpendRM:
          createForm.autoCreditTrigger === 'REFERRAL_PURCHASE' && createForm.qualifyingMinSpendRM !== ''
            ? Number(createForm.qualifyingMinSpendRM)
            : undefined,
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
    const editSpec = thresholdSpec(trigger);
    if (editSpec?.required && !editForm.autoCreditThresholdValue) {
      setSaveError(`Enter a value for "${editSpec.label}".`);
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
        // Blank on a referral campaign means "no minimum", so send 0 to clear it.
        qualifyingMinSpendRM:
          trigger === 'REFERRAL_PURCHASE' ? Number(editForm.qualifyingMinSpendRM || 0) : undefined,
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
    // Used or mid-checkout vouchers record what a member was given, so they block deletion.
    const inUse = (detail.stats.USED ?? 0) + (detail.stats.LOCKED ?? 0);
    const unused = (detail.stats.ACTIVE ?? 0) + (detail.stats.EXPIRED ?? 0) + (detail.stats.VOID ?? 0);
    if (inUse > 0) {
      setSaveError(
        `${inUse} voucher(s) from this campaign have been used, so it can't be deleted. Switch it off with the Active toggle instead.`,
      );
      return;
    }
    const prompt =
      unused > 0
        ? `${unused} unused voucher(s) are in members' wallets. Deleting "${detail.name}" removes them. Delete anyway?`
        : `Delete campaign "${detail.name}"?`;
    if (!window.confirm(prompt)) return;
    try {
      await deleteCampaign(detail.id, unused > 0);
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="toolbarButton" onClick={runNow} disabled={runBusy}>
              {runBusy ? 'Running…' : 'Run automation now'}
            </button>
            <button type="button" className="toolbarButton toolbarButton--primary" onClick={openCreate}>
              + New campaign
            </button>
          </div>
        </div>
        {runResult ? <p className="viewMuted" style={{ margin: '8px 0 0' }}>{runResult}</p> : null}
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
                    <TriggerFields
                      trigger={createForm.autoCreditTrigger}
                      onTrigger={(t) => setCreateForm((f) => ({ ...f, autoCreditTrigger: t }))}
                      threshold={createForm.autoCreditThresholdValue}
                      onThreshold={(v) => setCreateForm((f) => ({ ...f, autoCreditThresholdValue: v }))}
                      minSpend={createForm.qualifyingMinSpendRM}
                      onMinSpend={(v) => setCreateForm((f) => ({ ...f, qualifyingMinSpendRM: v }))}
                    />
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
                        <TriggerFields
                          trigger={editForm.autoCreditTrigger ?? ''}
                          onTrigger={(t) => setEditForm((f) => ({ ...f, autoCreditTrigger: t }))}
                          threshold={editForm.autoCreditThresholdValue ?? ''}
                          onThreshold={(v) => setEditForm((f) => ({ ...f, autoCreditThresholdValue: v }))}
                          minSpend={editForm.qualifyingMinSpendRM ?? ''}
                          onMinSpend={(v) => setEditForm((f) => ({ ...f, qualifyingMinSpendRM: v }))}
                        />
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
