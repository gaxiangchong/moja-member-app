import { useCallback, useEffect, useRef, useState } from 'react';
import {
  lookupMember,
  pushMemberToSalesplay,
  registerMember,
  type MemberNextStep,
  type OpsMemberProfile,
  type SalesplayPushStatus,
} from './api';
import { CounterRedeemPanel } from './CounterRedeemPanel';
import { MemberVouchersPanel } from './MemberVouchersPanel';
import { MemberQrScanModal } from './MemberQrScanModal';
import { OpsLoginScreen } from './OpsLoginScreen';
import { TodayRedemptions } from './TodayRedemptions';
import { defaultBase } from './opsSession';
import { useOpsAuth } from './useOpsAuth';

const STAFF_CODE_KEY = 'moja.ops.staffCode';

function formatRm(cents: number | undefined): string {
  if (cents == null) return 'RM 0.00';
  return `RM ${(cents / 100).toFixed(2)}`;
}

const TIER_LABEL: Record<string, string> = {
  silver: 'Silver · earns 1× points',
  gold: 'Gold · earns 1.5× points',
  platinum: 'Platinum · earns 2× points',
};

function memberTierLabel(tier: string): string {
  return TIER_LABEL[tier.toLowerCase()] ?? tier;
}

/** What the cashier should tell the customer, per account state. */
function nextStepAdvice(
  step: MemberNextStep,
  activated: boolean,
): {
  tone: 'ok' | 'action';
  title: string;
  body: string;
} {
  switch (step) {
    case 'activate_in_app':
      return {
        tone: 'action',
        title: 'Not activated yet',
        body: activated
          ? 'Ask them to sign in with their PIN.'
          : 'They earn points from today. To use the app, ask them to open Moja on their own phone, enter this number and set their own PIN — never set it for them.',
      };
    case 'needs_email':
      return {
        tone: 'action',
        title: 'Cannot reset PIN',
        body: 'No email on file, so Forgot PIN will not work. Add their email below, then they can recover it themselves.',
      };
    case 'recover_via_otp':
      return {
        tone: 'action',
        title: 'Use Forgot PIN',
        body: 'Ask them to tap “Forgot PIN” in the app — a code goes to their email.',
      };
    default:
      return {
        tone: 'ok',
        title: 'Ready to sign in',
        body: 'They can sign in on the app with their PIN.',
      };
  }
}

/**
 * Counter member desk (`#/member`): look a member up by phone, or register a
 * walk-in who cannot sign up on the app themselves.
 *
 * Deliberately never collects a PIN — staff must not know a member's PIN, or
 * they could sign in and spend that member's credit. New accounts are created
 * unactivated and the member sets their own PIN later on their own phone.
 */
