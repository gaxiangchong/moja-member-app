import { useEffect, useMemo, useState } from 'react';
import {
  completeDemoWalletTopUp,
  createWalletTopUpSession,
  fetchTopUpOptions,
  fetchXenditShopChannels,
  type TopUpOptions,
} from '../api';
import { HIDDEN_PAYMENT_CHANNELS } from '../payments/channels';
import { savePendingPayment } from '../payments/pendingPayment';
import { formatRm } from '../shop/data/mockCatalog';
import { bonusForTopUp, parseRmToCents } from './topUpBonus';

/** How a top-up ended — handed in when the member comes back from the payment page. */
export type TopUpResult =
  | { status: 'success'; amountCents: number; bonusCents: number }
  | { status: 'failed' };

type Step = 'pick' | 'demo' | 'done';

export function TopUpScreen({
  balanceCents,
  result,
  onClose,
  onToppedUp,
}: {
  balanceCents: number;
  /** Set when returning from the payment page: skips straight to the outcome. */
  result: TopUpResult | null;
  onClose: () => void;
  /** Called once credit has been added, so the balance can be refreshed. */
  onToppedUp: () => void;
}) {
  const [options, setOptions] = useState<TopUpOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [channels, setChannels] = useState<Array<{ code: string; label: string }>>([]);
  const [channelCode, setChannelCode] = useState('');
  const [step, setStep] = useState<Step>(result ? 'done' : 'pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<{
    referenceId: string;
    amountCents: number;
    bonusCents: number;
  } | null>(null);
  const [outcome, setOutcome] = useState<TopUpResult | null>(result);

  useEffect(() => {
    let alive = true;
    fetchTopUpOptions()
      .then((o) => {
        if (alive) setOptions(o);
      })
      .catch((err) => {
        if (alive) {
          setLoadError(err instanceof Error ? err.message : 'Could not load top-up options');
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  // Real payments need a payment method; demo mode has none to choose.
  const needsChannel = options?.enabled === true && !options.demoMode;
  useEffect(() => {
    if (!needsChannel) return;
    let alive = true;
    fetchXenditShopChannels()
      .then((r) => {
        if (!alive) return;
        const visible = r.channels.filter(
          (c) => !HIDDEN_PAYMENT_CHANNELS.has(c.code.toUpperCase()),
        );
        setChannels(visible);
        setChannelCode((prev) => prev || visible[0]?.code || '');
      })
      .catch(() => {
        // Fall back to the server's default method rather than blocking the top-up.
        if (alive) setChannels([]);
      });
    return () => {
      alive = false;
    };
  }, [needsChannel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const amountCents = parseRmToCents(amountInput);
  const inRange =
    amountCents != null &&
    options != null &&
    amountCents >= options.minTopUpCents &&
    amountCents <= options.maxTopUpCents;
  const bonusCents = useMemo(
    () => (inRange && options ? bonusForTopUp(amountCents, options.tiers) : 0),
    [inRange, amountCents, options],
  );

  const rangeHint = options
    ? `${formatRm(options.minTopUpCents)} – ${formatRm(options.maxTopUpCents)}`
    : '';

  const pay = async () => {
    if (!inRange || amountCents == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await createWalletTopUpSession(amountCents, channelCode || undefined);
      if (session.demoMode) {
        setDemo({
          referenceId: session.referenceId,
          amountCents: session.amountCents,
          bonusCents: session.bonusCents,
        });
        setStep('demo');
        return;
      }
      if (session.redirectUrl) {
        // The payment page may not bring the member back, so remember it and
        // let the app confirm the payment when it regains focus.
        savePendingPayment({ referenceId: session.referenceId, purpose: 'wallet_topup' });
        window.location.href = session.redirectUrl;
        return;
      }
      setError('We could not open the payment page. Please try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the top-up');
    } finally {
      setBusy(false);
    }
  };

  const completeDemo = async () => {
    if (!demo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const done = await completeDemoWalletTopUp(demo.referenceId);
      setOutcome({
        status: 'success',
        amountCents: done.amountCents,
        bonusCents: done.bonusCents,
      });
      setStep('done');
      onToppedUp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the test top-up');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="topUpOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topUpTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="topUpSheet">
        <button type="button" className="topUpClose" aria-label="Close" onClick={onClose}>
          ×
        </button>

        {step === 'done' ? (
          <TopUpOutcome outcome={outcome} onClose={onClose} />
        ) : (
          <>
            <h2 id="topUpTitle" className="topUpTitle">
              Top up credits
            </h2>
            <p className="topUpBalance">
              Your balance <strong>{formatRm(balanceCents)}</strong>
            </p>

            {loadError ? <p className="err">{loadError}</p> : null}
            {!options && !loadError ? <p className="caption">Loading…</p> : null}

            {options && !options.enabled ? (
              <p className="topUpUnavailable">
                Top-ups aren’t open yet. Please check back soon.
              </p>
            ) : null}

            {options?.enabled && step === 'pick' ? (
              <>
                {options.tiers.length > 0 ? (
                  <>
                    <p className="topUpSection">Top up more, get more</p>
                    <div className="topUpTiers">
                      {options.tiers.map((tier) => {
                        const active = amountCents === tier.topUpCents;
                        return (
                          <button
                            key={tier.topUpCents}
                            type="button"
                            className={`topUpTier${active ? ' topUpTier--active' : ''}`}
                            aria-pressed={active}
                            onClick={() => setAmountInput(String(tier.topUpCents / 100))}
                          >
                            <span className="topUpTierPay">{formatRm(tier.topUpCents)}</span>
                            <span className="topUpTierBonus">+{formatRm(tier.bonusCents)} free</span>
                            <span className="topUpTierGet">
                              Get {formatRm(tier.topUpCents + tier.bonusCents)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}

                <label className="topUpAmount">
                  <span className="topUpSection">
                    {options.tiers.length > 0 ? 'Or enter an amount' : 'Amount'}
                  </span>
                  <span className="topUpAmountField">
                    <span aria-hidden>RM</span>
                    <input
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      aria-describedby="topUpRange"
                    />
                  </span>
                </label>
                <p
                  id="topUpRange"
                  className={`caption topUpRange${
                    amountInput && !inRange ? ' topUpRange--bad' : ''
                  }`}
                >
                  {amountInput && !inRange
                    ? `Enter an amount between ${rangeHint}.`
                    : `Between ${rangeHint}.`}
                </p>

                {inRange && amountCents != null ? (
                  <div className="topUpSummary" aria-live="polite">
                    <div className="topUpSummaryRow">
                      <span>You pay</span>
                      <strong>{formatRm(amountCents)}</strong>
                    </div>
                    {bonusCents > 0 ? (
                      <div className="topUpSummaryRow topUpSummaryRow--bonus">
                        <span>Bonus credit</span>
                        <strong>+{formatRm(bonusCents)}</strong>
                      </div>
                    ) : null}
                    <div className="topUpSummaryRow topUpSummaryRow--total">
                      <span>You get</span>
                      <strong>{formatRm(amountCents + bonusCents)}</strong>
                    </div>
                  </div>
                ) : null}

                {needsChannel && channels.length > 0 ? (
                  <>
                    <p className="topUpSection">Pay with</p>
                    <div className="topUpChannels">
                      {channels.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          className={`topUpChannel${
                            channelCode === c.code ? ' topUpChannel--active' : ''
                          }`}
                          aria-pressed={channelCode === c.code}
                          onClick={() => setChannelCode(c.code)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {error ? <p className="err">{error}</p> : null}
                <button
                  type="button"
                  className="topUpPay"
                  disabled={!inRange || busy}
                  onClick={() => void pay()}
                >
                  {busy
                    ? 'Starting payment…'
                    : inRange && amountCents != null
                      ? `Pay ${formatRm(amountCents)}`
                      : 'Choose an amount'}
                </button>
              </>
            ) : null}

            {step === 'demo' && demo ? (
              <div className="topUpDemo">
                <p className="topUpDemoNote">
                  Test mode: no real payment is taken. Complete the test top-up to see the credit arrive.
                </p>
                <div className="topUpSummary">
                  <div className="topUpSummaryRow">
                    <span>You pay</span>
                    <strong>{formatRm(demo.amountCents)}</strong>
                  </div>
                  {demo.bonusCents > 0 ? (
                    <div className="topUpSummaryRow topUpSummaryRow--bonus">
                      <span>Bonus credit</span>
                      <strong>+{formatRm(demo.bonusCents)}</strong>
                    </div>
                  ) : null}
                  <div className="topUpSummaryRow topUpSummaryRow--total">
                    <span>You get</span>
                    <strong>{formatRm(demo.amountCents + demo.bonusCents)}</strong>
                  </div>
                </div>
                {error ? <p className="err">{error}</p> : null}
                <button
                  type="button"
                  className="topUpPay"
                  disabled={busy}
                  onClick={() => void completeDemo()}
                >
                  {busy ? 'Completing…' : 'Complete test top-up'}
                </button>
                <button
                  type="button"
                  className="topUpGhost"
                  disabled={busy}
                  onClick={() => {
                    setDemo(null);
                    setStep('pick');
                  }}
                >
                  Change amount
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function TopUpOutcome({
  outcome,
  onClose,
}: {
  outcome: TopUpResult | null;
  onClose: () => void;
}) {
  if (outcome?.status === 'success') {
    const total = outcome.amountCents + outcome.bonusCents;
    return (
      <div className="topUpOutcome">
        <div className="topUpOutcomeIcon topUpOutcomeIcon--ok" aria-hidden>
          ✓
        </div>
        <h2 id="topUpTitle" className="topUpTitle">
          Top-up successful
        </h2>
        <p className="topUpOutcomeTotal">{formatRm(total)} added to your credits</p>
        {outcome.bonusCents > 0 ? (
          <p className="caption">
            {formatRm(outcome.amountCents)} top-up + {formatRm(outcome.bonusCents)} bonus
          </p>
        ) : null}
        <button type="button" className="topUpPay" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }
  return (
    <div className="topUpOutcome">
      <div className="topUpOutcomeIcon topUpOutcomeIcon--bad" aria-hidden>
        !
      </div>
      <h2 id="topUpTitle" className="topUpTitle">
        Top-up not completed
      </h2>
      <p className="caption">No credit was added and you haven’t been charged for it. You can try again.</p>
      <button type="button" className="topUpPay" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
