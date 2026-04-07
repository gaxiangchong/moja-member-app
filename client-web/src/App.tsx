import { useCallback, useEffect, useState } from 'react';
import './App.css';
import {
  clearToken,
  fetchMe,
  getToken,
  requestOtp,
  setToken,
  verifyOtp,
  type MemberProfile,
} from './api';

type Step = 'phone' | 'code' | 'home';

function App() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);

  const loadProfile = useCallback(async () => {
    setError(null);
    try {
      const me = await fetchMe();
      setProfile(me);
      setStep('home');
    } catch {
      clearToken();
      setProfile(null);
      setStep('phone');
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      void loadProfile();
    }
  }, [loadProfile]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);
    setLoading(true);
    try {
      const res = await requestOtp(phone);
      setStep('code');
      if (res.channel === 'whatsapp') {
        setHint('Check WhatsApp for your verification code.');
      } else if (res._devCode) {
        setHint(`Dev mode: your code is ${res._devCode}`);
      } else {
        setHint('If you did not receive a code, contact support.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken } = await verifyOtp(phone, code);
      setToken(accessToken);
      await loadProfile();
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    setProfile(null);
    setStep('phone');
    setCode('');
    setHint(null);
  };

  return (
    <div className="app">
      <header className="header">
        <span className="logo">Moja</span>
        <span className="tagline">Member</span>
      </header>

      <main className="main">
        {step === 'phone' && (
          <section className="card">
            <h1>Sign in with your phone</h1>
            <p className="sub">
              We will send a one-time code to your WhatsApp. No password needed.
            </p>
            <form onSubmit={handleSendCode}>
              <label htmlFor="phone">Mobile number</label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="e.g. 9123 4567 or +65 9123 4567"
                value={phone}
                onChange={(ev) => setPhone(ev.target.value)}
                required
                disabled={loading}
              />
              {error && <p className="err">{error}</p>}
              <button type="submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send WhatsApp code'}
              </button>
            </form>
          </section>
        )}

        {step === 'code' && (
          <section className="card">
            <h1>Enter verification code</h1>
            <p className="sub">Sent to the WhatsApp number you entered.</p>
            {hint && <p className="hint">{hint}</p>}
            <form onSubmit={handleVerify}>
              <label htmlFor="code">6-digit code</label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ''))}
                required
                disabled={loading}
              />
              {error && <p className="err">{error}</p>}
              <div className="row">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setStep('phone');
                    setCode('');
                    setError(null);
                    setHint(null);
                  }}
                  disabled={loading}
                >
                  Change number
                </button>
                <button type="submit" disabled={loading}>
                  {loading ? 'Verifying…' : 'Verify & sign in'}
                </button>
              </div>
            </form>
          </section>
        )}

        {step === 'home' && profile && (
          <section className="card">
            <h1>Welcome</h1>
            <p className="sub">You are signed in as a member.</p>
            <dl className="profile">
              <div>
                <dt>Phone</dt>
                <dd>{profile.phoneE164}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`pill pill-${profile.status.toLowerCase()}`}>
                    {profile.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Loyalty points</dt>
                <dd>{profile.loyalty.pointsBalance}</dd>
              </div>
              {(profile.displayName || profile.email) && (
                <div>
                  <dt>Profile</dt>
                  <dd>
                    {[profile.displayName, profile.email]
                      .filter(Boolean)
                      .join(' · ')}
                  </dd>
                </div>
              )}
            </dl>
            <button type="button" className="ghost full" onClick={handleLogout}>
              Sign out
            </button>
          </section>
        )}
      </main>

      <footer className="footer">
        Secured with phone verification · Moja Member
      </footer>
    </div>
  );
}

export default App;
