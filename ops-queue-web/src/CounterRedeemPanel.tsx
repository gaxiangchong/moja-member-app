import { useCallback, useEffect, useState } from 'react';
import {
  attachRedemptionReceipt,
  fetchCounterRewards,
  redeemAtCounter,
  undoCounterRedemption,
  type CounterRedeemResult,
  type CounterReward,
} from './api';

function formatRm(cents: number | null | undefined): string {
  return `RM ${((cents ?? 0) / 100).toFixed(2)}`;
}

/**
 * Redeem a member's points at the counter. The points come off straight away and
 * the cashier is shown the discount to key into the till. If the sale falls
 * through, "Undo" gives the points back.
 */
export function CounterRedeemPanel({
  apiKey,
  base,
  staffCode,
  phone,
  memberName,
  pointsBalance,
  activated,
  verification,
  onPointsChanged,
}: {
  apiKey: string;
  base: string;
  staffCode: string;
  /** The member's phone, as shown on the card. */
  phone: string;
  memberName: string | null;
  pointsBalance: number;
  /** Has the member ever signed in themselves? Points of an unactivated account cannot be spent. */
  activated: boolean;
  verification: 'QR' | 'PHONE';
  /** Tells the parent the member's balance changed, so the card updates. */
  onPointsChanged: (balance: number) => void;
}) {
  const [rewards, setRewards] = useState<CounterReward[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ reward: CounterReward; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterRedeemResult | null>(null);
  const [receiptRef, setReceiptRef] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCounterRewards(apiKey, base)
      .then((r) => {
        if (alive) setRewards(r);
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : 'Could not load rewards');
      });
    return () => {
      alive = false;
    };
  }, [apiKey, base]);

  const confirm = useCallback(async () => {
    if (!confirming) return;
    setBusy(true);
    setError(null);
    try {
      const res = await redeemAtCounter(
        apiKey,
        {
          phone,
          rewardId: confirming.reward.id,
          staffCode,
          idempotencyKey: confirming.key,
          verification,
        },
        base,
      );
      setResult(res);
      setReceiptRef('');
      setNote(null);
      setConfirming(null);
      onPointsChanged(res.pointsBalance);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not redeem');
    } finally {
      setBusy(false);
    }
  }, [apiKey, base, confirming, onPointsChanged, phone, staffCode, verification]);

  async function undo() {
    if (!result) return;
    const reason = window.prompt('Why is it being undone? (optional)', 'Customer changed their mind');
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      await undoCounterRedemption(apiKey, result.redemption.id, { staffCode, reason: reason.trim() || undefined }, base);
      onPointsChanged(result.pointsBalance + result.redemption.pointsSpent);
      setResult(null);
      setNote(`Undone — ${result.redemption.pointsSpent} points returned to ${memberName || 'the member'}. Remove the discount from the till.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo');
    } finally {
      setBusy(false);
    }
  }

  async function saveReceipt() {
    if (!result || !receiptRef.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await attachRedemptionReceipt(apiKey, result.redemption.id, { staffCode, receiptRef: receiptRef.trim() }, base);
      setResult({ ...result, redemption: res.redemption });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the receipt number');
    } finally {
      setBusy(false);
    }
  }

  // ---- after a redemption: what to key into the till
  if (result) {
    const r = result.redemption;
    return (
      <section className="redeemResult" aria-live="polite">
        <p className="redeemResultTitle">✓ Redeemed{result.repeat ? ' (already done a moment ago)' : ''}</p>
        <p className="redeemKeyLabel">Key this discount into SalesPlay</p>
        <p className="redeemKeyValue">{r.discountLabel}</p>
        {r.minSpendCents ? <p className="memberHint">Minimum spend {formatRm(r.minSpendCents)}.</p> : null}
        <p className="memberHint">
          {r.rewardTitle} · {r.pointsSpent} points used · <strong>{result.pointsBalance}</strong> left · reference{' '}
          <strong>{r.voucherCode}</strong>
        </p>
        <div className="redeemReceipt">
          <label htmlFor="redeemReceiptRef">SalesPlay receipt no. (optional — helps at closing)</label>
          <div className="memberLookupRow">
            <input
              id="redeemReceiptRef"
              value={r.salesplayReceiptRef ?? receiptRef}
              onChange={(e) => setReceiptRef(e.target.value)}
              disabled={busy || Boolean(r.salesplayReceiptRef)}
              placeholder="e.g. 10023"
              autoComplete="off"
            />
            <button type="button" onClick={() => void saveReceipt()} disabled={busy || !receiptRef.trim() || Boolean(r.salesplayReceiptRef)}>
              {r.salesplayReceiptRef ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
        {error ? <p className="memberError" role="alert">{error}</p> : null}
        <div className="redeemActions">
          <button type="button" className="redeemUndo" onClick={() => void undo()} disabled={busy || !r.undoable}>
            Undo — sale cancelled
          </button>
          <button type="button" className="memberPrimary" onClick={() => setResult(null)} disabled={busy}>
            Done
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="redeemPanel">
      <h3>Redeem points</h3>
      {note ? <p className="memberCreated" role="status">{note}</p> : null}
      {!activated ? (
        <p className="memberAdvice memberAdvice--action">
          This member has not signed in to the app yet, so their points cannot be spent. Ask them to open Moja on their own
          phone and sign in once — their points are safe.
        </p>
      ) : null}
      {!staffCode.trim() ? (
        <p className="memberHint">Enter your staff code (top right) to redeem.</p>
      ) : null}
      {loadError ? <p className="memberError" role="alert">{loadError}</p> : null}
      {rewards && rewards.length === 0 ? <p className="memberHint">No rewards are set up for the counter yet.</p> : null}
      {rewards === null && !loadError ? <p className="memberHint">Loading rewards…</p> : null}

      {confirming ? (
        <div className="redeemConfirm" role="alertdialog" aria-label="Confirm redemption">
          <p>
            Redeem <strong>{confirming.reward.title}</strong> ({confirming.reward.discountLabel}) for{' '}
            <strong>{confirming.reward.pointsCost} points</strong> from {memberName || 'this member'}?
          </p>
          <p className="memberHint">
            Identified by {verification === 'QR' ? 'QR scan' : 'typed phone number'}. Points come off straight away.
          </p>
          {error ? <p className="memberError" role="alert">{error}</p> : null}
          <div className="redeemActions">
            <button type="button" className="redeemUndo" onClick={() => { setConfirming(null); setError(null); }} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="memberPrimary" onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Redeeming…' : 'Confirm redeem'}
            </button>
          </div>
        </div>
      ) : (
        <ul className="redeemList">
          {(rewards ?? []).map((rw) => {
            const short = rw.pointsCost - pointsBalance;
            const blocked = !activated || !staffCode.trim() || short > 0;
            return (
              <li key={rw.id} className="redeemRow">
                <div>
                  <strong>{rw.title}</strong>
                  <span className="memberHint" style={{ display: 'block', margin: 0 }}>
                    {rw.discountLabel} · {rw.pointsCost} points
                    {rw.minSpendCents ? ` · min spend ${formatRm(rw.minSpendCents)}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    setError(null);
                    setNote(null);
                    setConfirming({ reward: rw, key: crypto.randomUUID() });
                  }}
                >
                  {short > 0 ? `Need ${short} more` : 'Redeem'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!confirming && error ? <p className="memberError" role="alert">{error}</p> : null}
    </section>
  );
}
