import { useCallback, useEffect, useState } from 'react';
import { fetchMemberVouchers, redeemMemberVoucher, type MemberVoucher } from './api';

function formatRm(cents: number | null | undefined): string {
  return `RM ${((cents ?? 0) / 100).toFixed(2)}`;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return 'No expiry';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `Valid until ${d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/**
 * The member's own vouchers — welcome, birthday, win-back, referral, points
 * rewards — the same ones the member sees in the app. Using one marks it used
 * straight away and shows the cashier the discount to key into the till.
 */
export function MemberVouchersPanel({
  apiKey,
  base,
  staffCode,
  phone,
  memberName,
  activated,
  verification,
  onCount,
}: {
  apiKey: string;
  base: string;
  staffCode: string;
  /** The member's phone, as shown on the card. */
  phone: string;
  memberName: string | null;
  /** Has the member ever signed in themselves? Vouchers of an unactivated account cannot be used. */
  activated: boolean;
  verification: 'QR' | 'PHONE';
  /** How many usable vouchers the member has, for the card's stats. */
  onCount: (n: number) => void;
}) {
  const [vouchers, setVouchers] = useState<MemberVoucher[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MemberVoucher | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState<{ title: string; discountLabel: string; minSpendCents: number | null } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const list = await fetchMemberVouchers(apiKey, phone, base);
      setVouchers(list);
      setLoadError(null);
      onCount(list.length);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load vouchers');
    }
  }, [apiKey, phone, base, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    if (!confirming) return;
    setBusy(true);
    setError(null);
    try {
      const res = await redeemMemberVoucher(
        apiKey,
        { phone, voucherId: confirming.id, source: confirming.source, staffCode, verification },
        base,
      );
      setUsed(res);
      setConfirming(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use this voucher');
      // It may have just been used elsewhere — show the list as it is now.
      void load();
    } finally {
      setBusy(false);
    }
  }

  // ---- after use: what to key into the till
  if (used) {
    return (
      <section className="redeemResult" aria-live="polite">
        <p className="redeemResultTitle">✓ Voucher used</p>
        <p className="redeemKeyLabel">Key this discount into SalesPlay</p>
        <p className="redeemKeyValue">{used.discountLabel || used.title}</p>
        {used.minSpendCents ? <p className="memberHint">Minimum spend {formatRm(used.minSpendCents)}.</p> : null}
        <p className="memberHint">{used.title} is now used and has left the member’s wallet.</p>
        <div className="redeemActions">
          <button type="button" className="memberPrimary" onClick={() => setUsed(null)}>
            Done
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="redeemPanel">
      <h3>Vouchers</h3>
      {!activated ? (
        <p className="memberAdvice memberAdvice--action">
          This member has not signed in to the app yet, so their vouchers cannot be used. Ask them to open Moja on their
          own phone and sign in once — their vouchers are safe.
        </p>
      ) : null}
      {!staffCode.trim() ? <p className="memberHint">Enter your staff code (top right) to use a voucher.</p> : null}
      {loadError ? (
        <p className="memberError" role="alert">
          {loadError}
        </p>
      ) : null}
      {vouchers === null && !loadError ? <p className="memberHint">Loading vouchers…</p> : null}
      {vouchers && vouchers.length === 0 ? <p className="memberHint">No vouchers to use right now.</p> : null}

      {confirming ? (
        <div className="redeemConfirm" role="alertdialog" aria-label="Confirm voucher">
          <p>
            Use <strong>{confirming.title}</strong>
            {confirming.discountLabel ? ` (${confirming.discountLabel})` : ''} for {memberName || 'this member'}?
          </p>
          <p className="memberHint">
            Identified by {verification === 'QR' ? 'QR scan' : 'typed phone number'}. The voucher is used straight away
            and cannot be used again.
          </p>
          {error ? (
            <p className="memberError" role="alert">
              {error}
            </p>
          ) : null}
          <div className="redeemActions">
            <button
              type="button"
              className="redeemUndo"
              onClick={() => {
                setConfirming(null);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="button" className="memberPrimary" onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Using…' : 'Confirm use'}
            </button>
          </div>
        </div>
      ) : (
        <ul className="redeemList">
          {(vouchers ?? []).map((v) => {
            const blocked = !activated || !staffCode.trim() || v.inUseOnline;
            return (
              <li key={`${v.source}:${v.id}`} className="redeemRow">
                <div>
                  <strong>{v.title}</strong> <span className="voucherKind">{v.kind}</span>
                  <span className="memberHint" style={{ display: 'block', margin: 0 }}>
                    {[
                      v.discountLabel,
                      v.minSpendCents ? `min spend ${formatRm(v.minSpendCents)}` : '',
                      formatExpiry(v.expiresAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    setError(null);
                    setConfirming(v);
                  }}
                >
                  {v.inUseOnline ? 'In online checkout' : 'Use'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!confirming && error ? (
        <p className="memberError" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
