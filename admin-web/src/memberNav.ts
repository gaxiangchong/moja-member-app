/** Fired to open a member's profile from anywhere (e.g. an order's "View member"). */
export const OPEN_MEMBER_EVENT = 'moja:open-member';

const PENDING_KEY = 'moja_admin_open_member';

/** Switches to All customers with this member's profile open. */
export function openMemberProfile(customerId: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, customerId);
  } catch {
    /* private mode: the event below still carries it */
  }
  window.dispatchEvent(new CustomEvent(OPEN_MEMBER_EVENT, { detail: customerId }));
}

/** The member a "View member" asked to open, read once by All customers. */
export function takePendingMember(): string | null {
  try {
    const id = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return id;
  } catch {
    return null;
  }
}

/** +60123456789 -> "012-345 6789"; other numbers are left as they are. */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+60(1\d)(\d{3,4})(\d{4})$/);
  if (!m) return e164;
  return `0${m[1]}-${m[2]} ${m[3]}`;
}
