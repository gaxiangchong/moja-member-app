import { useState } from 'react';

import type { SavedAddress, SavedAddressInput } from '../api';
import { addressFormError, MY_STATES } from './addressRules';

const LABELS = ['Home', 'Office', 'Other'];

/** Add or edit one saved address. Used in Account and at checkout. */
export function AddressForm({
  initial,
  defaultName = '',
  defaultPhone = '',
  askDefault = true,
  saveLabel = 'Save address',
  onSave,
  onCancel,
}: {
  initial?: SavedAddress | null;
  /** Prefill for a brand-new address. */
  defaultName?: string;
  defaultPhone?: string;
  /** Offer "Set as default address" (hidden for the very first address, which is always the default). */
  askDefault?: boolean;
  saveLabel?: string;
  onSave: (value: SavedAddressInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<SavedAddressInput>({
    label: initial?.label ?? '',
    recipientName: initial?.recipientName ?? defaultName,
    phone: initial?.phone ?? defaultPhone,
    line1: initial?.line1 ?? '',
    city: initial?.city ?? '',
    state: initial?.state ?? '',
    postcode: initial?.postcode ?? '',
    isDefault: initial?.isDefault ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<SavedAddressInput>) => {
    setV((cur) => ({ ...cur, ...patch }));
    setError(null);
  };

  const submit = async () => {
    const problem = addressFormError(v);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...v, postcode: v.postcode.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the address.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="addressForm">
      <div className="shopFieldGrid">
        <label htmlFor="addrName">Recipient name</label>
        <input
          id="addrName"
          type="text"
          maxLength={120}
          autoComplete="name"
          value={v.recipientName}
          onChange={(e) => set({ recipientName: e.target.value })}
        />
        <label htmlFor="addrPhone">Phone</label>
        <input
          id="addrPhone"
          type="tel"
          maxLength={32}
          autoComplete="tel"
          placeholder="e.g. 012-345 6789"
          value={v.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
        <label htmlFor="addrLine1">Address</label>
        <textarea
          id="addrLine1"
          rows={2}
          maxLength={300}
          placeholder="Unit / house no., street, area"
          value={v.line1}
          onChange={(e) => set({ line1: e.target.value })}
        />
        <label htmlFor="addrPostcode">Postcode</label>
        <input
          id="addrPostcode"
          type="text"
          inputMode="numeric"
          maxLength={5}
          autoComplete="postal-code"
          value={v.postcode}
          onChange={(e) => set({ postcode: e.target.value.replace(/\D/g, '') })}
        />
        <label htmlFor="addrCity">City</label>
        <input
          id="addrCity"
          type="text"
          maxLength={80}
          autoComplete="address-level2"
          value={v.city}
          onChange={(e) => set({ city: e.target.value })}
        />
        <label htmlFor="addrState">State</label>
        <select id="addrState" value={v.state} onChange={(e) => set({ state: e.target.value })}>
          <option value="">Select state</option>
          {MY_STATES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>
      <div className="addressLabelRow">
        <span className="caption">Label</span>
        {LABELS.map((l) => (
          <button
            key={l}
            type="button"
            className={v.label === l ? 'chip active' : 'chip'}
            onClick={() => set({ label: v.label === l ? '' : l })}
          >
            {l}
          </button>
        ))}
      </div>
      {askDefault ? (
        <label className="addressDefaultRow">
          <input
            type="checkbox"
            checked={v.isDefault === true}
            onChange={(e) => set({ isDefault: e.target.checked })}
          />
          <span>Set as default address</span>
        </label>
      ) : null}
      {error ? (
        <div className="shopErrorBox" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <div className="row">
        {onCancel ? (
          <button type="button" className="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        ) : null}
        <button type="button" onClick={() => void submit()} disabled={saving}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
