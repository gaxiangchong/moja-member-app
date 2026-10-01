import { useEffect, useState } from 'react';
import { fetchDeliverySettings, updateDeliverySettings } from '../api';

/**
 * Delivery at checkout. Members who choose Delivery either book their own
 * courier or ask Moja Maison to arrange one over WhatsApp — this is where the
 * shop's WhatsApp number lives, and where delivery can be switched off.
 */
export function DeliverySettings() {
  const [enabled, setEnabled] = useState(true);
  const [whatsapp, setWhatsapp] = useState('');
  /** The number as the server stored it (digits with country code) — what members' button really opens. */
  const [savedNumber, setSavedNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDeliverySettings()
      .then((s) => {
        if (!alive) return;
        setEnabled(s.enabled);
        setWhatsapp(s.whatsappNumber);
        setSavedNumber(s.whatsappNumber);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load delivery settings');
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
      const saved = await updateDeliverySettings({ enabled, whatsappNumber: whatsapp });
      setEnabled(saved.enabled);
      setWhatsapp(saved.whatsappNumber);
      setSavedNumber(saved.whatsappNumber);
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
          <h2 className="panelTitle">Delivery</h2>
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
          At checkout members choose <strong>Self pickup</strong> or <strong>Delivery</strong>. For delivery they
          enter the address, a contact name and phone, and the day and time the courier collects from your shop. They
          then either book their own courier, or ask you to arrange one on WhatsApp. The app does not charge for
          delivery: members are told the delivery charge has to be paid before delivery can be arranged.
        </p>

        <label className="switchRow" style={{ marginBottom: 16 }}>
          <span className="switch">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setSavedAt(null);
              }}
            />
            <span className="switchTrack" aria-hidden />
          </span>
          <span>Members can choose Delivery at checkout</span>
        </label>

        <div className="panelGrid panelGrid--2">
          <label>
            Moja Maison WhatsApp number
            <input
              className="toolbarInput"
              inputMode="tel"
              placeholder="e.g. 012-345 6789"
              value={whatsapp}
              onChange={(e) => {
                setWhatsapp(e.target.value);
                setSavedAt(null);
              }}
            />
          </label>
        </div>
        {!whatsapp.trim() ? (
          <p className="dataTableMuted" style={{ background: '#fffbeb', padding: '10px 12px', borderRadius: 8 }}>
            <strong>No number set.</strong> Members who ask Moja Maison to arrange delivery will not see a WhatsApp
            button — they are only told you will call the phone number they gave. Add the number you use for
            customers.
          </p>
        ) : (
          <p className="dataTableMuted">
            When a member chooses <em>Moja Maison helps me choose a delivery partner</em>, a green{' '}
            <strong>Chat with Moja Maison on WhatsApp</strong> button opens a chat to this number with the order,
            address and contact already typed in. A number starting with 0 is treated as Malaysian (+60).
            {savedNumber ? (
              <>
                {' '}
                <a
                  href={`https://wa.me/${savedNumber}?text=${encodeURIComponent('Test message from the Moja Maison admin — delivery help button.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open a test chat with +{savedNumber}
                </a>
              </>
            ) : (
              ' Save to get a link to test it.'
            )}
          </p>
        )}
        {saveError ? <p className="viewError">{saveError}</p> : null}
        {savedAt ? <p className="dataTableMuted">Saved. Members see the change the next time they open checkout.</p> : null}
      </section>
    </div>
  );
}
