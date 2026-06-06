import { useCallback, useState } from 'react';
import {
  clearToken,
  loginWithPin,
  lookupLogin,
  requestOtp,
  setInitialPin,
  setToken,
  verifyOtp,
} from '../api';
import { OtpBoxes } from '../components/OtpBoxes';
import OrgOnboarding from './OrgOnboarding';

type Step = 'phone' | 'pin' | 'code' | 'setPin';

type Props = {
  onAuthenticated: () => void;
};

export function AuthScreens({ onAuthenticated }: Props) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [setPinPhase, setSetPinPhase] = useState<'first' | 'confirm'>('first');
  const [setupToken, setSetupToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<'individual' | 'organization'>('individual');
  const [showOrgPreview, setShowOrgPreview] = useState(false);

  const finishAuth = useCallback(
    (token: string) => {
      setToken(token);
      onAuthenticated();
    },
    [onAuthenticated],
  );

  const handlePhoneContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);
    setLoading(true);
    try {
      const { registered, hasPin } = await lookupLogin(phone);
      if (registered && hasPin) {
        setStep('pin');
        setLoginPin('');
        return;
      }
      const purpose = registered && !hasPin ? 'recovery' : 'register';
      const res = await requestOtp(phone, purpose);
      if (res.channel === 'whatsapp') {
        setHint('Check WhatsApp for your verification code.');
      } else if (res._devCode) {
        setHint(`Test mode: your OTP is ${res._devCode}`);
      }
      setStep('code');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const submitPinLogin = async (pin: string) => {
    setLoading(true);
    setError(null);
    try {
      const { accessToken } = await loginWithPin(phone, pin);
      finishAuth(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoginPin('');
    } finally {
      setLoading(false);
    }
  };

  const submitVerify = async (codeValue: string) => {
    setLoading(true);
    setError(null);
    try {
      const verified = await verifyOtp(phone, codeValue);
      setSetupToken(verified.setupToken);
      setCode('');
      setNewPin('');
      setNewPinConfirm('');
      setSetPinPhase('first');
      setStep('setPin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const submitSetPin = async (a: string, b: string) => {
    if (a !== b) {
      setError('PIN entries do not match.');
      setNewPinConfirm('');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { accessToken } = await setInitialPin(setupToken, a, b);
      finishAuth(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="authMain">
      <div className="authOverlay" />
      <div className="authCard">
        <div className="authBrand">
          <img src="/logo.png" alt="" className="authBrandLogo" />
          <div>
            <span className="authBrandName">Moja Daily</span>
            <span className="authBrandTagline">Fresh meal everyday</span>
          </div>
        </div>

        {step === 'phone' && (
          <>
            <h1>Welcome to Moja Daily</h1>
            <p className="authSub">
              Sign in with your Moja account to enjoy fresh, chef-prepared meals on your schedule.
            </p>
            <div className="accountTypeRow">
              <label className="accountTypeLabel">Continue as</label>
              <div className="accountTypeOptions">
                <label>
                  <input
                    type="radio"
                    name="accountType"
                    value="individual"
                    checked={accountType === 'individual'}
                    onChange={() => setAccountType('individual')}
                  />
                  Individual
                </label>
                <label>
                  <input
                    type="radio"
                    name="accountType"
                    value="organization"
                    checked={accountType === 'organization'}
                    onChange={() => setAccountType('organization')}
                  />
                  Organization
                </label>
              </div>
              {accountType === 'organization' && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btnSecondary" onClick={() => setShowOrgPreview(true)}>
                    Preview organization onboarding
                  </button>
                </div>
              )}
            </div>
            <form onSubmit={handlePhoneContinue}>
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                type="tel"
                placeholder="+60 12 345 6789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={loading}
              />
              {error && <p className="err">{error}</p>}
              <button type="submit" className="btnPrimary" disabled={loading}>
                {loading ? 'Checking…' : 'Continue'}
              </button>
            </form>
          </>
        )}

        {step === 'pin' && (
          <>
            <button type="button" className="linkBtn" onClick={() => setStep('phone')}>
              ← Back
            </button>
            <h1>Enter your PIN</h1>
            <p className="authSub">6-digit PIN for {phone}</p>
            <OtpBoxes
              value={loginPin}
              onChange={(next) => {
                setLoginPin(next);
                if (next.length === 6) void submitPinLogin(next);
              }}
              masked
              autoFocus
              disabled={loading}
              ariaLabel="6-digit PIN"
            />
            {error && <p className="err">{error}</p>}
            <button
              type="button"
              className="btnSecondary"
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await requestOtp(phone, 'recovery');
                  if (res._devCode) setHint(`Test mode: OTP ${res._devCode}`);
                  setStep('code');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Forgot PIN? Use WhatsApp OTP
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            <button type="button" className="linkBtn" onClick={() => setStep('phone')}>
              ← Back
            </button>
            <h1>Verification code</h1>
            <p className="authSub">We sent a 6-digit code to {phone}</p>
            {hint && <p className="hint">{hint}</p>}
            <OtpBoxes
              value={code}
              onChange={(next) => {
                setCode(next);
                if (next.length === 6) void submitVerify(next);
              }}
              autoFocus
              disabled={loading}
            />
            {error && <p className="err">{error}</p>}
          </>
        )}

        {step === 'setPin' && (
          <>
            <h1>{setPinPhase === 'first' ? 'Create your PIN' : 'Confirm your PIN'}</h1>
            <OtpBoxes
              key={setPinPhase}
              value={setPinPhase === 'first' ? newPin : newPinConfirm}
              onChange={(next) => {
                if (setPinPhase === 'first') {
                  setNewPin(next);
                  if (next.length === 6) setSetPinPhase('confirm');
                } else {
                  setNewPinConfirm(next);
                  if (next.length === 6) void submitSetPin(newPin, next);
                }
              }}
              masked
              autoFocus
              disabled={loading}
            />
            {error && <p className="err">{error}</p>}
          </>
        )}
      </div>
      {showOrgPreview && <OrgOnboarding onClose={() => setShowOrgPreview(false)} />}
    </main>
  );
}

export function logout() {
  clearToken();
}
