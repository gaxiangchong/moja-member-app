import { useState, type FormEvent, type ReactNode } from 'react';
import { opsSignIn } from './api';
import { defaultBase, readStoredBase } from './opsSession';

type Props = {
  title: string;
  lead: string;
  checking?: boolean;
  /** Receives the admin access token from a successful email + password sign-in. */
  onSubmit: (token: string, base: string) => Promise<void>;
  footer?: ReactNode;
  /** Optional banner shown above the form, e.g. after a session expiry. */
  notice?: string | null;
};

/** Ops sign-in: the same admin email and password as admin-web and the admin dashboard. */
export function OpsLoginScreen({
  title,
  lead,
  checking = false,
  onSubmit,
  footer,
  notice,
}: Props) {
  const [apiBase, setApiBase] = useState(() => readStoredBase());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onConnect = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!email.trim() || !password) {
      setErr('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const base = apiBase.trim() || defaultBase;
      const token = await opsSignIn(email.trim(), password, base);
      await onSubmit(token, base);
      setPassword('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="loginPage">
      <div className="loginCard" role="main">
        <div className="loginBrand">
          Moja <span>Operations</span>
        </div>
        <h1 className="loginTitle">{title}</h1>
        <p className="loginLead">{lead}</p>
        {notice ? (
          <p className="loginNotice" role="status">
            {notice}
          </p>
        ) : null}
        {checking ? (
          <p className="loginStatus ok" role="status">
            Verifying saved session…
          </p>
        ) : (
          <form onSubmit={onConnect}>
            <label htmlFor="opsLoginBase">API base URL</label>
            <input
              id="opsLoginBase"
              value={apiBase}
              onChange={(ev) => setApiBase(ev.target.value)}
              placeholder={defaultBase}
              autoComplete="off"
              disabled={busy}
            />
            <label htmlFor="opsLoginEmail">Email</label>
            <input
              id="opsLoginEmail"
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              disabled={busy}
            />
            <label htmlFor="opsLoginPassword">Password</label>
            <input
              id="opsLoginPassword"
              type="password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={busy}
            />
            {err ? <p className="err">{err}</p> : null}
            <button type="submit" className="btnPrimary loginSubmit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
        {footer}
      </div>
    </div>
  );
}
