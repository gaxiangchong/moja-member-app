import { useCallback, useState, type FormEvent, type ReactElement } from 'react';
import {
  collectBentoPickup,
  fetchBentoPickupLookup,
  type BentoPickupLookup,
} from './api';
import { BentoScanModal } from './BentoScanModal';
import { extractBentoPickupCodeFromScan } from './bentoPickupRef';

type PackSummary = BentoPickupLookup['summary'];

function PackDot({ color }: { color: 'orange' | 'green' | 'brown' | 'blue' }) {
  return <span className={`packDot packDot-${color}`} aria-hidden />;
}

function PackSummaryView({ summary }: { summary: PackSummary }) {
  const rows: Array<{ key: string; count: number; dots: ReactElement }> = [];
  if (summary.regular > 0) {
    rows.push({
      key: 'regular',
      count: summary.regular,
      dots: <PackDot color="orange" />,
    });
  }
  if (summary.vegetarian > 0) {
    rows.push({
      key: 'vegetarian',
      count: summary.vegetarian,
      dots: <PackDot color="green" />,
    });
  }
  if (summary.regularBrown > 0) {
    rows.push({
      key: 'regularBrown',
      count: summary.regularBrown,
      dots: (
        <>
          <PackDot color="orange" />
          <PackDot color="brown" />
        </>
      ),
    });
  }
  if (summary.vegetarianBrown > 0) {
    rows.push({
      key: 'vegetarianBrown',
      count: summary.vegetarianBrown,
      dots: (
        <>
          <PackDot color="green" />
          <PackDot color="brown" />
        </>
      ),
    });
  }

  return (
    <div className="bentoPackSummary">
      <p className="bentoPackTotal">
        <strong>{summary.totalPacks}</strong> pack{summary.totalPacks === 1 ? '' : 's'} today
        {summary.lunchCount + summary.dinnerCount > 0 ? (
          <>
            {' '}
            · {summary.lunchCount} lunch · {summary.dinnerCount} dinner
          </>
        ) : null}
      </p>
      <div className="bentoPackRows">
        {rows.map((row) => (
          <div key={row.key} className="bentoPackRow">
            <span className="bentoPackDots">{row.dots}</span>
            <span>× {row.count}</span>
          </div>
        ))}
        {summary.withDrink > 0 ? (
          <div className="bentoPackRow">
            <span className="bentoPackDots">
              <PackDot color="blue" />
            </span>
            <span>Drink × {summary.withDrink}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BentoPickupPanel({
  apiKey,
  baseUrl,
}: {
  apiKey: string;
  baseUrl: string;
}) {
  const [manualCode, setManualCode] = useState('');
  const [lookup, setLookup] = useState<BentoPickupLookup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const runLookup = useCallback(
    async (raw: string) => {
      const code = extractBentoPickupCodeFromScan(raw);
      if (!code) {
        setErr('Enter a 6-digit pickup code.');
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const result = await fetchBentoPickupLookup(apiKey, code, baseUrl);
        setLookup(result);
        setManualCode(code);
      } catch (e) {
        setLookup(null);
        setErr(e instanceof Error ? e.message : 'Lookup failed');
      } finally {
        setBusy(false);
      }
    },
    [apiKey, baseUrl],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runLookup(manualCode);
  };

  const onCollect = async () => {
    if (!lookup?.pickupCode) return;
    setBusy(true);
    setErr(null);
    try {
      await collectBentoPickup(apiKey, lookup.pickupCode, baseUrl);
      await runLookup(lookup.pickupCode);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Collect failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bentoPickupPanel">
      <div className="bentoPickupHead">
        <button type="button" className="btnGhost" onClick={() => setScanOpen(true)} disabled={busy}>
          Scan QR
        </button>
      </div>

      <form className="bentoLookupForm" onSubmit={onSubmit}>
        <label htmlFor="bentoLookupCode">Pickup code</label>
        <div className="bentoLookupRow">
          <input
            id="bentoLookupCode"
            value={manualCode}
            onChange={(ev) => setManualCode(ev.target.value)}
            placeholder="6-digit code, e.g. 104829"
            autoComplete="off"
            disabled={busy}
          />
          <button type="submit" className="btnPrimary" disabled={busy}>
            {busy ? 'Loading…' : 'Look up'}
          </button>
        </div>
      </form>

      {err ? <p className="err">{err}</p> : null}

      {lookup ? (
        <section className="bentoLookupCard">
          <div className="bentoLookupMeta">
            <div>
              <span className="muted">Pickup ID</span>
              <strong className="bentoLookupCode">{lookup.pickupCode}</strong>
            </div>
            <div>
              <span className="muted">Member</span>
              <strong>{lookup.customerDisplayName?.trim() || '—'}</strong>
              <span className="muted" style={{ marginLeft: 8 }}>
                {lookup.customerPhoneMasked}
              </span>
            </div>
            <div>
              <span className="muted">Pickup date</span>
              <strong>{lookup.deliveryDate}</strong>
            </div>
          </div>

          {lookup.nothingScheduled ? (
            <p className="muted">No bento pickup scheduled for today.</p>
          ) : (
            <PackSummaryView summary={lookup.summary} />
          )}

          {lookup.alreadyCollected ? (
            <p className="bentoStatusOk">Already collected for today.</p>
          ) : null}

          {!lookup.nothingScheduled && !lookup.alreadyCollected ? (
            <button type="button" className="btnPrimary" disabled={busy} onClick={() => void onCollect()}>
              {busy ? 'Saving…' : 'Mark collected'}
            </button>
          ) : null}
        </section>
      ) : null}

      <BentoScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(code) => {
          setScanOpen(false);
          void runLookup(code);
        }}
      />
    </div>
  );
}
