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

type Step = 'phone' | 'pin' | 'email' | 'code' | 'setPin';
type OtpFlowPurpose = 'register' | 'recovery';

type Props = {
  onAuthenticated: () => void;
};

function applyOtpHint(
  res: { channel?: string; _devCode?: string },
  setHint: (h: string | null) => void,
) {
  if (res.channel === 'email') {
    setHint('Check your email inbox for the verification code.');
  } else if (res.channel === 'mock' && res._devCode) {
    setHint(`Test mode: your OTP is ${res._devCode}`);
  } else if (res._devCode) {
    setHint(`Dev mode: your code is ${res._devCode}`);
  } else {
    setHint('If you did not receive a code, check your email or try again.');
  }
}

export function AuthScreens({ onAuthenticated }: Props) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [maskedEmailHint, setMaskedEmailHint] = useState<string | null>(null);
  const [otpFlowPurpose, setOtpFlowPurpose] = useState<OtpFlowPurpose>('register');
  const [loginPin, setLoginPin] = useState('');
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [setPinPhase, setSetPinPhase] = useState<'first' | 'confirm'>('first');
  const [setupToken, setSetupToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

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
      const { registered, hasPin, maskedEmail } = await lookupLogin(phone);
      if (registered && hasPin) {
        setStep('pin');
        setLoginPin('');
        return;
      }
      const purpose: OtpFlowPurpose =
        registered && !hasPin ? 'recovery' : 'register';
      setOtpFlowPurpose(purpose);
      setMaskedEmailHint(maskedEmail);
      setEmail('');
      setStep('email');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const sendVerificationCode = async () => {
    setError(null);
    setHint(null);
    setLoading(true);
    try {
      const res = await requestOtp(phone, otpFlowPurpose, email);
      applyOtpHint(res, setHint);
      setCode('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await sendVerificationCode();
    if (ok) setStep('code');
  };

  const handleForgotPin = () => {
    setError(null);
    setHint(null);
    setOtpFlowPurpose('recovery');
    setMaskedEmailHint(null);
    setEmail('');
    setStep('email');
    setCode('');
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
      const verified = await verifyOtp(phone, codeValue, email);
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
              <p className="authTrust">
                New sign-ins use a one-time code sent to your email — same as the Moja member app.
              </p>
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
              onClick={handleForgotPin}
              disabled={loading}
            >
              Forgot PIN? Use email OTP
            </button>
            <p className="caption" style={{ marginTop: 8 }}>
              Use your registered email to verify and set a new PIN.
            </p>
          </>
        )}

        {step === 'email' && (
          <>
            <button
              type="button"
              className="linkBtn"
              onClick={() => {
                setStep(otpFlowPurpose === 'recovery' ? 'pin' : 'phone');
                setError(null);
                setHint(null);
              }}
            >
              ← Back
            </button>
            <h1>Verify with email</h1>
            <p className="authSub">
              Enter the email for <strong>{phone}</strong> to receive a 6-digit verification code.
            </p>
            {maskedEmailHint && (
              <p className="hint">Registered email hint: {maskedEmailHint}</p>
            )}
            <form onSubmit={handleEmailContinue}>
              <label htmlFor="email-otp">Email address</label>
              <input
                id="email-otp"
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              {error && <p className="err">{error}</p>}
              <button type="submit" className="btnPrimary" disabled={loading || !email.trim()}>
                {loading ? 'Sending…' : 'Send verification code'}
              </button>
            </form>
          </>
        )}

        {step === 'code' && (
          <>
            <button type="button" className="linkBtn" onClick={() => setStep('email')}>
              ← Back
            </button>
            <h1>Verification code</h1>
            <p className="authSub">
              Enter the 6-digit code sent to <strong>{email.trim() || 'your email'}</strong>.
            </p>
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
            <button
              type="button"
              className="btnSecondary"
              disabled={loading}
              onClick={() => void sendVerificationCode()}
            >
              Resend code
            </button>
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
    </main>
  );
}

export function logout() {
  clearToken();
}
