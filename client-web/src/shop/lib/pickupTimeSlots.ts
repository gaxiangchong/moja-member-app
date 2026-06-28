/** Pickup windows — keep in sync with moja-sites checkout TIME_SLOTS. */
export type PickupTimeSlot = {
  value: string;
  label: string;
};

export const PICKUP_TIME_SLOTS: PickupTimeSlot[] = [
  { value: '11:00', label: '11am – 1pm (Mon – Sat)' },
  { value: '14:00', label: '2pm – 4pm (Mon – Sat)' },
  { value: '16:00', label: '4pm – 6pm (Mon – Sat)' },
  { value: '10:00', label: '10am – 12:30pm (Sun)' },
];

export function pickupTimeSlotLabel(value: string | null): string {
  if (!value) return '—';
  return PICKUP_TIME_SLOTS.find((s) => s.value === value)?.label ?? value;
}
