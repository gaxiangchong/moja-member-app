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
import { LangToggle, useI18n } from '../lib/i18n/context';

type Step = 'phone' | 'pin' | 'email' | 'code' | 'setPin';
type OtpFlowPurpose = 'register' | 'recovery';

type Props = {
  onAuthenticated: () => void;
};

export function AuthScreens({ onAuthenticated }: Props) {
  const { t } = useI18n();
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

  const applyOtpHint = useCallback(
    (res: { channel?: string; _devCode?: string }, setHintFn: (h: string | null) => void) => {
      if (res.channel === 'email') {
        setHintFn(t('auth.otpEmailHint'));
      } else if (res.channel === 'mock' && res._devCode) {
        setHintFn(t('auth.otpMockHint', { code: res._devCode }));
      } else if (res._devCode) {
        setHintFn(t('auth.otpDevHint', { code: res._devCode }));
      } else {
        setHintFn(t('auth.otpFallback'));
      }
    },
    [t],
  );

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
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
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
      setError(err instanceof Error ? err.message : t('auth.errorGeneric'));
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
      setError(err instanceof Error ? err.message : t('auth.errorLogin'));
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
      setError(err instanceof Error ? err.message : t('auth.errorVerify'));
    } finally {
      setLoading(false);
    }
  };

  const submitSetPin = async (a: string, b: string) => {
    if (a !== b) {
      setError(t('auth.pinMismatch'));
      setNewPinConfirm('');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { accessToken } = await setInitialPin(setupToken, a, b);
      finishAuth(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errorSavePin'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="authMain">
      <div className="authOverlay" />
      <div className="authCard">
        <div className="authLangRow">
          <LangToggle />
        </div>
        <div className="authBrand">
          <img src="/logo.png" alt="" className="authBrandLogo" />
          <div>
            <span className="authBrandName">{t('auth.brandName')}</span>
            <span className="authBrandTagline">{t('auth.brandTagline')}</span>
          </div>
        </div>

        {step === 'phone' && (
          <>
            <h1>{t('auth.welcomeTitle')}</h1>
            <p className="authSub">{t('auth.welcomeSub')}</p>
            <form onSubmit={handlePhoneContinue}>
              <label htmlFor="phone">{t('auth.phoneLabel')}</label>
              <input
                id="phone"
                type="tel"
                placeholder={t('auth.phonePlaceholder')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={loading}
              />
              {error && <p className="err">{error}</p>}
              <button type="submit" className="btnPrimary" disabled={loading}>
                {loading ? t('common.checking') : t('common.continue')}
              </button>
              <p className="authTrust">{t('auth.trust')}</p>
            </form>
          </>
        )}

        {step === 'pin' && (
          <>
            <button type="button" className="linkBtn" onClick={() => setStep('phone')}>
              {t('common.back')}
            </button>
            <h1>{t('auth.enterPin')}</h1>
            <p className="authSub">{t('auth.pinFor', { phone })}</p>
            <OtpBoxes
              value={loginPin}
              onChange={(next) => {
                setLoginPin(next);
                if (next.length === 6) void submitPinLogin(next);
              }}
              masked
              autoFocus
              disabled={loading}
              ariaLabel={t('auth.pinAria')}
            />
            {error && <p className="err">{error}</p>}
            <button
              type="button"
              className="btnSecondary"
              onClick={handleForgotPin}
              disabled={loading}
            >
              {t('auth.forgotPin')}
            </button>
            <p className="caption" style={{ marginTop: 8 }}>
              {t('auth.forgotPinHint')}
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
              {t('common.back')}
            </button>
            <h1>{t('auth.verifyEmail')}</h1>
            <p className="authSub">
              {t('auth.verifyEmailSub', { phone })}
            </p>
            {maskedEmailHint && (
              <p className="hint">{t('auth.emailHint', { hint: maskedEmailHint })}</p>
            )}
            <form onSubmit={handleEmailContinue}>
              <label htmlFor="email-otp">{t('auth.emailLabel')}</label>
              <input
                id="email-otp"
                type="email"
                autoComplete="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              {error && <p className="err">{error}</p>}
              <button type="submit" className="btnPrimary" disabled={loading || !email.trim()}>
                {loading ? t('common.sending') : t('auth.sendCode')}
              </button>
            </form>
          </>
        )}

        {step === 'code' && (
          <>
            <button type="button" className="linkBtn" onClick={() => setStep('email')}>
              {t('common.back')}
            </button>
            <h1>{t('auth.verificationCode')}</h1>
            <p className="authSub">
              {t('auth.codeSub', { email: email.trim() || t('common.email') })}
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
              {t('auth.resendCode')}
            </button>
          </>
        )}

        {step === 'setPin' && (
          <>
            <h1>{setPinPhase === 'first' ? t('auth.createPin') : t('auth.confirmPin')}</h1>
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
