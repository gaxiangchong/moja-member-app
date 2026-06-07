import { useEffect, useState } from 'react';
import {
  checkoutBentoSubscription,
  completeDemoBentoSubscription,
  fetchPaymentsConfig,
  fetchShopChannels,
  quoteBentoSubscription,
} from '../api';
import type { OrderDraft } from './types';
import { formatRm } from './types';
import { PurchaseCapacityNotice } from './PurchaseCapacityNotice';

type Props = {
  draft: OrderDraft;
  onSuccess: () => void;
};

const MIN_QTY = 2;
const MAX_QTY = 10;

export function Checkout({ draft, onSuccess }: Props) {
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteBentoSubscription>> | null>(null);
  const [paymentsDemoMode, setPaymentsDemoMode] = useState(false);
  const [channels, setChannels] = useState<Array<{ code: string; label: string }>>([]);
  const [channelCode, setChannelCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupBuy, setGroupBuy] = useState(false);
  const [qty, setQty] = useState(MIN_QTY);

  const isTrialPack = draft.packageCode === 'NEWCOMER_3';
  const sets = isTrialPack ? 1 : groupBuy ? qty : 1;
  const canCheckout =
    Boolean(draft.packageCode) &&
    Boolean(quote) &&
    (quote?.purchaseAvailability?.canPurchase !== false);

  useEffect(() => {
    void fetchPaymentsConfig()
      .then((c) => setPaymentsDemoMode(c.paymentsDemoMode))
      .catch(() => setPaymentsDemoMode(false));
  }, []);

  useEffect(() => {
    if (paymentsDemoMode) return;
    void fetchShopChannels()
      .then((list) => {
        setChannels(list);
        if (list[0]) setChannelCode(list[0].code);
      })
      .catch(() => {});
  }, [paymentsDemoMode]);

  useEffect(() => {
    if (isTrialPack && groupBuy) {
      setGroupBuy(false);
      setQty(MIN_QTY);
    }
  }, [isTrialPack, groupBuy]);

  useEffect(() => {
    if (!draft.packageCode) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    void quoteBentoSubscription({
      packageCode: draft.packageCode,
      mealOption: draft.mealOption,
      lunchVariant: draft.lunchVariant,
      dinnerVariant: draft.dinnerVariant,
      riceType: draft.riceType,
      includeDrinkAddon: draft.includeDrinkAddon,
      sets,
    })
      .then((q) => { if (!cancelled) { setQuote(q); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Quote failed'); });
    return () => { cancelled = true; };
  }, [draft, sets]);

  const handlePay = async () => {
    if (!draft.packageCode || !quote) return;
    setLoading(true);
    setError(null);

    const payload = {
      packageCode: draft.packageCode,
      mealOption: draft.mealOption,
      lunchVariant: draft.lunchVariant,
      dinnerVariant: draft.dinnerVariant,
      riceType: draft.riceType,
      includeDrinkAddon: draft.includeDrinkAddon,
      channelCode: paymentsDemoMode ? undefined : channelCode || undefined,
      sets,
    };

    try {
      if (paymentsDemoMode) {
        for (let i = 0; i < sets; i++) {
          const result = await checkoutBentoSubscription(payload);
          await completeDemoBentoSubscription(result.subscriptionId);
        }
        onSuccess();
        return;
      }

      // Real payment: create all subscriptions, redirect to first payment URL
      let firstRedirectUrl: string | null = null;
      for (let i = 0; i < sets; i++) {
        const result = await checkoutBentoSubscription(payload);
        if (i === 0 && result.redirectUrl) firstRedirectUrl = result.redirectUrl;
      }
      if (firstRedirectUrl) {
        window.location.href = firstRedirectUrl;
        return;
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const perSetTotal = quote?.totalCents ?? 0;
  const grandTotal = perSetTotal * sets;

  return (
    <section className="section checkout">
      <div className="checkoutTop">
        <div>
          <h2>Review your order</h2>
          <p className="caption">Confirm details then pay to lock in your plan.</p>
        </div>
        {quote && (
          <div className="checkoutTotalValue">{formatRm(grandTotal)}</div>
        )}
      </div>

      {!quote && draft.packageCode && <p className="caption">Calculating total…</p>}

      {quote?.purchaseAvailability && !quote.purchaseAvailability.canPurchase && (
        <PurchaseCapacityNotice availability={quote.purchaseAvailability} />
      )}

      {quote && quote.purchaseAvailability?.canPurchase !== false && (
        <>
          <ul className="quoteLines">
            {quote.lines.map((line) => (
              <li key={line.label}>
                <span>{line.label}</span>
                <span>{formatRm(line.amountCents)}</span>
              </li>
            ))}
            {sets > 1 && (
              <li className="quoteSetsRow">
                <span>× {sets} sets</span>
                <span>{formatRm(grandTotal)}</span>
              </li>
            )}
          </ul>

          {quote.totalSavingsCents > 0 && (
            <p className="savings">
              You save {formatRm(quote.totalSavingsCents * sets)} vs the 7-meal plan.
            </p>
          )}

          <p className="caption" style={{ marginTop: 6 }}>
            {quote.lunchCredits > 0 && `${quote.lunchCredits * sets} lunch${quote.lunchCredits * sets > 1 ? 'es' : ''}`}
            {quote.lunchCredits > 0 && quote.dinnerCredits > 0 ? ' · ' : ''}
            {quote.dinnerCredits > 0 && `${quote.dinnerCredits * sets} dinner${quote.dinnerCredits * sets > 1 ? 's' : ''}`}
            {sets > 1 ? ` (${sets} sets)` : ''}
          </p>

          {!isTrialPack && (
            <div className="groupBuySection">
              <label className="groupBuyToggleLabel">
                <input
                  type="checkbox"
                  className="groupBuyToggleInput"
                  checked={groupBuy}
                  onChange={(e) => {
                    setGroupBuy(e.target.checked);
                    if (!e.target.checked) setQty(MIN_QTY);
                  }}
                />
                <span className="groupBuyToggleTrack">
                  <span className="groupBuyToggleThumb" />
                </span>
                <div>
                  <span className="groupBuyToggleText">Group buy</span>
                  <span className="groupBuyToggleDesc">Order multiple sets at once</span>
                </div>
              </label>

              {groupBuy && (
                <div className="groupBuyQtyRow">
                  <span className="groupBuyQtyLabel">How many sets?</span>
                  <div className="groupBuyQtyControl">
                    <button
                      type="button"
                      className="qtyBtn"
                      disabled={qty <= MIN_QTY}
                      onClick={() => setQty((q) => Math.max(MIN_QTY, q - 1))}
                    >−</button>
                    <span className="qtyValue">{qty}</span>
                    <button
                      type="button"
                      className="qtyBtn"
                      disabled={qty >= MAX_QTY}
                      onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
                    >+</button>
                  </div>
                  <div className="groupBuyCalc">
                    {formatRm(perSetTotal)} × {qty} = <strong>{formatRm(grandTotal)}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {!paymentsDemoMode && channels.length > 0 && (
            <div className="paymentOptionSection">
              <label className="fieldLabel" htmlFor="channel">Payment method</label>
              <select
                id="channel"
                value={channelCode}
                onChange={(e) => setChannelCode(e.target.value)}
                className="dateInput"
              >
                {channels.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {paymentsDemoMode && quote?.purchaseAvailability?.canPurchase !== false && (
        <p className="demoBanner">Demo mode — payment is bypassed for this preview.</p>
      )}

      {error && <p className="err">{error}</p>}

      <button
        type="button"
        className={`btnPrimary${paymentsDemoMode ? ' btnDemo' : ''}`}
        disabled={!canCheckout || loading}
        onClick={() => void handlePay()}
        style={{ marginTop: 14 }}
      >
        {loading
          ? `Processing${sets > 1 ? ` (${sets} sets)` : ''}…`
          : paymentsDemoMode
            ? 'Continue without payment'
            : `Pay ${formatRm(grandTotal)}`}
      </button>
    </section>
  );
}
