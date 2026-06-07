import { useState, type FormEvent, type ReactNode } from 'react';
import { defaultBase, readStoredBase } from './opsSession';

type Props = {
  title: string;
  lead: string;
  checking?: boolean;
  devKeyPrefill?: string;
  onSubmit: (key: string, base: string) => Promise<void>;
  footer?: ReactNode;
};

export function OpsLoginScreen({
  title,
  lead,
  checking = false,
  devKeyPrefill = '',
  onSubmit,
  footer,
}: Props) {
  const [apiBase, setApiBase] = useState(() => readStoredBase());
  const [apiKey, setApiKey] = useState(() => devKeyPrefill);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onConnect = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await onSubmit(apiKey, apiBase);
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
            <label htmlFor="opsLoginKey">Ops API key</label>
            <input
              id="opsLoginKey"
              type="password"
              value={apiKey}
              onChange={(ev) => setApiKey(ev.target.value)}
              placeholder="From OPS_QUEUE_API_KEY"
              autoComplete="off"
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
