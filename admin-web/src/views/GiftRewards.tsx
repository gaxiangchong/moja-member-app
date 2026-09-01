import { useEffect, useState } from 'react';
import {
  createRewardCatalogEntry,
  deleteRewardCatalogEntry,
  fetchCampaigns,
  fetchRewardCatalog,
  updateRewardCatalogEntry,
  type CampaignSummary,
  type RewardCatalogEntry,
  type RewardType,
} from '../api';

const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  FREE_ITEM: 'Free item',
  DISCOUNT_VOUCHER: 'Discount voucher',
  LIMITED_TIME: 'Limited time',
};

function generateCode(): string {
  return `GIFT-${Date.now().toString(36).toUpperCase()}`;
}

type Form = {
  name: string;
  description: string;
  rewardType: RewardType;
  pointsCost: string;
  voucherCampaignId: string;
  visibleInRewardsWallet: boolean;
  isActive: boolean;
  tncText: string;
};

function emptyForm(): Form {
  return { name: '', description: '', rewardType: 'FREE_ITEM', pointsCost: '', voucherCampaignId: '', visibleInRewardsWallet: true, isActive: true, tncText: '' };
}

function formFromEntry(e: RewardCatalogEntry): Form {
  return {
    name: e.name,
    description: e.description ?? '',
    rewardType: e.rewardType,
    pointsCost: String(e.pointsCost),
    voucherCampaignId: e.voucherCampaignId ?? '',
    visibleInRewardsWallet: e.visibleInRewardsWallet,
    isActive: e.isActive,
    tncText: e.tncText ?? '',
  };
}

