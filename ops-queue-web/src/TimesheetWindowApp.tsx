import { useCallback, useState, type FormEvent } from 'react';
import { timesheetClockIn, timesheetClockOut } from './api';
import { defaultBase, readStoredBase, readStoredKey, STORAGE_BASE, STORAGE_KEY } from './opsSession';

export function TimesheetWindowApp() {
  const [apiKey, setApiKey] = useState(() => readStoredKey());
  const [apiBase, setApiBase] = useState(() => readStoredBase());
  const [unlockKey, setUnlockKey] = useState('');
  const [unlockBase, setUnlockBase] = useState(() => readStoredBase());
  const [employeeCode, setEmployeeCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onUnlock = (e: FormEvent) => {
    e.preventDefault();
    const k = unlockKey.trim();
    const b = unlockBase.trim() || defaultBase;
    if (!k) return;
    try {
      localStorage.setItem(STORAGE_KEY, k);
      localStorage.setItem(STORAGE_BASE, b);
    } catch {
      /* private mode */
    }
    setApiKey(k);
    setApiBase(b);
  };

  const run = useCallback(
    async (mode: 'in' | 'out') => {
      const k = apiKey.trim();
      const b = apiBase.trim() || defaultBase;
      const code = employeeCode.trim();
      if (!k) {
        setErr('No ops API key in this window. Unlock below or connect on the main queue tab first.');
        return;
      }
      if (!code) {
        setErr('Enter your employee ID.');
        return;
      }
      setBusy(true);
      setErr(null);
      setMsg(null);
      try {
        const res =
          mode === 'in'
            ? await timesheetClockIn(k, code, b)
            : await timesheetClockOut(k, code, b);
        const name = res.employee?.displayName ?? '';
        setMsg(
          mode === 'in'
            ? `Clocked in · ${name || res.employee?.employeeCode || ''}`
            : `Clocked out · ${name || res.employee?.employeeCode || ''}`,
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Request failed');
      } finally {
        setBusy(false);
      }
    },
    [apiKey, apiBase, employeeCode],
  );

  if (!apiKey.trim()) {
    return (
      <div className="connectCard" style={{ marginTop: 24 }}>
        <h1>Timesheet</h1>
        <p className="muted" style={{ lineHeight: 1.5 }}>
          This window needs the same <code>OPS_QUEUE_API_KEY</code> as the order queue. If you already
          connected on the main tab, paste the key here once; it is saved in localStorage for this
          browser.
        </p>
        <form onSubmit={onUnlock}>
          <label htmlFor="tsUnlockBase">API base URL</label>
          <input
            id="tsUnlockBase"
            value={unlockBase}
            onChange={(ev) => setUnlockBase(ev.target.value)}
            autoComplete="off"
          />
          <label htmlFor="tsUnlockKey">Ops API key</label>
          <input
            id="tsUnlockKey"
            type="password"
            value={unlockKey}
            onChange={(ev) => setUnlockKey(ev.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btnPrimary" style={{ marginTop: 16, width: '100%' }}>
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="connectCard" style={{ marginTop: 24, maxWidth: 440 }}>
      <h1>Timesheet</h1>
      <p className="muted" style={{ lineHeight: 1.5 }}>
        Enter your <strong>employee ID</strong> (same code configured in admin → Employee management),
        then clock in at the start of shift and clock out at the end.
      </p>
      <label htmlFor="tsEmp">Employee ID</label>
      <input
        id="tsEmp"
        value={employeeCode}
        onChange={(ev) => setEmployeeCode(ev.target.value)}
        autoComplete="username"
        placeholder="e.g. E042"
      />
      <div className="btnRow" style={{ marginTop: 18 }}>
        <button
          type="button"
          className="btnPrimary"
          disabled={busy}
          onClick={() => void run('in')}
        >
          {busy ? '…' : 'Clock in'}
        </button>
        <button
          type="button"
          className="btnGhost"
          disabled={busy}
          onClick={() => void run('out')}
        >
          Clock out
        </button>
      </div>
      {msg ? <p style={{ marginTop: 14, color: 'var(--ok, #16a34a)' }}>{msg}</p> : null}
      {err ? <p className="err" style={{ marginTop: 14 }}>{err}</p> : null}
    </div>
  );
}
