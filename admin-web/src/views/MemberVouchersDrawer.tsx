import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCampaigns,
  fetchMemberVouchers,
  issueMemberVoucher,
  revokeMemberVoucher,
  updateMemberVoucher,
  type CampaignSummary,
  type MemberVoucher,
  type MemberVouchersPayload,
} from '../api';

/** ISO instant -> the yyyy-mm-dd day in Malaysia, for a date input. */
function toDay(iso: string | null): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  LOCKED: 'warning',
  USED: 'neutral',
  EXPIRED: 'warning',
  VOID: 'danger',
};

const LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  LOCKED: 'In checkout',
  USED: 'Used',
  EXPIRED: 'Expired',
  VOID: 'Withdrawn',
};

type Draft = { name: string; expiry: string };

/**
 * A member's campaign vouchers, for fixing one that was sent by mistake: change
 * when it expires or what it is called, withdraw it, bring a withdrawn one back,
 * or send the right one. Everything is recorded in the audit log.
 */
export function MemberVouchersDrawer({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<MemberVouchersPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [sendCampaign, setSendCampaign] = useState('');
  const [sendExpiry, setSendExpiry] = useState('');
  const [sending, setSending] = useState(false);

  const apply = useCallback((payload: MemberVouchersPayload) => {
    setData(payload);
    setDrafts(
      Object.fromEntries(payload.vouchers.map((v) => [v.id, { name: v.name, expiry: toDay(v.expiresAt) }])),
    );
  }, []);

  useEffect(() => {
    let alive = true;
    fetchMemberVouchers(customerId)
      .then((p) => {
        if (alive) apply(p);
      })
      .catch((err) => {
        if (alive) setLoadError(err instanceof Error ? err.message : 'Failed to load vouchers');
      });
    fetchCampaigns()
      .then((list) => {
        if (alive) setCampaigns(list.filter((c) => c.status === 'active'));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [customerId, apply]);

  const changedIds = useMemo(() => {
    const out = new Set<string>();
    for (const v of data?.vouchers ?? []) {
      const d = drafts[v.id];
      if (d && (d.name.trim() !== v.name || d.expiry !== toDay(v.expiresAt))) out.add(v.id);
    }
    return out;
  }, [data, drafts]);

  async function run(id: string, action: () => Promise<MemberVouchersPayload>, done: string) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      apply(await action());
      setMessage(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
    } finally {
      setBusyId(null);
    }
  }

  function save(v: MemberVoucher) {
    const d = drafts[v.id];
    if (!d) return;
    const patch: { name?: string; expiresAt?: string | null } = {};
    if (d.name.trim() !== v.name) patch.name = d.name.trim();
    if (d.expiry !== toDay(v.expiresAt)) patch.expiresAt = d.expiry === '' ? null : d.expiry;
    if (patch.expiresAt === null && !window.confirm('Leave this voucher with no expiry date?')) return;
    void run(v.id, () => updateMemberVoucher(customerId, v.id, patch), 'Saved.');
  }

  function withdraw(v: MemberVoucher) {
    const reason = window.prompt(`Withdraw "${v.name}" (${v.code}) from this member? Reason (optional):`);
    if (reason == null) return;
    void run(v.id, () => revokeMemberVoucher(customerId, v.id, reason.trim() || undefined), 'Withdrawn — the member can no longer see or use it.');
  }

  function restore(v: MemberVoucher) {
    const d = drafts[v.id];
    const expired = v.effectiveStatus === 'EXPIRED' || (v.expiresAt !== null && new Date(v.expiresAt) <= new Date());
    if (expired && (!d?.expiry || new Date(`${d.expiry}T23:59:59+08:00`) <= new Date())) {
      setError('Set a new expiry date in the future first, then restore it.');
      return;
    }
    const patch: { reinstate: true; expiresAt?: string } = { reinstate: true };
    if (d && d.expiry !== toDay(v.expiresAt) && d.expiry) patch.expiresAt = d.expiry;
    void run(v.id, () => updateMemberVoucher(customerId, v.id, patch), 'Restored — it is back in the member’s wallet.');
  }

  async function send() {
    if (!sendCampaign) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      apply(await issueMemberVoucher(customerId, { campaignId: sendCampaign, expiresAt: sendExpiry || undefined }));
      setMessage('Voucher sent.');
      setSendCampaign('');
      setSendExpiry('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the voucher');
    } finally {
      setSending(false);
    }
  }

  const member = data?.member;

  return (
    <div className="drawerBackdrop" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawerHead">
          <h2 className="panelTitle">
            Vouchers{member ? ` · ${member.displayName || member.phoneE164}` : ''}
          </h2>
          <button type="button" className="drawerClose" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="drawerBody">
          {loadError ? <p className="viewError">{loadError}</p> : null}
          {!data && !loadError ? <p className="viewMuted">Loading…</p> : null}
          {error ? <p className="viewError">{error}</p> : null}
          {message ? <p className="viewMuted">{message}</p> : null}

          {data ? (
            <section>
              <h3 className="drawerSectionTitle">Vouchers in their wallet</h3>
              {data.vouchers.length === 0 ? <p className="viewMuted">This member has no campaign vouchers.</p> : null}
              {data.vouchers.map((v) => {
                const d = drafts[v.id] ?? { name: v.name, expiry: toDay(v.expiresAt) };
                const busy = busyId === v.id;
                const editable = v.canEdit;
                const canWithdraw = editable && v.status !== 'VOID';
                const canRestore = editable && (v.status === 'VOID' || v.effectiveStatus === 'EXPIRED');
                return (
                  <div
                    key={v.id}
                    style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, padding: 12, marginBottom: 12 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <strong>{v.name}</strong>{' '}
                        <span className={`badge badge--${TONE[v.effectiveStatus] ?? 'neutral'}`}>
                          {LABEL[v.effectiveStatus] ?? v.effectiveStatus}
                        </span>
                        <div className="viewMuted">
                          <code>{v.code}</code>
                          {v.campaign ? ` · ${v.campaign.name} (${v.campaign.discount})` : ''}
                        </div>
                        <div className="viewMuted">
                          Sent {formatDate(v.issuedAt)}
                          {v.usedAt ? ` · used ${formatDate(v.usedAt)}` : ''}
                          {v.withdrawnReason ? ` · withdrawn: ${v.withdrawnReason}` : ''}
                        </div>
                      </div>
                    </div>

                    {editable ? (
                      <>
                        <div className="drawerFieldGrid" style={{ marginTop: 10 }}>
                          <label className="filterField">
                            Name the member sees
                            <input
                              type="text"
                              maxLength={120}
                              value={d.name}
                              disabled={busy}
                              onChange={(e) => setDrafts((p) => ({ ...p, [v.id]: { ...d, name: e.target.value } }))}
                            />
                          </label>
                          <label className="filterField">
                            Valid until <span className="viewMuted">— blank = no expiry</span>
                            <input
                              type="date"
                              value={d.expiry}
                              disabled={busy}
                              onChange={(e) => setDrafts((p) => ({ ...p, [v.id]: { ...d, expiry: e.target.value } }))}
                            />
                          </label>
                        </div>
                        <div className="drawerRowActions" style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            className="toolbarButton toolbarButton--primary"
                            disabled={busy || !changedIds.has(v.id)}
                            onClick={() => save(v)}
                          >
                            {busy ? 'Working…' : 'Save changes'}
                          </button>
                          {canRestore ? (
                            <button type="button" className="toolbarButton" disabled={busy} onClick={() => restore(v)}>
                              Restore
                            </button>
                          ) : null}
                          {canWithdraw ? (
                            <button type="button" className="toolbarButton" disabled={busy} onClick={() => withdraw(v)}>
                              Withdraw
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <p className="viewMuted" style={{ marginBottom: 0 }}>
                        Already used, so it can’t be changed.
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          ) : null}

          {data ? (
            <section>
              <h3 className="drawerSectionTitle">Send another voucher</h3>
              <p className="viewMuted" style={{ marginTop: 0 }}>
                Sent the wrong one? Withdraw it above, then send the right one here.
              </p>
              <div className="drawerFieldGrid">
                <label className="filterField">
                  Campaign
                  <select value={sendCampaign} onChange={(e) => setSendCampaign(e.target.value)}>
                    <option value="">Choose a campaign…</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.discountDisplay}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filterField">
                  Valid until <span className="viewMuted">— optional</span>
                  <input type="date" value={sendExpiry} onChange={(e) => setSendExpiry(e.target.value)} />
                </label>
              </div>
              <div className="drawerRowActions" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="toolbarButton toolbarButton--primary"
                  disabled={!sendCampaign || sending}
                  onClick={() => void send()}
                >
                  {sending ? 'Sending…' : 'Send voucher'}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
