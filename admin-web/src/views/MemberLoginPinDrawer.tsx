import { useEffect, useState } from 'react';
import {
  clearCustomerLoginPin,
  fetchCustomerLoginStatus,
  generateCustomerLoginPin,
  type CustomerLoginStatus,
} from '../api';

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Helps a member who can't sign in. Two ways, both recorded in the audit log:
 * give them a temporary PIN to read out, or remove their PIN so their next
 * sign-in goes through the WhatsApp code and they choose a new one themselves.
 */
export function MemberLoginPinDrawer({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<CustomerLoginStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** The temporary PIN, shown once. Never kept anywhere else, and gone when the panel closes. */
  const [newPin, setNewPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCustomerLoginStatus(customerId)
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch((err) => {
        if (alive) setLoadError(err instanceof Error ? err.message : 'Could not load this member');
      });
    return () => {
      alive = false;
    };
  }, [customerId]);

  const who = status?.displayName || status?.phoneE164 || 'this member';

  async function generate() {
    const replacing = status?.hasLoginPin;
    if (
      !window.confirm(
        `${replacing ? `Replace ${who}'s current PIN with a new temporary PIN?\n\nThe old PIN stops working straight away.` : `Give ${who} a temporary PIN?`}\n\nOnly do this after you are sure you are speaking to the member.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    setCopied(false);
    try {
      const { pin } = await generateCustomerLoginPin(customerId);
      setNewPin(pin);
      setStatus((s) => (s ? { ...s, hasLoginPin: true } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a PIN');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Remove ${who}'s PIN?\n\nThey will sign in with a WhatsApp code and choose a new PIN. Their old PIN stops working straight away.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    setNewPin(null);
    try {
      await clearCustomerLoginPin(customerId);
      setStatus((s) => (s ? { ...s, hasLoginPin: false } : s));
      setMessage('PIN removed. Ask the member to open the app and sign in with the WhatsApp code; they will be asked to choose a new PIN.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the PIN');
    } finally {
      setBusy(false);
    }
  }

  async function copyPin() {
    if (!newPin) return;
    try {
      await navigator.clipboard.writeText(newPin);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="drawerBackdrop" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawerHead">
          <h2 className="panelTitle">Login PIN{status ? ` · ${who}` : ''}</h2>
          <button type="button" className="drawerClose" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="drawerBody">
          {loadError ? <p className="viewError">{loadError}</p> : null}
          {!status && !loadError ? <p className="viewMuted">Loading…</p> : null}
          {error ? <p className="viewError">{error}</p> : null}
          {message ? <p className="viewMuted">{message}</p> : null}

          {status ? (
            <>
              <section>
                <table className="dataTable">
                  <tbody>
                    <tr>
                      <td>Phone</td>
                      <td>{status.phoneE164}</td>
                    </tr>
                    <tr>
                      <td>Login PIN</td>
                      <td>
                        <span className={`badge badge--${status.hasLoginPin ? 'success' : 'neutral'}`}>
                          {status.hasLoginPin ? 'Set' : 'Not set'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Last sign-in</td>
                      <td>{formatDate(status.lastLoginAt)}</td>
                    </tr>
                  </tbody>
                </table>
                {!status.hasLoginPin ? (
                  <p className="viewMuted">
                    This member has no PIN, so they sign in with a WhatsApp code and choose one then.
                  </p>
                ) : null}
              </section>

              <section style={{ marginTop: 20 }}>
                <h3 className="drawerSectionTitle">Give a temporary PIN</h3>
                <p className="viewMuted" style={{ marginTop: 0 }}>
                  Makes a new 6-digit PIN you can read out to the member. They sign in with their phone number and
                  this PIN. Confirm who you are speaking to first.
                </p>
                <button type="button" className="toolbarButton toolbarButton--primary" disabled={busy} onClick={() => void generate()}>
                  {busy ? 'Working…' : status.hasLoginPin ? 'Replace with a new PIN' : 'Generate a PIN'}
                </button>

                {newPin ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 14,
                      border: '1px solid var(--border, #e2e8f0)',
                      borderRadius: 10,
                      background: '#f8fafc',
                    }}
                    role="status"
                  >
                    <div className="viewMuted">Temporary PIN for {who}</div>
                    <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 8, margin: '6px 0' }}>{newPin}</div>
                    <button type="button" className="toolbarButton" onClick={() => void copyPin()}>
                      {copied ? 'Copied' : 'Copy PIN'}
                    </button>
                    <p className="viewMuted" style={{ marginBottom: 0 }}>
                      This is shown once and cannot be looked up again; only a scrambled copy is stored. If you lose
                      it, generate a new one. The member can choose their own PIN later with Forgot PIN.
                    </p>
                  </div>
                ) : null}
              </section>

              <section style={{ marginTop: 24 }}>
                <h3 className="drawerSectionTitle">Remove the PIN</h3>
                <p className="viewMuted" style={{ marginTop: 0 }}>
                  Nothing to read out. The member signs in with a WhatsApp code and chooses a new PIN themselves.
                </p>
                <button type="button" className="toolbarButton" disabled={busy || !status.hasLoginPin} onClick={() => void remove()}>
                  Remove PIN
                </button>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
