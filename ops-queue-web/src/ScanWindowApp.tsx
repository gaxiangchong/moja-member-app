import { useCallback, useEffect, useState } from 'react';
import { completeQueueOrder } from './api';
import { ScanCollectModal } from './ScanCollectModal';
import { defaultBase, readStoredBase, readStoredKey } from './opsSession';
import { formatOrderPickupLabel } from './orderRef';

/**
 * Minimal app for `window.open(..., '#/scan')` — same origin as queue so ops API key in localStorage works.
 */
export function ScanWindowApp() {
  const [, setTick] = useState(0);
  const apiKey = readStoredKey();
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
    const k = readStoredKey().trim();
    if (!k) throw new Error('No ops API key');
    const b = readStoredBase().trim() || defaultBase;
    const res = await completeQueueOrder(k, orderToken, b);
    setFlash(`Collected order ${formatOrderPickupLabel(res.orderNumber)}`);
    window.setTimeout(() => setFlash(null), 3500);
  }, []);

  if (!apiKey.trim()) {
    return (
      <div className="connectCard" style={{ margin: '32px auto' }}>
        <h1>Scan to collect</h1>
        <p className="muted" style={{ lineHeight: 1.55 }}>
          This window does not have your ops API key yet. On the <strong>main Order queue</strong> tab,
          click <strong>Connect</strong> once — this popup will detect the key within a second (or close
          and open Scan QR again).
        </p>
        <p className="muted" style={{ lineHeight: 1.55 }}>
          Same browser profile: key is stored as <code>moja_ops_api_key</code> in localStorage.
        </p>
        <button type="button" className="btnGhost" onClick={() => window.close()}>
          Close window
        </button>
      </div>
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
