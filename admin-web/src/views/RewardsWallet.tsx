import { useEffect, useState } from 'react';
import {
  adjustCustomerLoyalty,
  adjustCustomerWallet,
  fetchCustomerDetail,
  fetchCustomerWallet,
  fetchCustomers,
  fetchLoyaltyLedgerGlobal,
  fetchWalletLedgerGlobal,
  reverseWalletTransaction,
  setWalletFreeze,
  type AdminCustomer,
  type AdminCustomerDetail,
  type LoyaltyLedgerEntry,
  type WalletLedgerEntry,
  type WalletSummary,
  type WalletTxnType,
} from '../api';

function formatRm(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}RM ${(Math.abs(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const WALLET_TYPE_LABELS: Record<WalletTxnType, string> = {
  TOPUP: 'Top-up',
  SPEND: 'Manual deduction',
  REFUND: 'Refund',
  MANUAL_ADJUSTMENT: 'Manual adjustment',
  PROMOTIONAL_BONUS: 'Promotional bonus',
  REVERSAL: 'Reversal',
};

const WALLET_ADJUST_TYPES: WalletTxnType[] = ['TOPUP', 'PROMOTIONAL_BONUS', 'REFUND', 'SPEND', 'MANUAL_ADJUSTMENT'];

/** Encodes the backend's sign rules so the admin never has to know them: SPEND is always a
 *  deduction, TOPUP/REFUND/PROMOTIONAL_BONUS are always credits, MANUAL_ADJUSTMENT is signed. */
function isDeductType(type: WalletTxnType): boolean {
  return type === 'SPEND';
}
function isSignedType(type: WalletTxnType): boolean {
  return type === 'MANUAL_ADJUSTMENT';
}

function CustomerPicker({ onSelect }: { onSelect: (c: AdminCustomer) => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminCustomer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setError(null);
    fetchCustomers({ search: search.trim(), pageSize: 10 })
      .then((res) => setResults(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Search failed'))
      .finally(() => setLoading(false));
  }

  return (
    <section className="panel">
      <h2 className="panelTitle">Find a member</h2>
      <form className="toolbar" onSubmit={runSearch}>
        <input
          type="text" className="toolbarInput" placeholder="Search phone, name, or email"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="toolbarButton toolbarButton--primary" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error ? <p className="viewError">{error}</p> : null}
      {results ? (
        <table className="dataTable" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Points</th><th></th></tr>
          </thead>
          <tbody>
            {results.map((c) => (
              <tr key={c.id} className="dataTableRowClickable" onClick={() => onSelect(c)}>
                <td>{c.displayName || '—'}</td>
                <td>{c.phoneE164}</td>
                <td>{c.pointsBalance.toLocaleString()}</td>
                <td><button type="button" className="toolbarButton">Select</button></td>
              </tr>
            ))}
            {results.length === 0 ? (
              <tr><td colSpan={4} className="dataTableEmpty">No members match this search.</td></tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

// Keyed by customer.id from the parent, so switching members mounts a fresh
// instance instead of needing an effect to resync local state from props.
function PointsPanel({ customer }: { customer: AdminCustomerDetail }) {
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>(customer.ledgerEntries);
  const [balance, setBalance] = useState(customer.wallet?.pointsCached ?? 0);
  const [deltaPoints, setDeltaPoints] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const delta = Number(deltaPoints);
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
      setError('Enter a non-zero whole number of points (negative to deduct).');
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await adjustCustomerLoyalty(customer.id, { deltaPoints: delta, reason: reason.trim() });
      setBalance(res.pointsBalance);
      setLedger((prev) => [
        { id: `local-${Date.now()}`, customerId: customer.id, deltaPoints: delta, balanceAfter: res.pointsBalance, referenceType: null, referenceId: null, reason: reason.trim(), createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setDeltaPoints('');
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust points');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panelTitle">Points</h2>
      <p className="statCardValue" style={{ marginTop: 8 }}>{balance.toLocaleString()} <span className="viewMuted" style={{ fontSize: 13, fontWeight: 500 }}>pts</span></p>

      <form className="drawerFieldGrid" onSubmit={submit} style={{ marginTop: 16 }}>
        <label className="filterField">
          Adjust by <span className="viewMuted">— negative to deduct</span>
          <input type="number" step="1" value={deltaPoints} onChange={(e) => setDeltaPoints(e.target.value)} placeholder="e.g. 100 or -50" />
        </label>
        <label className="filterField">
          Reason
          <input type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Goodwill credit, correction…" />
        </label>
        <button type="submit" className="toolbarButton toolbarButton--primary filterSubmit" disabled={saving}>
          {saving ? 'Saving…' : 'Adjust points'}
        </button>
      </form>
      {error ? <p className="viewError" style={{ marginTop: 8 }}>{error}</p> : null}

      <table className="dataTable dataTable--mini" style={{ marginTop: 16 }}>
        <thead>
          <tr><th>When</th><th>Δ</th><th>Balance</th><th>Reason</th></tr>
        </thead>
        <tbody>
          {ledger.map((e) => (
            <tr key={e.id}>
              <td>{formatDate(e.createdAt)}</td>
              <td className={e.deltaPoints >= 0 ? 'dataTablePositive' : 'dataTableNegative'}>
                {e.deltaPoints >= 0 ? '+' : ''}{e.deltaPoints.toLocaleString()}
              </td>
              <td>{e.balanceAfter.toLocaleString()}</td>
              <td className="dataTableMuted">{e.reason}</td>
            </tr>
          ))}
          {ledger.length === 0 ? <tr><td colSpan={4} className="dataTableEmpty">No points activity yet.</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}

function WalletPanel({ customerId }: { customerId: string }) {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [type, setType] = useState<WalletTxnType>('TOPUP');
  const [amountRm, setAmountRm] = useState('');
  const [reason, setReason] = useState('');
  const [campaignCode, setCampaignCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [freezeBusy, setFreezeBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before the fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setLoadError(null);
    fetchCustomerWallet(customerId)
      .then((res) => {
        if (!cancelled) {
          setSummary(res.summary);
          setTransactions(res.transactions);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load wallet');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const magnitude = Number(amountRm);
    if (!Number.isFinite(magnitude) || (isSignedType(type) ? magnitude === 0 : magnitude <= 0)) {
      setFormError(isSignedType(type) ? 'Enter a non-zero amount.' : 'Enter an amount greater than zero.');
      return;
    }
    if (!reason.trim()) {
      setFormError('A reason is required.');
      return;
    }
    let amountCents = Math.round(magnitude * 100);
    if (isDeductType(type)) amountCents = -Math.abs(amountCents);
    else if (!isSignedType(type)) amountCents = Math.abs(amountCents);

    setSaving(true);
    try {
      const res = await adjustCustomerWallet(customerId, {
        type,
        amountCents,
        reason: reason.trim(),
        campaignCode: campaignCode.trim() || undefined,
      });
      setSummary(res.summary);
      setTransactions((prev) => [res.entry, ...prev]);
      setAmountRm('');
      setReason('');
      setCampaignCode('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to adjust wallet');
    } finally {
      setSaving(false);
    }
  }

  async function toggleFreeze() {
    if (!summary) return;
    const next = !summary.isFrozen;
    if (next && !window.confirm('Freeze this wallet? The member will not be able to top up or spend until unfrozen.')) return;
    setFreezeBusy(true);
    try {
      const res = await setWalletFreeze(customerId, next);
      setSummary((s) => (s ? { ...s, isFrozen: res.isFrozen } : s));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update freeze state');
    } finally {
      setFreezeBusy(false);
    }
  }

  async function reverse(txn: WalletLedgerEntry) {
    const reasonText = window.prompt(`Reason for reversing this ${WALLET_TYPE_LABELS[txn.type]} of ${formatRm(txn.amountCents)}:`);
    if (reasonText == null) return;
    if (!reasonText.trim()) {
      window.alert('A reason is required to reverse a transaction.');
      return;
    }
    try {
      const res = await reverseWalletTransaction(customerId, txn.id, reasonText.trim());
      setSummary(res.summary);
      setTransactions((prev) => [res.reversal, ...prev.map((t) => (t.id === txn.id ? { ...t, reversedByTxnId: res.reversal.id } : t))]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to reverse transaction');
    }
  }

  if (loading) return <section className="panel"><p className="viewMuted">Loading wallet…</p></section>;
  if (loadError) return <section className="panel"><p className="viewError">{loadError}</p></section>;
  if (!summary) return null;

  return (
    <section className="panel">
      <div className="panelHead">
        <h2 className="panelTitle">Wallet</h2>
        <span className={`badge badge--${summary.isFrozen ? 'danger' : 'success'}`}>
          {summary.isFrozen ? 'Frozen' : 'Active'}
        </span>
      </div>
      <p className="statCardValue" style={{ marginTop: 8 }}>{formatRm(summary.currentWalletBalance)}</p>
      <p className="viewMuted" style={{ marginTop: 4 }}>
        {formatRm(summary.lifetimeTopUpAmount)} lifetime top-ups · {formatRm(summary.lifetimeSpentAmount)} lifetime spent
        {summary.promotionalCreditTotal ? ` · ${formatRm(summary.promotionalCreditTotal)} promotional` : ''}
        {summary.pendingCredit ? ` · ${formatRm(summary.pendingCredit)} pending` : ''}
      </p>
      <button type="button" className="toolbarButton" style={{ marginTop: 10 }} onClick={toggleFreeze} disabled={freezeBusy}>
        {summary.isFrozen ? 'Unfreeze wallet' : 'Freeze wallet'}
      </button>

      <form className="drawerFieldGrid" onSubmit={submit} style={{ marginTop: 20 }}>
        <label className="filterField">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as WalletTxnType)}>
            {WALLET_ADJUST_TYPES.map((t) => (
              <option key={t} value={t}>{WALLET_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="filterField">
          Amount (RM) {isDeductType(type) ? <span className="viewMuted">— will be deducted</span> : null}
          <input type="number" step="0.01" value={amountRm} onChange={(e) => setAmountRm(e.target.value)} placeholder={isSignedType(type) ? 'e.g. 10 or -10' : '0.00'} />
        </label>
        <label className="filterField">
          Reason
          <input type="text" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Compensation, correction…" />
        </label>
        <label className="filterField">
          Campaign code <span className="viewMuted">— optional</span>
          <input type="text" maxLength={200} value={campaignCode} onChange={(e) => setCampaignCode(e.target.value)} />
        </label>
        <button type="submit" className="toolbarButton toolbarButton--primary filterSubmit" disabled={saving}>
          {saving ? 'Saving…' : 'Adjust wallet'}
        </button>
      </form>
      {formError ? <p className="viewError" style={{ marginTop: 8 }}>{formError}</p> : null}

      <table className="dataTable dataTable--mini" style={{ marginTop: 16 }}>
        <thead>
          <tr><th>When</th><th>Type</th><th>Amount</th><th>Balance</th><th>Reason</th><th></th></tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{formatDate(t.createdAt)}</td>
              <td><span className="badge badge--neutral">{WALLET_TYPE_LABELS[t.type]}</span></td>
              <td className={t.amountCents >= 0 ? 'dataTablePositive' : 'dataTableNegative'}>{formatRm(t.amountCents)}</td>
              <td>{formatRm(t.balanceAfter)}</td>
              <td className="dataTableMuted">{t.reason}</td>
              <td>
                {t.type !== 'REVERSAL' && !t.reversedByTxnId ? (
                  <button type="button" className="toolbarButton" onClick={() => reverse(t)}>Reverse</button>
                ) : t.reversedByTxnId ? (
                  <span className="dataTableMuted">Reversed</span>
                ) : null}
              </td>
            </tr>
          ))}
          {transactions.length === 0 ? <tr><td colSpan={6} className="dataTableEmpty">No wallet activity yet.</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}

export function RewardsWallet() {
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [recentLoyalty, setRecentLoyalty] = useState<LoyaltyLedgerEntry[] | null>(null);
  const [recentWallet, setRecentWallet] = useState<WalletLedgerEntry[] | null>(null);

  useEffect(() => {
    if (detail) return;
    fetchLoyaltyLedgerGlobal(20).then(setRecentLoyalty).catch(() => setRecentLoyalty([]));
    fetchWalletLedgerGlobal(20).then(setRecentWallet).catch(() => setRecentWallet([]));
  }, [detail]);

  function selectCustomerId(id: string) {
    setDetailError(null);
    fetchCustomerDetail(id)
      .then(setDetail)
      .catch((err) => setDetailError(err instanceof Error ? err.message : 'Failed to load member'));
  }

  return (
    <div className="viewStack">
      <section className="panel">
        <h2 className="panelTitle">Points &amp; wallet</h2>
        <p className="viewMuted" style={{ margin: '4px 0 0' }}>
          Two separate balances: <strong>points</strong> (loyalty, earn/redeem) and <strong>wallet</strong> (real money, topped up and spent at checkout).
        </p>
      </section>

      {detail ? (
        <section className="panel">
          <div className="panelHead">
            <div>
              <span className="panelTitle">{detail.displayName || detail.phoneE164}</span>
              <span className="viewMuted" style={{ marginLeft: 10 }}>{detail.phoneE164}</span>
            </div>
            <button type="button" className="toolbarButton" onClick={() => setDetail(null)}>
              Change member
            </button>
          </div>
        </section>
      ) : (
        <CustomerPicker onSelect={(c) => selectCustomerId(c.id)} />
      )}

      {detailError ? <p className="viewError">{detailError}</p> : null}

      {detail ? (
        <div className="panelGrid panelGrid--2">
          <PointsPanel key={detail.id} customer={detail} />
          <WalletPanel key={detail.id} customerId={detail.id} />
        </div>
      ) : null}

      {!detail ? (
        <div className="panelGrid panelGrid--2">
          <section className="panel">
            <h2 className="panelTitle">Recent points activity</h2>
            <table className="dataTable dataTable--mini" style={{ marginTop: 8 }}>
              <thead><tr><th>Member</th><th>Δ</th><th>Reason</th><th>When</th></tr></thead>
              <tbody>
                {(recentLoyalty ?? []).map((e) => (
                  <tr key={e.id} className="dataTableRowClickable" onClick={() => selectCustomerId(e.customerId)}>
                    <td>{e.customerPhone}</td>
                    <td className={e.deltaPoints >= 0 ? 'dataTablePositive' : 'dataTableNegative'}>
                      {e.deltaPoints >= 0 ? '+' : ''}{e.deltaPoints.toLocaleString()}
                    </td>
                    <td className="dataTableMuted">{e.reason}</td>
                    <td>{formatDate(e.createdAt)}</td>
                  </tr>
                ))}
                {recentLoyalty && recentLoyalty.length === 0 ? (
                  <tr><td colSpan={4} className="dataTableEmpty">No points activity yet.</td></tr>
                ) : null}
                {!recentLoyalty ? <tr><td colSpan={4} className="dataTableEmpty">Loading…</td></tr> : null}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2 className="panelTitle">Recent wallet activity</h2>
            <table className="dataTable dataTable--mini" style={{ marginTop: 8 }}>
              <thead><tr><th>Member</th><th>Type</th><th>Amount</th><th>When</th></tr></thead>
              <tbody>
                {(recentWallet ?? []).map((t) => (
                  <tr key={t.id} className="dataTableRowClickable" onClick={() => selectCustomerId(t.customerId)}>
                    <td>{t.customerPhone}</td>
                    <td><span className="badge badge--neutral">{WALLET_TYPE_LABELS[t.type]}</span></td>
                    <td className={t.amountCents >= 0 ? 'dataTablePositive' : 'dataTableNegative'}>{formatRm(t.amountCents)}</td>
                    <td>{formatDate(t.createdAt)}</td>
                  </tr>
                ))}
                {recentWallet && recentWallet.length === 0 ? (
                  <tr><td colSpan={4} className="dataTableEmpty">No wallet activity yet.</td></tr>
                ) : null}
                {!recentWallet ? <tr><td colSpan={4} className="dataTableEmpty">Loading…</td></tr> : null}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </div>
  );
}
