import {
  parseExpiry,
  planVoucherEdit,
  VoucherEditError,
  type EditableVoucher,
} from './member-voucher-edit';

const NOW = new Date('2026-10-01T12:00:00+08:00');
const live = (over: Partial<EditableVoucher> = {}): EditableVoucher => ({
  status: 'ACTIVE',
  expiresAt: new Date('2026-10-31T23:59:59+08:00'),
  lockExpiresAt: null,
  ...over,
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as VoucherEditError).code;
  }
  return null;
};

describe('parseExpiry', () => {
  it('treats a plain day as the end of that day in Malaysia', () => {
    expect(parseExpiry('2026-10-31').toISOString()).toBe(
      '2026-10-31T15:59:59.000Z',
    );
  });
  it('rejects nonsense', () => {
    expect(code(() => parseExpiry('soon'))).toBe('VOUCHER_EXPIRY_INVALID');
  });
});

describe('changing a voucher sent by mistake', () => {
  it('moves the expiry date', () => {
    const plan = planVoucherEdit(live(), { expiresAt: '2026-12-31' }, NOW);
    expect(plan.changed).toEqual(['expiry']);
    expect(plan.data.expiresAt?.toISOString()).toBe('2026-12-31T15:59:59.000Z');
    expect(plan.data.status).toBeUndefined();
  });

  it('can make it never expire', () => {
    const plan = planVoucherEdit(live(), { expiresAt: null }, NOW);
    expect(plan.data.expiresAt).toBeNull();
  });

  it('renames it, trimmed', () => {
    expect(
      planVoucherEdit(live(), { name: '  RM5 off  ' }, NOW).data.name,
    ).toBe('RM5 off');
    expect(code(() => planVoucherEdit(live(), { name: '   ' }, NOW))).toBe(
      'VOUCHER_NAME_INVALID',
    );
  });

  it('will not set an expiry that has already passed — withdrawing is for that', () => {
    expect(
      code(() => planVoucherEdit(live(), { expiresAt: '2026-09-01' }, NOW)),
    ).toBe('VOUCHER_EXPIRY_PAST');
  });

  it('refuses a voucher that was already used', () => {
    expect(
      code(() =>
        planVoucherEdit(
          live({ status: 'USED' }),
          { expiresAt: '2026-12-31' },
          NOW,
        ),
      ),
    ).toBe('VOUCHER_ALREADY_USED');
  });

  it('refuses while the member is mid-checkout, but not once that lock has lapsed', () => {
    const inCheckout = live({
      status: 'LOCKED',
      lockExpiresAt: new Date('2026-10-01T12:05:00+08:00'),
    });
    expect(
      code(() => planVoucherEdit(inCheckout, { expiresAt: '2026-12-31' }, NOW)),
    ).toBe('VOUCHER_IN_CHECKOUT');
    const lapsed = live({
      status: 'LOCKED',
      lockExpiresAt: new Date('2026-10-01T11:00:00+08:00'),
    });
    expect(
      planVoucherEdit(lapsed, { expiresAt: '2026-12-31' }, NOW).changed,
    ).toContain('expiry');
  });

  it('says so when there is nothing to change', () => {
    expect(code(() => planVoucherEdit(live(), {}, NOW))).toBe(
      'VOUCHER_NOTHING_TO_CHANGE',
    );
  });
});

describe('bringing a voucher back', () => {
  const withdrawn = live({ status: 'VOID' });

  it('restores a withdrawn voucher to the wallet', () => {
    const plan = planVoucherEdit(withdrawn, { reinstate: true }, NOW);
    expect(plan.data).toMatchObject({
      status: 'ACTIVE',
      visibleInWallet: true,
      lockToken: null,
    });
    expect(plan.changed).toContain('restored');
  });

  it('needs a new date when its own has passed', () => {
    const old = live({
      status: 'VOID',
      expiresAt: new Date('2026-09-01T00:00:00Z'),
    });
    expect(code(() => planVoucherEdit(old, { reinstate: true }, NOW))).toBe(
      'VOUCHER_EXPIRY_PAST',
    );
    const plan = planVoucherEdit(
      old,
      { reinstate: true, expiresAt: '2026-12-31' },
      NOW,
    );
    expect(plan.data.status).toBe('ACTIVE');
  });

  it('a new future date on an expired voucher revives it', () => {
    const expired = live({
      status: 'EXPIRED',
      expiresAt: new Date('2026-09-01T00:00:00Z'),
    });
    const plan = planVoucherEdit(expired, { expiresAt: '2026-12-31' }, NOW);
    expect(plan.data.status).toBe('ACTIVE');
    expect(plan.changed).toEqual(['expiry', 'restored']);
  });

  it('a new date on a voucher whose status is still active but whose date passed revives it too', () => {
    const lapsed = live({ expiresAt: new Date('2026-09-01T00:00:00Z') });
    const plan = planVoucherEdit(lapsed, { expiresAt: '2026-12-31' }, NOW);
    expect(plan.changed).toContain('restored');
  });
});
