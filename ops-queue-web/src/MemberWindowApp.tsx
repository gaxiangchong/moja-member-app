import { useCallback, useEffect, useRef, useState } from 'react';
import {
  lookupMember,
  registerMember,
  type MemberNextStep,
  type OpsMemberProfile,
} from './api';
import { OpsLoginScreen } from './OpsLoginScreen';
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
      }
  >({ kind: 'none' });
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
    setDisplayName('');
    setEmail('');
    setConsent(false);
    setResult({ kind: 'none' });
    setErr(null);
    phoneRef.current?.focus();
  }, []);

  const doLookup = useCallback(async () => {
    if (!apiKey || !phone.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await lookupMember(apiKey, phone, staffCode, base);
      if (res.found) {
        setResult({
          kind: 'found',
          phoneE164: res.phoneE164,
          nextStep: res.nextStep,
          member: res.member,
        });
      } else {
        setResult({ kind: 'not_found', phoneE164: res.phoneE164 });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  }, [apiKey, phone, staffCode, base]);

  const doRegister = useCallback(async () => {
    if (!apiKey || !phone.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await registerMember(
        apiKey,
        {
          phone,
          displayName: displayName.trim() || undefined,
          email: email.trim() || undefined,
          marketingConsent: consent,
          staffCode: staffCode || undefined,
        },
        base,
      );
      setResult({
        kind: 'found',
        phoneE164: res.phoneE164,
        nextStep: res.nextStep,
        member: res.member,
        justCreated: !res.alreadyExisted,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }, [apiKey, phone, displayName, email, consent, staffCode, base]);

  if (authState.status !== 'authenticated') {
    return (
      <OpsLoginScreen
        title="Member desk"
        lead="Sign in with OPS_QUEUE_API_KEY to look up or register members."
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
            placeholder="E001"
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

      {result.kind === 'not_found' && (
        <section className="memberCard">
          <h2>New member</h2>
          <p className="memberNormalized">
            Saving as <strong>{result.phoneE164}</strong>
          </p>
          <label htmlFor="memberName">Name</label>
          <input
            id="memberName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Name on receipt"
            autoComplete="off"
          />
          <label htmlFor="memberEmail">Email (optional)</label>
          <input
            id="memberEmail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="for PIN recovery later"
            inputMode="email"
            autoComplete="off"
          />
          <label className="memberConsent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>Customer agreed to receive promotions</span>
          </label>
          <button
            type="button"
            className="memberPrimary"
            onClick={() => void doRegister()}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Register member'}
          </button>
        </section>
      )}

      {result.kind === 'found' && (
        <MemberResultCard
          phoneE164={result.phoneE164}
          member={result.member}
          nextStep={result.nextStep}
          justCreated={result.justCreated}
          onDone={reset}
        />
      )}
    </div>
  );
}

function MemberResultCard({
  phoneE164,
  member,
  nextStep,
  justCreated,
  onDone,
}: {
  phoneE164: string;
  member: OpsMemberProfile;
  nextStep: MemberNextStep;
  justCreated?: boolean;
  onDone: () => void;
}) {
  const advice = nextStepAdvice(nextStep, member.activated);
  return (
    <section className="memberCard">
      {justCreated && (
        <p className="memberCreated" role="status">
          ✓ Member registered
        </p>
      )}
      <h2>{member.displayName || 'Member'}</h2>
      <p className="memberNormalized">{phoneE164}</p>

      <div className="memberStats">
        <div>
          <span className="memberStatValue">{member.pointsBalance ?? 0}</span>
          <span className="memberStatLabel">points</span>
        </div>
        <div>
          <span className="memberStatValue">
            {formatRm(member.walletBalanceCents)}
          </span>
          <span className="memberStatLabel">wallet</span>
        </div>
        <div>
          <span className="memberStatValue">{member.activeVouchers ?? 0}</span>
          <span className="memberStatLabel">vouchers</span>
        </div>
        <div>
          <span className="memberStatValue">{member.orderCount ?? 0}</span>
          <span className="memberStatLabel">orders</span>
        </div>
      </div>

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
