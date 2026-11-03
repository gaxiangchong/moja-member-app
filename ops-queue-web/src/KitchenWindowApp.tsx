import { useState } from 'react';
import { KitchenDayGrid } from './KitchenDayGrid';
import { KitchenTodayStock } from './KitchenTodayStock';
import { OpsLoginScreen } from './OpsLoginScreen';
import { defaultBase } from './opsSession';
import { useOpsAuth } from './useOpsAuth';

/**
 * Kitchen staff set how many of each cake size are ready (`#/kitchen`): today's
 * shelf, or the next seven days for pre-orders.
 */
export function KitchenWindowApp() {
  const { state: authState, signIn } = useOpsAuth();
  const [view, setView] = useState<'today' | 'days'>('today');

  if (authState.status !== 'authenticated') {
    return (
      <OpsLoginScreen
        title="Kitchen stock"
        lead="Sign in with your admin email and password — the same account as the admin dashboard."
        checking={authState.status === 'checking'}
        onSubmit={signIn}
      />
    );
  }

  const base = authState.apiBase.trim() || defaultBase;

  if (view === 'days') {
    return (
      <div className="kitchenPage">
        <div className="kitchenTabs">
          <button type="button" className="btnGhost" onClick={() => setView('today')}>
            ← Today's tray
          </button>
        </div>
        <KitchenDayGrid apiKey={authState.apiKey} apiBase={base} />
      </div>
    );
  }

  return (
    <div className="loginPage">
      <div className="loginCard" style={{ maxWidth: 560 }}>
        <div className="loginBrand">
          Moja <span>Kitchen</span>
        </div>
        <h1 className="loginTitle">Today's cake stock</h1>
        <button
          type="button"
          className="btnGhost"
          style={{ marginBottom: 8 }}
          onClick={() => setView('days')}
        >
          Next 7 days →
        </button>
        <KitchenTodayStock apiKey={authState.apiKey} apiBase={base} />
      </div>
    </div>
  );
}