export function MemberWindowApp() {
  const { state: authState, signIn } = useOpsAuth();
  const [phone, setPhone] = useState('');
  const [staffCode, setStaffCode] = useState(
    () => localStorage.getItem(STAFF_CODE_KEY) ?? '',
  );
  const [result, setResult] = useState<
    | { kind: 'none' }
    | { kind: 'not_found'; phoneE164: string }
    | {
        kind: 'found';
        phoneE164: string;
        nextStep: MemberNextStep;
        member: OpsMemberProfile;
        justCreated?: boolean;
        alreadyExisted?: boolean;
        salesplay?: SalesplayPushStatus;
      }
  >({ kind: 'none' });
  /** The "Register new member" form, opened by the cashier or by a lookup miss. */
  const [newMemberOpen, setNewMemberOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  // Pre-ticked at the shop's request; staff untick it if the customer says no.
  const [consent, setConsent] = useState(true);
  // Typed by the customer on this device, never by staff. Cleared once saved.
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** How the member was identified: scanned from their QR, or typed in. */
  const [verification, setVerification] = useState<'QR' | 'PHONE'>('PHONE');
  const [scanOpen, setScanOpen] = useState(false);
  const [redeemTick, setRedeemTick] = useState(0);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STAFF_CODE_KEY, staffCode);
  }, [staffCode]);

  const apiKey = authState.status === 'authenticated' ? authState.apiKey : '';
  const base =
    authState.status === 'authenticated'
      ? authState.apiBase.trim() || defaultBase
      : defaultBase;

  const reset = useCallback(() => {
    setPhone('');
    setNewPhone('');
    setNewMemberOpen(false);
    setDisplayName('');
    setEmail('');
    setConsent(true);
    setNewPin('');
    setNewPinConfirm('');
    setResult({ kind: 'none' });
    setErr(null);
    setVerification('PHONE');
    phoneRef.current?.focus();
  }, []);

  const doLookup = useCallback(async (phoneOverride?: string) => {
    const value = phoneOverride ?? phone;
    if (!apiKey || !value.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await lookupMember(apiKey, value, staffCode, base);
      if (res.found) {
        setNewMemberOpen(false);
        setResult({
          kind: 'found',
          phoneE164: res.phoneE164,
          nextStep: res.nextStep,
          member: res.member,
        });
      } else {
        setResult({ kind: 'not_found', phoneE164: res.phoneE164 });
        setNewPhone(value);
        setNewMemberOpen(true);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  }, [apiKey, phone, staffCode, base]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // The PIN is optional; when typed it must be 6 digits and match its confirmation.
  const pinProblem =
    !newPin && !newPinConfirm
      ? null
      : newPin.length !== 6
        ? 'PIN must be 6 digits.'
        : newPinConfirm.length === 6 && newPinConfirm !== newPin
          ? 'The two PIN entries do not match.'
          : newPinConfirm.length !== 6
            ? 'Type the PIN again to confirm.'
            : null;
  const registerReady = Boolean(newPhone.trim() && displayName.trim() && emailOk && !pinProblem);

  const doRegister = useCallback(async () => {
    if (!apiKey || !registerReady) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await registerMember(
        apiKey,
        {
          phone: newPhone,
          displayName: displayName.trim(),
          email: email.trim(),
          marketingConsent: consent,
          ...(newPin ? { pin: newPin, pinConfirm: newPinConfirm } : {}),
          staffCode: staffCode || undefined,
        },
        base,
      );
      setNewPin('');
      setNewPinConfirm('');
      setNewMemberOpen(false);
      setPhone(newPhone);
      setResult({
        kind: 'found',
        phoneE164: res.phoneE164,
        nextStep: res.nextStep,
        member: res.member,
        justCreated: !res.alreadyExisted,
        alreadyExisted: res.alreadyExisted,
        salesplay: res.salesplay,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }, [apiKey, registerReady, newPhone, displayName, email, consent, newPin, newPinConfirm, staffCode, base]);

  if (authState.status !== 'authenticated') {
    return (
      <OpsLoginScreen
        title="Member desk"
        lead="Sign in with your admin email and password — the same account as the admin dashboard."
        checking={authState.status === 'checking'}
        onSubmit={signIn}
      />
    );
  }

  return (
    <div className="memberDesk">
      <header className="memberDeskHeader">
        <h1>Member desk</h1>
        <label className="memberStaffCode">
          Staff code
          <input
            value={staffCode}
            onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
            placeholder="Enter code"
            aria-invalid={!staffCode.trim()}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </header>

      <form
        className="memberLookupForm"
        onSubmit={(e) => {
          e.preventDefault();
          void doLookup();
        }}
      >
        <label htmlFor="memberPhone">Phone number</label>
        <div className="memberLookupRow">
          <input
            id="memberPhone"
            ref={phoneRef}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setVerification('PHONE');
              setResult({ kind: 'none' });
            }}
            placeholder="012-345 6789"
            inputMode="tel"
            autoComplete="off"
            autoFocus
          />
          <button type="submit" disabled={busy || !phone.trim()}>
            {busy ? '…' : 'Check'}
          </button>
        </div>
        <button type="button" className="memberScanBtn" onClick={() => setScanOpen(true)}>
          Scan member QR
        </button>
        {!newMemberOpen ? (
          <button
            type="button"
            className="memberScanBtn"
            onClick={() => {
              setNewPhone(phone);
              setResult({ kind: 'none' });
              setErr(null);
              setNewMemberOpen(true);
            }}
          >
            + Register new member
          </button>
        ) : null}
        <p className="memberHint">
          Read the number back to the customer before saving — points follow the
          phone number, and a typo cannot be undone by the customer.
        </p>
      </form>

      {err && (
        <p className="memberError" role="alert">
          {err}
        </p>
      )}

      {newMemberOpen && result.kind !== 'found' && (
        <section className="memberCard">
          <h2>Register new member</h2>
          {result.kind === 'not_found' ? (
            <p className="memberNormalized">
              No member yet with <strong>{result.phoneE164}</strong>
            </p>
          ) : null}
          <p className="memberHint">
            Once saved, the member is added to SalesPlay so you can attach them to
            the sale and they start collecting points.
          </p>
          <label htmlFor="newMemberPhone">Phone number</label>
          <input
            id="newMemberPhone"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="012-345 6789"
            inputMode="tel"
            autoComplete="off"
          />
          <label htmlFor="memberName">Name</label>
          <input
            id="memberName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Name"
            autoComplete="off"
          />
          <label htmlFor="memberEmail">Email</label>
          <input
            id="memberEmail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="for PIN recovery and vouchers"
            inputMode="email"
            autoComplete="off"
          />
          <div className="memberPinBox">
            <p className="memberHint" style={{ margin: 0 }}>
              Used to sign in to the app. Leave blank to set it in the app later.
            </p>
            <label htmlFor="memberPin">PIN</label>
            <input
              id="memberPin"
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/D/g, '').slice(0, 6))}
              placeholder="6 digits"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
            />
            <label htmlFor="memberPinConfirm">Confirm PIN</label>
            <input
              id="memberPinConfirm"
              type="password"
              value={newPinConfirm}
              onChange={(e) => setNewPinConfirm(e.target.value.replace(/D/g, '').slice(0, 6))}
              placeholder="type it again"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
            />
            {pinProblem ? <p className="memberError" style={{ margin: 0 }}>{pinProblem}</p> : null}
          </div>
          <label className="memberConsent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>Agree to receive promotions</span>
          </label>
          <button
            type="button"
            className="memberPrimary"
            onClick={() => void doRegister()}
            disabled={busy || !registerReady}
          >
            {busy ? 'Saving…' : 'Register member'}
          </button>
          <button type="button" className="memberScanBtn" onClick={reset}>
            Cancel
          </button>
        </section>
      )}

      {result.kind === 'found' && (
        <MemberResultCard
          // A new member gets a fresh card, so its points state starts from their balance.
          key={result.phoneE164}
          phoneE164={result.phoneE164}
          member={result.member}
          nextStep={result.nextStep}
          justCreated={result.justCreated}
          alreadyExisted={result.alreadyExisted}
          salesplay={result.salesplay}
          onDone={reset}
          apiKey={apiKey}
          base={base}
          staffCode={staffCode}
          verification={verification}
          onRedeemChanged={() => setRedeemTick((n) => n + 1)}
        />
      )}

      <TodayRedemptions apiKey={apiKey} base={base} staffCode={staffCode} refreshKey={redeemTick} />

      <MemberQrScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(digits) => {
          setPhone(digits);
          setVerification('QR');
          void doLookup(digits);
        }}
      />
    </div>
  );
}

