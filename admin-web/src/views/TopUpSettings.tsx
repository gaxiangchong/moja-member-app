import { useEffect, useState } from 'react';
import { fetchTopUpSettings, updateTopUpSettings } from '../api';

type TierRow = { topUp: string; bonus: string };

/** "100" -> 10000 sen. Null when it is not a usable amount of ringgit. */
function rmToCents(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return Number.isFinite(cents) ? cents : null;
}

const centsToRm = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '');
const money = (cents: number) => `RM${(cents / 100).toFixed(2)}`;

/**
 * Credit top-ups: whether members can top up, how much, and the bonus they earn
 * for topping up more ("top up RM100, get RM20 extra").
 */
export function TopUpSettings() {
  const [enabled, setEnabled] = useState(false);
  const [min, setMin] = useState('10');
  const [max, setMax] = useState('1000');
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchTopUpSettings()
      .then((s) => {
        if (!alive) return;
        setEnabled(s.enabled);
        setMin(centsToRm(s.minTopUpCents));
        setMax(centsToRm(s.maxTopUpCents));
        setTiers(s.tiers.map((t) => ({ topUp: centsToRm(t.topUpCents), bonus: centsToRm(t.bonusCents) })));
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load top-up settings');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const touch = () => setSavedAt(null);

  function setTier(i: number, patch: Partial<TierRow>) {
    setTiers((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    touch();
  }

  async function save() {
    setSaveError(null);
    const minC = rmToCents(min);
    const maxC = rmToCents(max);
    if (minC == null || maxC == null) {
      setSaveError('Enter the minimum and maximum top-up as amounts in RM, e.g. 10 or 10.50.');
      return;
    }
    const parsed: { topUpCents: number; bonusCents: number }[] = [];
    for (const [i, row] of tiers.entries()) {
      const topUpCents = rmToCents(row.topUp);
      const bonusCents = rmToCents(row.bonus);
      if (topUpCents == null || bonusCents == null) {
        setSaveError(`Tier ${i + 1}: enter both the top-up and the bonus as amounts in RM.`);
        return;
      }
      parsed.push({ topUpCents, bonusCents });
    }
    setSaving(true);
    try {
      const saved = await updateTopUpSettings({
        enabled,
        minTopUpCents: minC,
        maxTopUpCents: maxC,
        tiers: parsed,
      });
      // Show what the server kept (it sorts the tiers).
      setTiers(saved.tiers.map((t) => ({ topUp: centsToRm(t.topUpCents), bonus: centsToRm(t.bonusCents) })));
      setMin(centsToRm(saved.minTopUpCents));
      setMax(centsToRm(saved.maxTopUpCents));
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="dataTableMuted">Loading…</p>;
  if (error) return <p className="dataTableMuted">{error}</p>;

  return (
    <div className="panelGrid">
      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Credit top-up &amp; bonus</h2>
          <button
            type="button"
            className="toolbarButton toolbarButton--primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="dataTableMuted" style={{ marginTop: 0 }}>
          Opens when a member taps <strong>Credits</strong> in the app. They pay for credit, and earn extra free
          credit for topping up more — for example top up RM100 and get RM20 extra, so RM120 lands in their wallet.
        </p>
        <p className="dataTableMuted" style={{ background: '#f0f9ff', padding: '10px 12px', borderRadius: 8 }}>
          <strong>Spending credits:</strong> at checkout a member can choose <em>Pay with credits</em> when their
          balance covers the whole order. If they cancel an order paid that way, the credits go straight back to
          their wallet. Credits can't be split with a card payment yet, and they don't expire.
        </p>

        <label className="switchRow" style={{ marginBottom: 16 }}>
          <span className="switch">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                touch();
              }}
            />
            <span className="switchTrack" aria-hidden />
          </span>
          <span>Members can top up credits</span>
        </label>

        <div className="panelGrid panelGrid--2">
          <label>
            Smallest top-up (RM)
            <input
              className="toolbarInput"
              inputMode="decimal"
              value={min}
              onChange={(e) => {
                setMin(e.target.value);
                touch();
              }}
            />
          </label>
          <label>
            Largest top-up (RM)
            <input
              className="toolbarInput"
              inputMode="decimal"
              value={max}
              onChange={(e) => {
                setMax(e.target.value);
                touch();
              }}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Bonus tiers</h2>
          <button
            type="button"
            className="toolbarButton"
            onClick={() => {
              setTiers((rows) => [...rows, { topUp: '', bonus: '' }]);
              touch();
            }}
          >
            + Add tier
          </button>
        </div>
        <p className="dataTableMuted" style={{ marginTop: 0 }}>
          A member who tops up <em>at least</em> the amount gets the bonus of the highest tier they reach. Topping up
          RM150 with tiers at RM100 and RM200 earns the RM100 bonus. A bigger top-up must earn a bigger bonus, and
          members always keep the bonus shown when they started paying, even if you change the tiers meanwhile.
        </p>

        {tiers.length === 0 ? (
          <p className="dataTableMuted">No bonus tiers. Members can top up but earn no bonus.</p>
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Member tops up at least (RM)</th>
                <th>Bonus credit (RM)</th>
                <th>They receive</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tiers.map((row, i) => {
                const t = rmToCents(row.topUp);
                const b = rmToCents(row.bonus);
                const ok = t != null && b != null && t > 0;
                return (
                  <tr key={i}>
                    <td>
                      <input
                        className="toolbarInput"
                        inputMode="decimal"
                        aria-label={`Tier ${i + 1} top-up amount`}
                        value={row.topUp}
                        onChange={(e) => setTier(i, { topUp: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="toolbarInput"
                        inputMode="decimal"
                        aria-label={`Tier ${i + 1} bonus`}
                        value={row.bonus}
                        onChange={(e) => setTier(i, { bonus: e.target.value })}
                      />
                    </td>
                    <td className="dataTableMuted">
                      {ok ? (
                        <>
                          {money(t + b)} for {money(t)}{' '}
                          <span>({Math.round((b / t) * 100)}% extra)</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="toolbarButton"
                        onClick={() => {
                          setTiers((rows) => rows.filter((_, j) => j !== i));
                          touch();
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {saveError ? <p className="viewError">{saveError}</p> : null}
        {savedAt ? (
          <p className="dataTableMuted">Saved. Members see the change the next time they open the top-up screen.</p>
        ) : null}
      </section>
    </div>
  );
}
