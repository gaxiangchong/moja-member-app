/**
 * Rules for an admin correcting a voucher that was sent to a member by mistake.
 * Pure — the service loads the voucher and applies the result.
 */

export type EditableVoucher = {
  status: string;
  expiresAt: Date | null;
  lockExpiresAt: Date | null;
};

export type VoucherEditInput = {
  /** `undefined` = leave alone, `null` = never expires, else a date or a yyyy-mm-dd day. */
  expiresAt?: string | null;
  /** The name the member sees in their wallet. */
  name?: string;
  /** Bring a withdrawn (or expired) voucher back for the member. */
  reinstate?: boolean;
};

export type VoucherEditPlan = {
  data: {
    expiresAt?: Date | null;
    name?: string;
    status?: 'ACTIVE';
    visibleInWallet?: true;
    lockToken?: null;
    lockedAt?: null;
    lockExpiresAt?: null;
  };
  changed: string[];
};

export class VoucherEditError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'VoucherEditError';
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A plain day means "until the end of that day" in Malaysia (UTC+8, no DST),
 * so a voucher dated the 31st works all through the 31st.
 */
export function parseExpiry(value: string): Date {
  const v = value.trim();
  const date = DAY.test(v) ? new Date(`${v}T23:59:59+08:00`) : new Date(v);
  if (Number.isNaN(date.getTime())) {
    throw new VoucherEditError(
      'VOUCHER_EXPIRY_INVALID',
      'That date is not valid.',
    );
  }
  return date;
}

export function planVoucherEdit(
  voucher: EditableVoucher,
  input: VoucherEditInput,
  now = new Date(),
): VoucherEditPlan {
  if (voucher.status === 'USED') {
    throw new VoucherEditError(
      'VOUCHER_ALREADY_USED',
      'This voucher has already been used, so it cannot be changed.',
    );
  }
  if (
    voucher.status === 'LOCKED' &&
    voucher.lockExpiresAt &&
    voucher.lockExpiresAt.getTime() > now.getTime()
  ) {
    throw new VoucherEditError(
      'VOUCHER_IN_CHECKOUT',
      'The member is checking out with this voucher right now. Try again in a few minutes.',
    );
  }

  const data: VoucherEditPlan['data'] = {};
  const changed: string[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 120) {
      throw new VoucherEditError(
        'VOUCHER_NAME_INVALID',
        'The name must be between 1 and 120 characters.',
      );
    }
    data.name = name;
    changed.push('name');
  }

  let nextExpiry = voucher.expiresAt;
  if (input.expiresAt !== undefined) {
    if (input.expiresAt === null || input.expiresAt.trim() === '') {
      nextExpiry = null;
    } else {
      nextExpiry = parseExpiry(input.expiresAt);
      if (nextExpiry.getTime() <= now.getTime()) {
        throw new VoucherEditError(
          'VOUCHER_EXPIRY_PAST',
          'Choose a date in the future. To end a voucher now, withdraw it instead.',
        );
      }
    }
    data.expiresAt = nextExpiry;
    changed.push('expiry');
  }

  const expiredNow =
    voucher.status === 'EXPIRED' ||
    (voucher.expiresAt !== null &&
      voucher.expiresAt.getTime() <= now.getTime());
  const comesBack =
    input.reinstate === true ||
    // Giving an expired voucher a new future date is clearly meant to revive it.
    (expiredNow &&
      input.expiresAt !== undefined &&
      nextExpiry !== voucher.expiresAt);

  if (comesBack && voucher.status !== 'ACTIVE') {
    if (
      voucher.status !== 'VOID' &&
      voucher.status !== 'EXPIRED' &&
      voucher.status !== 'LOCKED'
    ) {
      throw new VoucherEditError(
        'VOUCHER_NOT_RESTORABLE',
        'This voucher cannot be restored.',
      );
    }
    if (nextExpiry !== null && nextExpiry.getTime() <= now.getTime()) {
      throw new VoucherEditError(
        'VOUCHER_EXPIRY_PAST',
        'Its expiry date has passed. Choose a new expiry date to bring it back.',
      );
    }
    data.status = 'ACTIVE';
    data.visibleInWallet = true;
    data.lockToken = null;
    data.lockedAt = null;
    data.lockExpiresAt = null;
    changed.push('restored');
  } else if (
    expiredNow &&
    voucher.status === 'ACTIVE' &&
    input.expiresAt !== undefined &&
    (nextExpiry === null || nextExpiry.getTime() > now.getTime())
  ) {
    // Status was still ACTIVE with a past date: the new date alone makes it live again.
    changed.push('restored');
  }

  if (changed.length === 0) {
    throw new VoucherEditError(
      'VOUCHER_NOTHING_TO_CHANGE',
      'There is nothing to change.',
    );
  }
  return { data, changed };
}
