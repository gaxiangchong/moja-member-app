import { useState } from 'react';
import {
  fetchRedeemableVouchers,
  redeemVoucherInStore,
  type AdminCustomer,
  type RedeemableVoucher,
} from '../api';
import { CustomerSearch } from '../components/CustomerSearch';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function RedeemVoucher() {
  const [member, setMember] = useState<AdminCustomer | null>(null);
  const [vouchers, setVouchers] = useState<RedeemableVoucher[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function selectMember(c: AdminCustomer) {
    setMember(c);
    setError(null);
    setLoading(true);
    fetchRedeemableVouchers(c.id)
      .then(setVouchers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load vouchers'))
      .finally(() => setLoading(false));
  }

  async function redeem(v: RedeemableVoucher) {
    if (!member) return;
    if (!window.confirm(`Redeem "${v.title}" (${v.code}) for ${member.displayName || member.phoneE164}?\n\nOnly do this after applying the discount manually at the till — this cannot be undone.`)) {
      return;
    }
    setBusyId(v.id);
    try {
      await redeemVoucherInStore(member.id, v.id, v.source);
      setVouchers((prev) => (prev ? prev.filter((x) => x.id !== v.id) : prev));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to redeem voucher');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="viewStack">
      <section className="panel">
        <h2 className="panelTitle">Redeem voucher</h2>
        <p className="viewMuted" style={{ margin: '4px 0 0' }}>
          In-store redemption for a walk-in member. SalesPlay has no discount API — apply the discount manually
          at the till first, then redeem here to prevent it being used twice.
        </p>
      </section>

      {member ? (
        <section className="panel">
          <div className="panelHead">
            <div>
              <span className="panelTitle">{member.displayName || member.phoneE164}</span>
              <span className="viewMuted" style={{ marginLeft: 10 }}>{member.phoneE164}</span>
            </div>
            <button type="button" className="toolbarButton" onClick={() => { setMember(null); setVouchers(null); }}>
              Change member
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <h2 className="panelTitle">Find a member</h2>
          <div style={{ marginTop: 12 }}>
            <CustomerSearch actionLabel="Select" onSelect={selectMember} />
          </div>
        </section>
      )}

      {member ? (
        <section className="panel">
          <h2 className="panelTitle">Redeemable vouchers</h2>
          {loading ? <p className="viewMuted">Loading…</p> : null}
          {error ? <p className="viewError">{error}</p> : null}
          {!loading && !error && vouchers ? (
            <table className="dataTable" style={{ marginTop: 8 }}>
              <thead>
                <tr><th>Code</th><th>Title</th><th>Discount</th><th>Source</th><th>Expires</th><th></th></tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td className="dataTableMuted">{v.code}</td>
                    <td>{v.title}</td>
                    <td>{v.discountLabel || '—'}</td>
                    <td><span className="badge badge--neutral">{v.source === 'CATALOG' ? 'Points catalog' : 'Campaign'}</span></td>
                    <td className="dataTableMuted">{formatDate(v.expiresAt)}</td>
                    <td>
                      {v.locked ? (
                        <span className="badge badge--warning">Locked (online checkout)</span>
                      ) : (
                        <button type="button" className="toolbarButton toolbarButton--primary" onClick={() => redeem(v)} disabled={busyId === v.id}>
                          {busyId === v.id ? 'Redeeming…' : 'Redeem'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {vouchers.length === 0 ? (
                  <tr><td colSpan={6} className="dataTableEmpty">No redeemable vouchers for this member.</td></tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