function MemberResultCard({
  phoneE164,
  member,
  nextStep,
  justCreated,
  alreadyExisted,
  salesplay,
  onDone,
  apiKey,
  base,
  staffCode,
  verification,
  onRedeemChanged,
}: {
  phoneE164: string;
  member: OpsMemberProfile;
  nextStep: MemberNextStep;
  justCreated?: boolean;
  alreadyExisted?: boolean;
  /** Set right after registering; absent for a plain lookup. */
  salesplay?: SalesplayPushStatus;
  onDone: () => void;
  apiKey: string;
  base: string;
  staffCode: string;
  verification: 'QR' | 'PHONE';
  onRedeemChanged: () => void;
}) {
  const advice = nextStepAdvice(nextStep, member.activated);
  // Redeeming changes the balance, so the card keeps its own copy.
  const [points, setPoints] = useState(member.pointsBalance ?? 0);
  // Filled in by the Vouchers panel: the same list the member sees in the app.
  const [voucherCount, setVoucherCount] = useState<number | null>(null);
  const [salesplayStatus, setSalesplayStatus] = useState(salesplay);
  const [salesplayBusy, setSalesplayBusy] = useState(false);
  const retrySalesplay = async () => {
    setSalesplayBusy(true);
    try {
      setSalesplayStatus(await pushMemberToSalesplay(apiKey, phoneE164, staffCode, base));
    } catch {
      setSalesplayStatus('failed');
    } finally {
      setSalesplayBusy(false);
    }
  };
  return (
    <section className="memberCard">
      {justCreated && (
        <p className="memberCreated" role="status">
          ✓ Member registered
        </p>
      )}
      {alreadyExisted && (
        <p className="memberCreated" role="status">
          Already a member — nothing new was created.
        </p>
      )}
      {salesplayStatus === 'synced' ? (
        <div className="memberAdvice memberAdvice--ok">
          <strong>In SalesPlay</strong>
          <p>
            Search <strong>{phoneE164.replace(/\D/g, '')}</strong> or their name in
            SalesPlay&apos;s customers and add them to the sale to collect points.
          </p>
        </div>
      ) : salesplayStatus === 'failed' ? (
        <div className="memberAdvice memberAdvice--action">
          <strong>Not added to SalesPlay</strong>
          <p>SalesPlay didn&apos;t accept the member. Try again in a moment.</p>
          <button
            type="button"
            className="memberScanBtn"
            disabled={salesplayBusy}
            onClick={() => void retrySalesplay()}
          >
            {salesplayBusy ? 'Sending…' : 'Retry SalesPlay'}
          </button>
        </div>
      ) : salesplayStatus === 'not_configured' ? (
        <div className="memberAdvice memberAdvice--action">
          <strong>SalesPlay not connected</strong>
          <p>Add this customer in SalesPlay by hand, using their phone number.</p>
        </div>
      ) : null}
      <h2>{member.displayName || 'Member'}</h2>
      <p className="memberNormalized">{phoneE164}</p>

      <div className="memberStats">
        <div>
          <span className="memberStatValue">{points}</span>
          <span className="memberStatLabel">points</span>
        </div>
        <div>
          <span className="memberStatValue">
            {formatRm(member.walletBalanceCents)}
          </span>
          <span className="memberStatLabel">wallet</span>
        </div>
        <div>
          <span className="memberStatValue">{voucherCount ?? member.activeVouchers ?? 0}</span>
          <span className="memberStatLabel">vouchers</span>
        </div>
        <div>
          <span className="memberStatValue">{member.orderCount ?? 0}</span>
          <span className="memberStatLabel">orders</span>
        </div>
      </div>

      <CounterRedeemPanel
        apiKey={apiKey}
        base={base}
        staffCode={staffCode}
        phone={phoneE164}
        memberName={member.displayName}
        pointsBalance={points}
        activated={member.activated}
        verification={verification}
        onPointsChanged={(balance) => {
          setPoints(balance);
          onRedeemChanged();
        }}
      />

      <MemberVouchersPanel
        apiKey={apiKey}
        base={base}
        staffCode={staffCode}
        phone={phoneE164}
        memberName={member.displayName}
        activated={member.activated}
        verification={verification}
        onCount={setVoucherCount}
      />

      <div className={`memberAdvice memberAdvice--${advice.tone}`}>
        <strong>{advice.title}</strong>
        <p>{advice.body}</p>
      </div>

      <dl className="memberDetails">
        <div>
          <dt>Pickup code</dt>
          <dd>{member.kitchenPickupCode ?? '—'}</dd>
        </div>
        <div>
          <dt>Tier</dt>
          <dd>{memberTierLabel(member.memberTier)}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{member.email ?? '—'}</dd>
        </div>
        <div>
          <dt>Member since</dt>
          <dd>{new Date(member.createdAt).toLocaleDateString()}</dd>
        </div>
      </dl>

      <button type="button" className="memberPrimary" onClick={onDone}>
        Done — next customer
      </button>
    </section>
  );
}
