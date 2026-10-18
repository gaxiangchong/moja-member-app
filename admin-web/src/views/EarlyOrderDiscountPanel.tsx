import { useEffect, useState } from 'react';
import { fetchEarlyOrderDiscountSettings, updateEarlyOrderDiscountSettings } from '../api';

const MIN_PERCENT = 1;
const MAX_PERCENT = 50;
const MIN_DAYS = 1;
const MAX_DAYS = 30;

/** Percent off whole cakes when a member orders a set number of days before collection. */
export function EarlyOrderDiscountPanel() {
  const [enabled, setEnabled] = useState(false);
  const [percent, setPercent] = useState('5');
  const [days, setDays] = useState('2');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchEarlyOrderDiscountSettings()
      .then((s) => {
        if (!alive) return;
        setEnabled(s.enabled);
        setPercent(String(s.percent));
        setDays(String(s.minDaysAhead));
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load the setting');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const pct = Number(percent);
  const d = Number(days);
  const valid =
    Number.isInteger(pct) && pct >= MIN_PERCENT && pct <= MAX_PERCENT &&
    Number.isInteger(d) && d >= MIN_DAYS && d <= MAX_DAYS;

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      const saved = await updateEarlyOrderDiscountSettings({ enabled, percent: pct, minDaysAhead: d });
      setEnabled(saved.enabled);
      setPercent(String(saved.percent));
      setDays(String(saved.minDaysAhead));
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const edited = () => setSavedAt(null);

  return (
    <section className="panel">
      <div className="panelHead">
        <h2 className="panelTitle">Early order discount</h2>
        <button
          type="button"
          className="toolbarButton toolbarButton--primary"
          disabled={loading || saving || !valid}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {loading ? <p className="dataTableMuted">Loading…</p> : null}
      {error ? <p className="dataTableMuted">{error}</p> : null}
      {!loading && !error ? (
        <>
          <p className="dataTableMuted" style={{ marginTop: 0 }}>
            Members get a discount on <strong>whole cakes</strong> when the pickup date they choose is far enough
            ahead, giving the kitchen time to plan. It applies automatically at checkout, and combines with a voucher
            (it is worked out on the cakes after the voucher). Parcels have no pickup date, so they never qualify.
          </p>
          <label className="switchRow" style={{ marginBottom: 12 }}>
            <span className="switch">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setEnabled(e.target.checked);
                  edited();
                }}
              />
              <span className="switchTrack" aria-hidden />
            </span>
            <span>Give the early order discount</span>
          </label>
          <div className="panelGrid panelGrid--2">
            <label>
              Discount (% off whole cakes)
              <input
                className="toolbarInput"
                type="number"
                min={MIN_PERCENT}
                max={MAX_PERCENT}
                step={1}
                value={percent}
                onChange={(e) => {
                  setPercent(e.target.value);
                  edited();
                }}
              />
            </label>
            <label>
              Order at least (days before pickup)
              <input
                className="toolbarInput"
                type="number"
                min={MIN_DAYS}
                max={MAX_DAYS}
                step={1}
                value={days}
                onChange={(e) => {
                  setDays(e.target.value);
                  edited();
                }}
              />
            </label>
          </div>
          {!valid ? (
            <p className="dataTableMuted">
              Enter a whole percent from {MIN_PERCENT} to {MAX_PERCENT}, and whole days from {MIN_DAYS} to {MAX_DAYS}.
            </p>
          ) : (
            <p className="dataTableMuted" style={{ marginBottom: 0 }}>
              Example: ordered on Monday for pickup on {d === 1 ? 'Tuesday' : d === 2 ? 'Wednesday' : `${d} days later`} or later
              gets {pct}% off the whole cakes.
            </p>
          )}
          {saveError ? <p className="dataTableMuted">{saveError}</p> : null}
          {savedAt ? <p className="dataTableMuted">Saved. Checkout uses it from the next order.</p> : null}
        </>
      ) : null}
    </section>
  );
}
