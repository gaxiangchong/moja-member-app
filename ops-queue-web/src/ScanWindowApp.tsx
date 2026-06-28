import { useCallback, useEffect, useState } from 'react';
import { completeQueueOrder } from './api';
import { OpsLoginScreen } from './OpsLoginScreen';
import { ScanCollectModal } from './ScanCollectModal';
import { defaultBase, readStoredKey } from './opsSession';
import { useOpsAuth } from './useOpsAuth';
import { formatOrderPickupLabel } from './orderRef';

/**
 * Minimal app for `window.open(..., '#/scan')` — same origin as queue so ops API key in localStorage works.
 */
export function ScanWindowApp() {
  const { state: authState, signIn } = useOpsAuth();
  const [, setTick] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('storage', bump);
    let prevKey = readStoredKey().trim();
    const poll = window.setInterval(() => {
      const nextKey = readStoredKey().trim();
      if (nextKey !== prevKey) {
        prevKey = nextKey;
        bump();
      }
    }, 500);
    return () => {
      window.removeEventListener('storage', bump);
      window.clearInterval(poll);
    };
  }, []);

  const onCollect = useCallback(async (orderToken: string) => {
    if (authState.status !== 'authenticated') throw new Error('Not signed in');
    const res = await completeQueueOrder(
      authState.apiKey,
      orderToken,
      authState.apiBase.trim() || defaultBase,
    );
    setFlash(`Collected order ${formatOrderPickupLabel(res.orderNumber)}`);
    window.setTimeout(() => setFlash(null), 3500);
  }, [authState]);

  if (authState.status !== 'authenticated') {
    return (
      <OpsLoginScreen
        title="Scan to collect"
        lead="Sign in with OPS_QUEUE_API_KEY before scanning pickup QR codes."
        checking={authState.status === 'checking'}
        onSubmit={signIn}
        footer={
          <button type="button" className="ghostBtn" style={{ marginTop: 14 }} onClick={() => window.close()}>
            Close window
          </button>
        }
      />
    );
  }

  return (
    <div className="scanWindowPage">
      {flash ? (
        <p className="scanFlash" role="status">
          {flash}
        </p>
      ) : null}
      <ScanCollectModal
        open
        variant="standalone"
        closeOnCollect={false}
        onClose={() => window.close()}
        onCollect={onCollect}
      />
    </div>
  );
}
