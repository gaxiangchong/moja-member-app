import { PaymentsService } from './payments.service';

/** The member app only mentions a "test payment channel" when no real money moves. */
function service(opts: { demo?: boolean; key?: string }) {
  return new PaymentsService(
    {} as never,
    {
      get: jest
        .fn()
        .mockImplementation((k: string) =>
          k === 'XENDIT_SECRET_KEY' ? opts.key : undefined,
        ),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      getDemoModeOverride: jest.fn().mockReturnValue(opts.demo ?? false),
    } as never,
    {} as never,
  );
}

describe('payments test mode', () => {
  it('is on in demo mode', () => {
    expect(service({ demo: true }).paymentsTestMode()).toBe(true);
  });

  it('is on with a Xendit test key', () => {
    expect(service({ key: 'xnd_development_abc123' }).paymentsTestMode()).toBe(
      true,
    );
  });

  it('is off with a live key — so a production release says nothing', () => {
    expect(service({ key: 'xnd_production_abc123' }).paymentsTestMode()).toBe(
      false,
    );
  });

  it('is off when nothing is configured', () => {
    expect(service({}).paymentsTestMode()).toBe(false);
  });
});