export function GiftRewards() {
  const [entries, setEntries] = useState<RewardCatalogEntry[] | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RewardCatalogEntry | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before the fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    Promise.all([fetchRewardCatalog(), fetchCampaigns()])
      .then(([e, c]) => {
        setEntries(e);
        setCampaigns(c);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load rewards'))
      .finally(() => setLoading(false));
  }, []);

  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(e: RewardCatalogEntry) {
    setEditing(e);
    setForm(formFromEntry(e));
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  async function handleSave() {
    setFormError(null);
    if (!form.name.trim()) return setFormError('Name is required.');
    const pointsCost = Number(form.pointsCost);
    if (!Number.isInteger(pointsCost) || pointsCost < 0) return setFormError('Points cost must be a whole number.');
    if (form.rewardType === 'DISCOUNT_VOUCHER' && !form.voucherCampaignId) {
      return setFormError('Pick a linked campaign for a discount voucher reward.');
    }

    setSaving(true);
    try {
      if (editing) {
        const updated = await updateRewardCatalogEntry(editing.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          pointsCost,
          voucherCampaignId: form.rewardType === 'DISCOUNT_VOUCHER' ? form.voucherCampaignId : undefined,
          visibleInRewardsWallet: form.visibleInRewardsWallet,
          isActive: form.isActive,
          tncText: form.tncText.trim() || undefined,
        });
        setEntries((prev) => prev?.map((e) => (e.id === updated.id ? updated : e)) ?? prev);
      } else {
        const created = await createRewardCatalogEntry({
          code: generateCode(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          rewardType: form.rewardType,
          pointsCost,
          voucherCampaignId: form.rewardType === 'DISCOUNT_VOUCHER' ? form.voucherCampaignId : undefined,
          visibleInRewardsWallet: form.visibleInRewardsWallet,
          isActive: form.isActive,
          tncText: form.tncText.trim() || undefined,
        });
        setEntries((prev) => (prev ? [created, ...prev] : [created]));
      }
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save reward');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Delete "${editing.name}"? Only possible if no member has redeemed it.`)) return;
    try {
      await deleteRewardCatalogEntry(editing.id);
      setEntries((prev) => prev?.filter((e) => e.id !== editing.id) ?? prev);
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete reward');
    }
  }

  return (
    <div className="viewStack">
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2 className="panelTitle">Gift rewards</h2>
            <p className="viewMuted" style={{ margin: '4px 0 0' }}>
              Points-redeemable catalog. A discount-voucher reward auto-issues from its linked campaign on redemption.
            </p>
          </div>
          <button type="button" className="toolbarButton toolbarButton--primary" onClick={openCreate}>
            + New reward
          </button>
        </div>
      </section>

      {loading ? <p className="viewMuted">Loading…</p> : null}
      {error ? <p className="viewError">{error}</p> : null}

      {!loading && !error ? (
        <section className="panel">
          <table className="dataTable">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Points</th><th>Linked campaign</th><th>Wallet</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id} className="dataTableRowClickable" onClick={() => openEdit(e)}>
                  <td>
                    {e.name}
                    <div className="dataTableMuted">{e.code}</div>
                  </td>
                  <td>{REWARD_TYPE_LABELS[e.rewardType]}</td>
                  <td>{e.pointsCost.toLocaleString()}</td>
                  <td className="dataTableMuted">{e.voucherCampaignId ? campaignById.get(e.voucherCampaignId)?.name ?? '—' : '—'}</td>
                  <td><span className={`badge badge--${e.visibleInRewardsWallet ? 'success' : 'neutral'}`}>{e.visibleInRewardsWallet ? 'Visible' : 'Hidden'}</span></td>
                  <td><span className={`badge badge--${e.isActive ? 'success' : 'neutral'}`}>{e.isActive ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
              {(entries ?? []).length === 0 ? (
                <tr><td colSpan={6} className="dataTableEmpty">No gift rewards yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {drawerOpen ? (
        <div className="drawerBackdrop" onMouseDown={closeDrawer}>
          <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="drawerHead">
              <h2 className="panelTitle">{editing ? 'Edit reward' : 'New reward'}</h2>
              <button type="button" className="drawerClose" onClick={closeDrawer} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="drawerBody">
              <section>
                <label className="filterField">
                  Name
                  <input type="text" maxLength={160} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="filterField" style={{ marginTop: 12 }}>
                  Description <span className="viewMuted">— optional</span>
                  <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </label>
              </section>

              <section>
                <h3 className="drawerSectionTitle">Type &amp; cost</h3>
                <div className="drawerFieldGrid">
                  <label className="filterField">
                    Reward type
                    <select
                      value={form.rewardType} disabled={Boolean(editing)}
                      onChange={(e) => setForm((f) => ({ ...f, rewardType: e.target.value as RewardType }))}
                    >
                      <option value="FREE_ITEM">Free item</option>
                      <option value="DISCOUNT_VOUCHER">Discount voucher</option>
                    </select>
                  </label>
                  <label className="filterField">
                    Points cost
                    <input type="number" min={0} value={form.pointsCost} onChange={(e) => setForm((f) => ({ ...f, pointsCost: e.target.value }))} />
                  </label>
                </div>
                {form.rewardType === 'DISCOUNT_VOUCHER' ? (
                  <label className="filterField" style={{ marginTop: 12 }}>
                    Linked campaign <span className="viewMuted">— issues its voucher on redemption</span>
                    <select value={form.voucherCampaignId} onChange={(e) => setForm((f) => ({ ...f, voucherCampaignId: e.target.value }))}>
                      <option value="">Select a campaign…</option>
                      {(campaigns ?? []).map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </section>

              <section>
                <h3 className="drawerSectionTitle">Visibility</h3>
                <div className="drawerRowActions">
                  <label className="switchRow">
                    <span className="switch">
                      <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                      <span className="switchTrack" aria-hidden />
                    </span>
                    <span>Active</span>
                  </label>
                  <label className="switchRow">
                    <span className="switch">
                      <input type="checkbox" checked={form.visibleInRewardsWallet} onChange={(e) => setForm((f) => ({ ...f, visibleInRewardsWallet: e.target.checked }))} />
                      <span className="switchTrack" aria-hidden />
                    </span>
                    <span>Visible in rewards wallet</span>
                  </label>
                </div>
                <label className="filterField" style={{ marginTop: 12 }}>
                  Terms &amp; conditions
                  <textarea rows={3} value={form.tncText} onChange={(e) => setForm((f) => ({ ...f, tncText: e.target.value }))} />
                </label>
              </section>
            </div>

            <div className="drawerFooter">
              <div>{formError ? <span className="viewError">{formError}</span> : null}</div>
              <div className="drawerRowActions">
                {editing ? (
                  <button type="button" className="toolbarButton" onClick={handleDelete}>Delete</button>
                ) : null}
                <button type="button" className="toolbarButton toolbarButton--primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create reward'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
