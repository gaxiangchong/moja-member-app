import { useState } from 'react';
import { HomeBar } from './HomeBar';
import { KitchenDayGrid } from './KitchenDayGrid';
import { KitchenTodayStock } from './KitchenTodayStock';
import { OpsLoginScreen } from './OpsLoginScreen';
import { defaultBase } from './opsSession';
import { useOpsAuth } from './useOpsAuth';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'count', label: 'End-of-day count' },
] as const;

type Tab = (typeof TABS)[number]['id'];

/**
 * Kitchen stock (`#/kitchen`): today's shelf per size, the next seven days
 * for pre-orders, and the end-of-day count.
 */
export function KitchenWindowApp() {
  const { state: authState, signIn } = useOpsAuth();
  const [tab, setTab] = useState<Tab>('today');

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

  return (
    <>
      <HomeBar title="Kitchen stock" />
      <div className="kitchenPage">
        <header className="kitchenHead">
          <h1>Cake stock</h1>
          <div className="kitchenTabs" role="tablist" aria-label="Kitchen stock views">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'kitchenTab kitchenTab--on' : 'kitchenTab'}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>
        {tab === 'today' ? (
          <KitchenTodayStock apiKey={authState.apiKey} apiBase={base} />
        ) : (
          <KitchenDayGrid apiKey={authState.apiKey} apiBase={base} mode={tab} />
        )}
      </div>
    </>
  );
}
