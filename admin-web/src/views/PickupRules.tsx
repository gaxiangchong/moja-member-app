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
  endTime: string;
  label: string;
  weekdays: number[];
  leadMinutes: string;
  cutoffTime: string;
  capacity: string;
};

function slotToForm(slot: PickupSlotRule): SlotForm {
  return {
    start: slot.start,
    endTime: slot.endTime ?? '',
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
    endTime: '',
    label: '',
    weekdays: [1, 2, 3, 4, 5, 6],
    leadMinutes: '120',
    cutoffTime: '',
    capacity: '',
  };
}

type DayHours = { open: boolean; from: string; to: string };

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 14:00 -> "2pm", 12:30 -> "12:30pm". */
function clock12(t: string): string {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === '00' ? `${h12}${suffix}` : `${h12}:${m}${suffix}`;
}

/** Does this slot sit inside that day's hours? Mirrors what the server offers. */
function fits(slot: { start: string; endTime: string }, day: DayHours): boolean {
  if (!day.open) return false;
  const start = mins(slot.start);
  if (start < mins(day.from) || start >= mins(day.to)) return false;
  return !slot.endTime || mins(slot.endTime) <= mins(day.to);
}

export function PickupRules() {
  const [slots, setSlots] = useState<SlotForm[]>([]);
  const [dayHours, setDayHours] = useState<Record<number, DayHours>>({});
  const [slotLength, setSlotLength] = useState('120');
  const [timeZone, setTimeZone] = useState('Asia/Kuala_Lumpur');
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
    const hours: Record<number, DayHours> = {};
    for (const d of WEEKDAYS) {
      const own = rules.weekdayHours?.[String(d.day)];
      hours[d.day] = {
        open: !rules.closedWeekdays.includes(d.day),
        from: own?.open ?? rules.openTime,
        to: own?.close ?? rules.closeTime,
      };
    }
    setDayHours(hours);
    setTimeZone(rules.timeZone);
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

  function setDay(day: number, patch: Partial<DayHours>) {
    setDayHours((cur) => ({ ...cur, [day]: { ...cur[day], ...patch } }));
    setSavedAt(null);
  }

  /** Copies one day's hours onto every other day. */
  function copyToAll(from: number) {
    setDayHours((cur) =>
      Object.fromEntries(WEEKDAYS.map((d) => [d.day, { ...cur[from] }])) as Record<number, DayHours>,
    );
    setSavedAt(null);
  }

  /**
   * Rebuilds the pickup slots from the opening hours: back-to-back windows of the
   * chosen length from opening time, on every open day. Days with the same
   * window share one slot. Lead time is kept from the first current slot.
   */
  function rebuildSlots() {
    const len = Number(slotLength);
    if (!Number.isInteger(len) || len < 30 || len > 480) {
      setSaveError('Slot length must be between 30 and 480 minutes.');
      return;
    }
    const groups = new Map<string, SlotForm>();
    for (const d of WEEKDAYS) {
      const h = dayHours[d.day];
      if (!h?.open || mins(h.to) <= mins(h.from)) continue;
      for (let start = mins(h.from); start + len <= mins(h.to); start += len) {
        const key = `${start}-${start + len}`;
        const g = groups.get(key);
        if (g) g.weekdays = [...g.weekdays, d.day];
        else
          groups.set(key, {
            start: hhmm(start),
            endTime: hhmm(start + len),
            label: `${clock12(hhmm(start))} – ${clock12(hhmm(start + len))}`,
            weekdays: [d.day],
            leadMinutes: slots[0]?.leadMinutes ?? '120',
            cutoffTime: '',
            capacity: '',
          });
      }
    }
    const next = [...groups.values()].sort((a, b) => mins(a.start) - mins(b.start));
    if (next.length === 0) {
      setSaveError('No slot fits inside those opening hours.');
      return;
    }
    if (next.length > 12) {
      setSaveError(`That makes ${next.length} slots (the most allowed is 12). Use a longer slot length.`);
      return;
    }
    if (!window.confirm(`Replace your ${slots.length} pickup slot(s) with ${next.length} new ones built from the opening hours? Lead times are kept; cut-offs and capacity limits are cleared.`)) return;
    setSaveError(null);
    setSlots(next);
    setSavedAt(null);
  }

  async function save() {
    const openDays = WEEKDAYS.filter((d) => dayHours[d.day]?.open);
    for (const d of openDays) {
      if (mins(dayHours[d.day].to) <= mins(dayHours[d.day].from)) {
        setSaveError(`${d.label}: closing time must be after opening time.`);
        return;
      }
    }
    const closedWeekdays = WEEKDAYS.filter((d) => !dayHours[d.day]?.open).map((d) => d.day);
    const weekdayHours = Object.fromEntries(
      openDays.map((d) => [String(d.day), { open: dayHours[d.day].from, close: dayHours[d.day].to }]),
    );
    const defaultOpen = openDays.length ? openDays.map((d) => dayHours[d.day].from).sort()[0] : '10:00';
    const defaultClose = openDays.length ? openDays.map((d) => dayHours[d.day].to).sort().at(-1)! : '18:00';
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updatePickupRules({
        timeZone: timeZone.trim(),
        // The single open/close pair is the fallback; each day's own hours win.
        openTime: defaultOpen,
        closeTime: defaultClose,
        weekdayHours,
        closedWeekdays,
        closedDates: closedDates
          .split(/[\s,]+/)
          .map((date) => date.trim())
          .filter(Boolean),
        maxAdvanceDays: Number(maxAdvanceDays),
        slots: slots.map((slot) => ({
          start: slot.start,
          endTime: slot.endTime.trim() || null,
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
          Opening hours decide which pickup times customers can choose. A slot is only offered on a day when it fits
          inside that day's hours. The default lead time is 2 hours before the slot.
        </p>
        {saveError ? <p className="dataTableMuted">{saveError}</p> : null}
        {savedAt ? <p className="dataTableMuted">Saved.</p> : null}
        <div className="panelGrid panelGrid--2">
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

        <h3 className="drawerSectionTitle" style={{ marginTop: 16 }}>Opening hours</h3>
        <p className="dataTableMuted" style={{ marginTop: 0 }}>
          Set when you are open each day. Customers can only pick a pickup time that sits inside that day's
          hours, so shortening or extending a day changes the times they see straight away. Untick a day to close it.
        </p>
        <table className="dataTable">
          <thead>
            <tr>
              <th>Day</th>
              <th>Open</th>
              <th>From</th>
              <th>To</th>
              <th>Pickup times customers get</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((d) => {
              const h = dayHours[d.day];
              if (!h) return null;
              const offered = slots.filter((sl) => sl.weekdays.includes(d.day) && fits(sl, h));
              return (
                <tr key={d.day}>
                  <td><strong>{d.label}</strong></td>
                  <td>
                    <input type="checkbox" checked={h.open} onChange={(e) => setDay(d.day, { open: e.target.checked })} aria-label={`${d.label} open`} />
                  </td>
                  <td>
                    <input className="toolbarInput" type="time" value={h.from} disabled={!h.open} onChange={(e) => setDay(d.day, { from: e.target.value })} />
                  </td>
                  <td>
                    <input className="toolbarInput" type="time" value={h.to} disabled={!h.open} onChange={(e) => setDay(d.day, { to: e.target.value })} />
                  </td>
                  <td className="dataTableMuted">
                    {!h.open ? 'Closed' : offered.length ? offered.map((sl) => sl.label || sl.start).join(' · ') : 'No pickup times fit these hours'}
                  </td>
                  <td>
                    <button type="button" className="toolbarButton" onClick={() => copyToAll(d.day)} title="Use these hours on every day">
                      Copy to all
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
        <div className="drawerRowActions" style={{ marginBottom: 12 }}>
          <label className="filterField" style={{ maxWidth: 220 }}>
            Slot length (minutes)
            <input className="toolbarInput" type="number" min={30} max={480} step={15} value={slotLength} onChange={(e) => setSlotLength(e.target.value)} />
          </label>
          <button type="button" className="toolbarButton" onClick={rebuildSlots}>
            Rebuild slots from opening hours
          </button>
        </div>
        <p className="dataTableMuted" style={{ marginTop: 0 }}>
          <strong>Ends</strong> is when the collection window closes. A slot with a lead time of 0 stays open for
          orders until it ends — for example 7pm – 9pm can still be ordered at 8pm. Other slots close for orders
          once their lead time is up.
        </p>
        <table className="dataTable">
          <thead>
            <tr>
              <th>Start</th>
              <th>Ends</th>
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
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => updateSlot(index, { endTime: e.target.value })}
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
