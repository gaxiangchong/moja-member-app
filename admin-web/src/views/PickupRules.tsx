import { useEffect, useState } from 'react';
import {
  fetchPickupRules,
  updatePickupRules,
  type PickupRules,
  type PickupSlotRule,
} from '../api';

const WEEKDAYS = [
  { day: 0, label: 'Sun' },
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
];

type SlotForm = {
  start: string;
  label: string;
  weekdays: number[];
  leadMinutes: string;
  cutoffTime: string;
  capacity: string;
};

function slotToForm(slot: PickupSlotRule): SlotForm {
  return {
    start: slot.start,
    label: slot.label,
    weekdays: [...slot.weekdays],
    leadMinutes: String(slot.leadMinutes),
    cutoffTime: slot.cutoffTime ?? '',
    capacity: slot.capacity == null ? '' : String(slot.capacity),
  };
}

function emptySlot(): SlotForm {
  return {
    start: '12:00',
    label: '',
    weekdays: [1, 2, 3, 4, 5, 6],
    leadMinutes: '120',
    cutoffTime: '',
    capacity: '',
  };
}

export function PickupRules() {
  const [slots, setSlots] = useState<SlotForm[]>([]);
  const [openTime, setOpenTime] = useState('10:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [timeZone, setTimeZone] = useState('Asia/Kuala_Lumpur');
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>([]);
  const [closedDates, setClosedDates] = useState('');
  const [maxAdvanceDays, setMaxAdvanceDays] = useState('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPickupRules()
      .then((rules) => {
        if (!alive) return;
        applyRules(rules);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Failed to load pickup rules');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function applyRules(rules: PickupRules) {
    setOpenTime(rules.openTime);
    setCloseTime(rules.closeTime);
    setTimeZone(rules.timeZone);
    setClosedWeekdays([...rules.closedWeekdays]);
    setClosedDates(rules.closedDates.join('\n'));
    setMaxAdvanceDays(String(rules.maxAdvanceDays));
    setSlots(rules.slots.map(slotToForm));
  }

  function toggleDay(list: number[], day: number, on: boolean): number[] {
    const next = new Set(list);
    if (on) next.add(day);
    else next.delete(day);
    return [...next].sort((a, b) => a - b);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updatePickupRules({
        timeZone: timeZone.trim(),
        openTime,
        closeTime,
        closedWeekdays,
        closedDates: closedDates
          .split(/[\s,]+/)
          .map((date) => date.trim())
          .filter(Boolean),
        maxAdvanceDays: Number(maxAdvanceDays),
        slots: slots.map((slot) => ({
          start: slot.start,
          label: slot.label.trim(),
          weekdays: slot.weekdays,
          leadMinutes: Number(slot.leadMinutes),
          cutoffTime: slot.cutoffTime.trim() || null,
          capacity: slot.capacity.trim() === '' ? null : Number(slot.capacity),
        })),
      });
      applyRules(saved);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save pickup rules');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="dataTableMuted">Loading pickup rules…</p>;
  }
  if (error) {
    return <p className="dataTableMuted">{error}</p>;
  }

  return (
    <div className="panelGrid">
      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Store hours</h2>
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
          In-store orders are only accepted while the store is open. Pickup slots must start inside these hours.
          The default lead time is 2 hours before the slot.
        </p>
        {saveError ? <p className="dataTableMuted">{saveError}</p> : null}
        {savedAt ? <p className="dataTableMuted">Saved.</p> : null}
        <div className="panelGrid panelGrid--2">
          <label>
            Opens
            <input className="toolbarInput" type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          </label>
          <label>
            Closes
            <input className="toolbarInput" type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
          </label>
          <label>
            Days ahead
            <input
              className="toolbarInput"
              type="number"
              min={1}
              max={90}
              value={maxAdvanceDays}
              onChange={(e) => setMaxAdvanceDays(e.target.value)}
            />
          </label>
          <label>
            Time zone
            <input className="toolbarInput" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
          </label>
        </div>
        <p className="dataTableMuted">Closed every week on</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {WEEKDAYS.map((day) => (
            <label key={day.day}>
              <input
                type="checkbox"
                checked={closedWeekdays.includes(day.day)}
                onChange={(e) =>
                  setClosedWeekdays(toggleDay(closedWeekdays, day.day, e.target.checked))
                }
              />{' '}
              {day.label}
            </label>
          ))}
        </div>
        <label style={{ display: 'block', marginTop: 12 }}>
          Extra closed dates (one yyyy-mm-dd per line)
          <textarea
            className="toolbarInput"
            style={{ display: 'block', width: '100%', minHeight: 72, maxWidth: 'none' }}
            value={closedDates}
            onChange={(e) => setClosedDates(e.target.value)}
          />
        </label>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2 className="panelTitle">Pickup slots</h2>
          <button
            type="button"
            className="toolbarButton"
            onClick={() => setSlots((current) => [...current, emptySlot()])}
          >
            Add slot
          </button>
        </div>
        <table className="dataTable">
          <thead>
            <tr>
              <th>Start</th>
              <th>Label</th>
              <th>Days</th>
              <th>Lead (min)</th>
              <th>Cut-off</th>
              <th>Capacity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, index) => (
              <tr key={`${slot.start}-${index}`}>
                <td>
                  <input
                    className="toolbarInput"
                    type="time"
                    value={slot.start}
                    onChange={(e) => updateSlot(index, { start: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="toolbarInput"
                    value={slot.label}
                    onChange={(e) => updateSlot(index, { label: e.target.value })}
                  />
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 180 }}>
                    {WEEKDAYS.map((day) => (
                      <label key={day.day}>
                        <input
                          type="checkbox"
                          checked={slot.weekdays.includes(day.day)}
                          onChange={(e) =>
                            updateSlot(index, {
                              weekdays: toggleDay(slot.weekdays, day.day, e.target.checked),
                            })
                          }
                        />{' '}
                        {day.label}
                      </label>
                    ))}
                  </div>
                </td>
                <td>
                  <input
                    className="toolbarInput"
                    type="number"
                    min={0}
                    max={1440}
                    value={slot.leadMinutes}
                    onChange={(e) => updateSlot(index, { leadMinutes: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="toolbarInput"
                    type="time"
                    value={slot.cutoffTime}
                    onChange={(e) => updateSlot(index, { cutoffTime: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="toolbarInput"
                    type="number"
                    min={1}
                    max={500}
                    placeholder="No cap"
                    value={slot.capacity}
                    onChange={(e) => updateSlot(index, { capacity: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="toolbarButton"
                    onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );

  function updateSlot(index: number, patch: Partial<SlotForm>) {
    setSlots((current) =>
      current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  }
}
