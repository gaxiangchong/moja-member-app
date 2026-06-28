import { useCallback, useState } from 'react';
import { timesheetClockIn, timesheetClockOut } from './api';
import { OpsLoginScreen } from './OpsLoginScreen';
import { defaultBase } from './opsSession';
import { useOpsAuth } from './useOpsAuth';

export function TimesheetWindowApp() {
  const { state: authState, signIn } = useOpsAuth();
  const [employeeCode, setEmployeeCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (mode: 'in' | 'out') => {
      if (authState.status !== 'authenticated') {
        setErr('Sign in before clocking in or out.');
        return;
      }
      const k = authState.apiKey.trim();
      const b = authState.apiBase.trim() || defaultBase;
      const code = employeeCode.trim();
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
    [authState, employeeCode],
  );

  if (authState.status !== 'authenticated') {
    return (
      <OpsLoginScreen
        title="Timesheet"
        lead="Sign in with OPS_QUEUE_API_KEY before clocking in or out."
        checking={authState.status === 'checking'}
        onSubmit={signIn}
      />
    );
  }

  return (
    <div className="loginPage">
      <div className="loginCard" style={{ maxWidth: 440 }}>
        <div className="loginBrand">
          Moja <span>Operations</span>
        </div>
        <h1 className="loginTitle">Timesheet</h1>
        <p className="loginLead">Enter your employee ID, then clock in or out.</p>
        <label htmlFor="tsEmployee">Employee ID</label>
        <input
          id="tsEmployee"
          value={employeeCode}
          onChange={(ev) => setEmployeeCode(ev.target.value)}
          autoComplete="off"
          disabled={busy}
        />
        {err ? <p className="err">{err}</p> : null}
        {msg ? <p className="loginStatus ok">{msg}</p> : null}
        <div className="btnRow" style={{ marginTop: 16 }}>
          <button type="button" className="btnPrimary" disabled={busy} onClick={() => void run('in')}>
            Clock in
          </button>
          <button type="button" className="btnGhost" disabled={busy} onClick={() => void run('out')}>
            Clock out
          </button>
        </div>
      </div>
    </div>
  );
}
