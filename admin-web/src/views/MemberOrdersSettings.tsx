import { useEffect, useState } from 'react';
import { fetchMemberOrdersSettings, updateMemberOrdersSettings } from '../api';

const MIN_DAYS = 1;
const MAX_DAYS = 365;

/** What the member app's Orders page shows: how many days of past orders it lists. */
export function MemberOrdersSettings() {
  const [historyDays, setHistoryDays] = useState('7');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMemberOrdersSettings()
      .then((s) => {
        if (alive) setHistoryDays(String(s.historyDays));
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

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      const saved = await updateMemberOrdersSettings({ historyDays: Number(historyDays) });
      setHistoryDays(String(saved.historyDays));
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="dataTableMuted">Loading…</p>;
  if (error) return <p className="dataTableMuted">{error}</p>;

  const days = Number(historyDays);
  const valid = Number.isInteger(days) && days >= MIN_DAYS && days <= MAX_DAYS;

  return (
    <div className="panelGrid">
      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Orders page</h2>
          <button
            type="button"
            className="toolbarButton toolbarButton--primary"
            disabled={saving || !valid}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="dataTableMuted" style={{ marginTop: 0 }}>
          The member app’s Orders page shows each member how much they have saved by being a member, and their
          recent orders. Finished orders stay on that list for the number of days below, then drop off it.
        </p>
        <div className="panelGrid panelGrid--2">
          <label>
            Keep past orders for (days)
            <input
              className="toolbarInput"
              type="number"
              min={MIN_DAYS}
              max={MAX_DAYS}
              step={1}
              value={historyDays}
              onChange={(e) => {
                setHistoryDays(e.target.value);
                setSavedAt(null);
              }}
            />
          </label>
        </div>
        {!valid ? (
          <p className="dataTableMuted">
            Enter a whole number of days between {MIN_DAYS} and {MAX_DAYS}.
          </p>
        ) : null}
        {saveError ? <p className="dataTableMuted">{saveError}</p> : null}
        {savedAt ? <p className="dataTableMuted">Saved. Members see the change the next time they open Orders.</p> : null}
        <p className="dataTableMuted" style={{ marginBottom: 0 }}>
          Orders still being prepared or waiting for pickup always stay on the list, however old. Older orders are
          only hidden from the member, never deleted, so your sales reports and support lookups are not affected.
          The savings figure always covers everything since the member joined.
        </p>
      </section>
    </div>
  );
}
