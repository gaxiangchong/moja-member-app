import { useCallback, useEffect, useState } from 'react';

import {
  addMyAddress,
  addressInLocalArea,
  fetchMyAddresses,
  updateMyAddress,
  type SavedAddress,
} from '../api';
import { AddressForm } from './AddressForm';

/**
 * Checkout's "Deliver to" section, Lazada / Shopee style: pick one of the
 * addresses saved in Account, or add a different one on the spot.
 */
export function AddressPicker({
  selectedId,
  mode,
  localPostcodes,
  memberName,
  memberPhone,
  onSelect,
}: {
  selectedId: string | null;
  /** Local delivery only reaches the nearby area; shipping reaches anywhere. */
  mode: 'delivery' | 'shipping';
  localPostcodes: string[];
  memberName?: string | null;
  memberPhone?: string | null;
  /** The chosen address, or null when none is left to choose. */
  onSelect: (address: SavedAddress | null) => void;
}) {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const outside = useCallback(
    (a: SavedAddress) =>
      mode === 'delivery' && !addressInLocalArea(a.fullAddress, localPostcodes),
    [mode, localPostcodes],
  );

  // Load the address book, then keep the chosen address valid for this mode.
  useEffect(() => {
    let alive = true;
    fetchMyAddresses()
      .then((rows) => {
        if (alive) setAddresses(rows);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load your addresses.');
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!addresses) return;
    const current = addresses.find((a) => a.id === selectedId);
    if (current && !outside(current)) {
      // The address text may have been edited elsewhere; keep the order in step.
      onSelect(current);
      return;
    }
    const usable = addresses.find((a) => a.isDefault && !outside(a)) ?? addresses.find((a) => !outside(a));
    onSelect(usable ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-pick only when the list or mode changes
  }, [addresses, mode, localPostcodes]);

  const save = async (id: string | null, v: Parameters<typeof addMyAddress>[0]) => {
    const saved = id ? await updateMyAddress(id, v) : await addMyAddress(v);
    const rows = await fetchMyAddresses();
    setAddresses(rows);
    setEditing(null);
    if (!outside(saved)) onSelect(saved);
  };

  return (
    <div className="addressPicker">
      <div className="addressBookHead">
        <strong>{mode === 'shipping' ? 'Ship to' : 'Deliver to'}</strong>
        {editing == null && addresses ? (
          <button type="button" className="textAction" onClick={() => setEditing('new')}>
            + Add a new address
          </button>
        ) : null}
      </div>
      {error ? <p className="pickupAvailShort">{error}</p> : null}
      {addresses == null && !error ? <p className="caption">Loading your addresses…</p> : null}

      {addresses?.map((a) =>
        editing === a.id ? (
          <AddressForm
            key={a.id}
            initial={a}
            onCancel={() => setEditing(null)}
            onSave={(v) => save(a.id, v)}
          />
        ) : (
          <label
            key={a.id}
            className={`addressCard addressCardPick${selectedId === a.id ? ' addressCardSelected' : ''}${
              outside(a) ? ' addressCardDisabled' : ''
            }`}
          >
            <input
              type="radio"
              name="checkoutAddress"
              checked={selectedId === a.id}
              disabled={outside(a)}
              onChange={() => onSelect(a)}
            />
            <span className="addressCardBody">
              <span className="addressCardTop">
                <strong>{a.recipientName}</strong>
                <span className="caption">{a.phone}</span>
                {a.label ? <span className="addressTag">{a.label}</span> : null}
                {a.isDefault ? <span className="addressTag addressTagDefault">Default</span> : null}
              </span>
              <span className="caption">{a.fullAddress}</span>
              {outside(a) ? (
                <span className="pickupAvailShort">
                  Outside our local delivery area (postcodes starting {localPostcodes.join(', ')}).
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="textAction"
              onClick={(e) => {
                e.preventDefault();
                setEditing(a.id);
              }}
            >
              Edit
            </button>
          </label>
        ),
      )}

      {addresses?.length === 0 && editing == null ? (
        <p className="caption">
          You have no saved address yet. Add one to continue — it&apos;s saved to your account for next time.
        </p>
      ) : null}

      {editing === 'new' || (addresses?.length === 0 && editing == null) ? (
        <AddressForm
          defaultName={memberName ?? ''}
          defaultPhone={memberPhone ?? ''}
          askDefault={(addresses?.length ?? 0) > 0}
          saveLabel="Save and use this address"
          onCancel={addresses && addresses.length > 0 ? () => setEditing(null) : undefined}
          onSave={(v) => save(null, v)}
        />
      ) : null}
    </div>
  );
}
