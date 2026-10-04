import { useCallback, useEffect, useState } from 'react';

import {
  addMyAddress,
  deleteMyAddress,
  fetchMyAddresses,
  setMyDefaultAddress,
  updateMyAddress,
  type SavedAddress,
} from '../api';
import { AddressForm } from './AddressForm';

/**
 * "My addresses" on the Account page: add, edit, delete and pick a default.
 * Checkout lets the member choose from these, or add one on the spot.
 */
export function AddressBookCard({
  memberName,
  memberPhone,
}: {
  memberName?: string | null;
  memberPhone?: string | null;
}) {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 'new', an address id being edited, or null. */
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const load = useCallback(() => {
    fetchMyAddresses()
      .then((rows) => {
        setAddresses(rows);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your addresses.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <section className="pmCard addressBook">
      <div className="addressBookHead">
        <h3 className="shopSectionTitle" style={{ margin: 0 }}>
          My addresses
        </h3>
        {editing == null && addresses ? (
          <button type="button" className="textAction" onClick={() => setEditing('new')}>
            + Add address
          </button>
        ) : null}
      </div>
      <p className="caption" style={{ margin: '4px 0 10px' }}>
        Saved here, you can pick one at checkout for delivery or shipping.
      </p>
      {error ? <p className="pickupAvailShort">{error}</p> : null}
      {addresses == null && !error ? <p className="caption">Loading…</p> : null}

      {addresses?.length === 0 && editing == null ? (
        <p className="caption">No saved addresses yet.</p>
      ) : null}

      {addresses?.map((a) =>
        editing === a.id ? (
          <AddressForm
            key={a.id}
            initial={a}
            onCancel={() => setEditing(null)}
            onSave={(v) => run(() => updateMyAddress(a.id, v))}
          />
        ) : (
          <div key={a.id} className="addressCard">
            <div className="addressCardTop">
              <strong>{a.recipientName}</strong>
              <span className="caption">{a.phone}</span>
              {a.label ? <span className="addressTag">{a.label}</span> : null}
              {a.isDefault ? <span className="addressTag addressTagDefault">Default</span> : null}
            </div>
            <p className="caption" style={{ margin: '4px 0 8px' }}>
              {a.fullAddress}
            </p>
            <div className="addressActions">
              <button type="button" className="textAction" onClick={() => setEditing(a.id)}>
                Edit
              </button>
              {!a.isDefault ? (
                <button type="button" className="textAction" onClick={() => void run(() => setMyDefaultAddress(a.id))}>
                  Set as default
                </button>
              ) : null}
              <button
                type="button"
                className="textAction shopRemoveLine"
                onClick={() => {
                  if (window.confirm('Delete this address?')) void run(() => deleteMyAddress(a.id));
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ),
      )}

      {editing === 'new' ? (
        <AddressForm
          defaultName={memberName ?? ''}
          defaultPhone={memberPhone ?? ''}
          askDefault={(addresses?.length ?? 0) > 0}
          onCancel={() => setEditing(null)}
          onSave={(v) => run(() => addMyAddress(v))}
        />
      ) : null}
    </section>
  );
}
