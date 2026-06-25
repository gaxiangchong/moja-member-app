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
import { useI18n } from '../lib/i18n/context';
import { savePendingBentoPayment } from '../payments/pendingPayment';

type Props = {
  draft: OrderDraft;
  onSuccess: () => void;
};

const MIN_QTY = 2;
const MAX_QTY = 10;

export function Checkout({ draft, onSuccess }: Props) {
  const { t } = useI18n();
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteBentoSubscription>> | null>(null);
  const [paymentsDemoMode, setPaymentsDemoMode] = useState(false);
  const [channels, setChannels] = useState<Array<{ code: string; label: string }>>([]);
  const [channelCode, setChannelCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupBuy, setGroupBuy] = useState(false);
  const [qty, setQty] = useState(MIN_QTY);
  const [showTakeawayDisclaimer, setShowTakeawayDisclaimer] = useState(false);
  const [takeawayAgreed, setTakeawayAgreed] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);

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
      voucherCode: appliedCode ?? undefined,
    })
      .then((q) => { if (!cancelled) { setQuote(q); setError(null); } })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('checkout.errorQuote'));
      });
    return () => { cancelled = true; };
  }, [draft, sets, appliedCode, t]);

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
      voucherCode: appliedVoucher ? appliedCode ?? undefined : undefined,
    };

    try {
      const result = await checkoutBentoSubscription(payload);

      if (paymentsDemoMode) {
        const ids = result.subscriptionIds ?? [result.subscriptionId];
        for (const id of ids) {
          await completeDemoBentoSubscription(id);
        }
        onSuccess();
        return;
      }

      if (result.redirectUrl) {
        if (result.referenceId) {
          savePendingBentoPayment({
            referenceId: result.referenceId,
            subscriptionId: result.subscriptionId,
          });
        }
        window.location.href = result.redirectUrl;
        return;
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('checkout.errorCheckout'));
    } finally {
      setLoading(false);
    }
  };

  const perSetTotal = quote?.totalCents ?? 0;
  const baseGrandTotal = perSetTotal * sets;
  const appliedVoucher = appliedCode ? quote?.voucher ?? null : null;
  const voucherError = appliedCode ? quote?.voucherError ?? null : null;
  const grandTotal = appliedVoucher ? appliedVoucher.newTotalCents : baseGrandTotal;

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setAppliedCode(code);
  };
  const removePromo = () => {
    setAppliedCode(null);
    setPromoInput('');
  };
  const PROMO_ERROR_KEYS: Record<string, string> = {
    NOT_FOUND: 'checkout.promoError.notFound',
    INACTIVE: 'checkout.promoError.inactive',
    NOT_STARTED: 'checkout.promoError.notStarted',
    EXPIRED: 'checkout.promoError.expired',
    CAPACITY_FULL: 'checkout.promoError.capacityFull',
    MIN_SPEND: 'checkout.promoError.minSpend',
  };
  const voucherErrorText = voucherError
    ? t(PROMO_ERROR_KEYS[voucherError] ?? 'checkout.promoError.generic')
    : null;

  const lunchPart =
    quote && quote.lunchCredits > 0
      ? `${quote.lunchCredits * sets} ${t('common.lunch').toLowerCase()}`
      : '';
  const dinnerPart =
    quote && quote.dinnerCredits > 0
      ? `${quote.dinnerCredits * sets} ${t('common.dinner').toLowerCase()}`
      : '';
  const setsPart = sets > 1 ? ` (${sets} ${t('common.sets')})` : '';

  const openTakeawayDisclaimer = () => {
    setTakeawayAgreed(false);
    setShowTakeawayDisclaimer(true);
  };

  const confirmTakeawayAndPay = () => {
    if (!takeawayAgreed) return;
    setShowTakeawayDisclaimer(false);
    void handlePay();
  };

  return (
    <section className="section checkout">
      <div className="checkoutTop">
        <div>
          <h2>{t('checkout.reviewTitle')}</h2>
          <p className="caption">{t('checkout.reviewCaption')}</p>
        </div>
        {quote && (
          <div className="checkoutTotalValue">{formatRm(grandTotal)}</div>
        )}
      </div>

      {!quote && draft.packageCode && <p className="caption">{t('checkout.calculating')}</p>}

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
                <span>{t('checkout.setsRow', { count: sets })}</span>
                <span>{formatRm(baseGrandTotal)}</span>
              </li>
            )}
            {appliedVoucher && (
              <li className="quoteVoucherRow">
                <span>{t('checkout.promoDiscount', { code: appliedVoucher.code })}</span>
                <span>−{formatRm(appliedVoucher.discountCents)}</span>
              </li>
            )}
          </ul>

          {quote.totalSavingsCents > 0 && (
            <p className="savings">
              {t('checkout.youSave', {
                amount: formatRm(quote.totalSavingsCents * sets),
                baseline: quote.savingsBaselineLabel || t('package.label.ONE_TIME'),
              })}
            </p>
          )}

          <div className="promoSection">
            <label className="fieldLabel" htmlFor="promoCode">{t('checkout.promoLabel')}</label>
            {appliedVoucher ? (
              <div className="promoApplied">
                <span className="promoAppliedTag">✓ {appliedVoucher.code}</span>
                <button type="button" className="promoRemoveBtn" onClick={removePromo}>
                  {t('checkout.promoRemove')}
                </button>
              </div>
            ) : (
              <div className="promoInputRow">
                <input
                  id="promoCode"
                  name="bentoPromoCode"
                  type="text"
                  className="dateInput promoInput"
                  placeholder={t('checkout.promoPlaceholder')}
                  value={promoInput}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }}
                />
                <button
                  type="button"
                  className="btnSecondary promoApplyBtn"
                  disabled={!promoInput.trim()}
                  onClick={applyPromo}
                >
                  {t('checkout.promoApply')}
                </button>
              </div>
            )}
            {voucherErrorText && <p className="err promoError">{voucherErrorText}</p>}
          </div>

          {(lunchPart || dinnerPart) && (
            <p className="caption" style={{ marginTop: 6 }}>
              {[lunchPart, dinnerPart].filter(Boolean).join(' · ')}{setsPart}
            </p>
          )}

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
                  <span className="groupBuyToggleText">{t('checkout.groupBuy')}</span>
                  <span className="groupBuyToggleDesc">{t('checkout.groupBuyDesc')}</span>
                </div>
              </label>

              {groupBuy && (
                <div className="groupBuyQtyRow">
                  <span className="groupBuyQtyLabel">{t('checkout.howManySets')}</span>
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
              <label className="fieldLabel" htmlFor="channel">{t('checkout.paymentMethod')}</label>
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
        <p className="demoBanner">{t('checkout.demoBanner')}</p>
      )}

      {error && <p className="err">{error}</p>}

      <button
        type="button"
        className={`btnPrimary${paymentsDemoMode ? ' btnDemo' : ''}`}
        disabled={!canCheckout || loading}
        onClick={openTakeawayDisclaimer}
        style={{ marginTop: 14 }}
      >
        {loading
          ? t('checkout.processing', {
              sets: sets > 1 ? t('checkout.processingSets', { count: sets }) : '',
            })
          : paymentsDemoMode
            ? t('checkout.continueDemo')
            : t('checkout.pay', { amount: formatRm(grandTotal) })}
      </button>

      {showTakeawayDisclaimer && (
        <div className="modalOverlay" role="presentation" onClick={() => setShowTakeawayDisclaimer(false)}>
          <div
            className="modalContent checkoutDisclaimerModal"
            role="alertdialog"
            aria-labelledby="takeawayDisclaimerTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="takeawayDisclaimerTitle">{t('checkout.takeawayTitle')}</h3>
            <p className="checkoutDisclaimerBody">{t('checkout.takeawayBody')}</p>
            <label className="checkoutDisclaimerAgree">
              <input
                type="checkbox"
                checked={takeawayAgreed}
                onChange={(e) => setTakeawayAgreed(e.target.checked)}
              />
              <span>{t('checkout.takeawayAgree')}</span>
            </label>
            <div className="checkoutDisclaimerActions">
              <button
                type="button"
                className="btnSecondary"
                onClick={() => setShowTakeawayDisclaimer(false)}
              >
                {t('checkout.takeawayCancel')}
              </button>
              <button
                type="button"
                className="btnPrimary"
                disabled={!takeawayAgreed || loading}
                onClick={confirmTakeawayAndPay}
              >
                {paymentsDemoMode
                  ? t('checkout.continueDemo')
                  : t('checkout.takeawayConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
