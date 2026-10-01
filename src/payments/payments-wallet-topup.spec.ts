import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { WalletTopUpSettings } from '../wallet/topup-settings';

const OFFER: WalletTopUpSettings = {
  enabled: true,
  minTopUpCents: 1_000,
  maxTopUpCents: 100_000,
  tiers: [
    { topUpCents: 5_000, bonusCents: 500 },
    { topUpCents: 10_000, bonusCents: 2_000 },
  ],
};

type Intent = {
  id: string;
  customerId: string;
  referenceId: string;
  purpose: string;
  status: string;
  amountCents: number;
  bonusCents: number;
  channelCode: string;
  xenditPaymentRequestId: string | null;
};

type StatusUpdate = { data: { status: string } };
type LedgerEntry = { type: string; amountCents: number; reason: string };

function setup(opts: {
  settings?: Partial<WalletTopUpSettings>;
  demo?: boolean;
  intent?: Partial<Intent>;
  failOnEntry?: number;
}) {
  const intent: Intent = {
    id: 'pi-1',
    customerId: 'member',
    referenceId: 'ref-1',
    purpose: 'wallet_topup',
    status: 'PENDING',
    amountCents: 10_000,
    bonusCents: 2_000,
    channelCode: 'DEMO',
    xenditPaymentRequestId: null,
    ...opts.intent,
  };
  const ledger: { type: string; amountCents: number; reason: string }[] = [];
  const tx = {
    paymentIntent: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    paymentIntent: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...intent })),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...intent })),
      // The PENDING → PROCESSING claim: only one caller can win it.
      updateMany: jest
        .fn()
        .mockImplementation(
          (args: StatusUpdate & { where: { status?: string } }) => {
            if (args.where.status && intent.status !== args.where.status) {
              return Promise.resolve({ count: 0 });
            }
            intent.status = args.data.status;
            return Promise.resolve({ count: 1 });
          },
        ),
      update: jest.fn().mockImplementation((args: StatusUpdate) => {
        intent.status = args.data.status;
        return Promise.resolve({});
      }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => unknown) => {
        const before = ledger.length;
        const statusBefore = intent.status;
        try {
          return await fn(tx);
        } catch (err) {
          // A real transaction rolls everything back.
          ledger.length = before;
          intent.status = statusBefore;
          throw err;
        }
      }),
  };
  tx.paymentIntent.update.mockImplementation((args: StatusUpdate) => {
    intent.status = args.data.status;
    return Promise.resolve({});
  });
  let entries = 0;
  const wallet = {
    appendTransactionWithin: jest
      .fn()
      .mockImplementation((_tx: unknown, entry: LedgerEntry) => {
        entries++;
        if (opts.failOnEntry === entries)
          return Promise.reject(new Error('ledger down'));
        ledger.push({
          type: entry.type,
          amountCents: entry.amountCents,
          reason: entry.reason,
        });
        return Promise.resolve({});
      }),
  };
  const service = new PaymentsService(
    prisma as never,
    { get: jest.fn().mockReturnValue(undefined) } as never, // config
    {} as never, // xendit
    wallet as never,
    {} as never, // customers
    {} as never, // loyalty
    {} as never, // rewardsWorkflow
    { sendWalletTopUpReceipt: jest.fn() } as never, // receiptEmail
    {} as never, // bentoVoucher
    {
      getDemoModeOverride: jest.fn().mockReturnValue(opts.demo ?? true),
    } as never,
    {
      getSettings: jest.fn().mockResolvedValue({ ...OFFER, ...opts.settings }),
    } as never,
  );
  return { service, prisma, ledger, intent };
}

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as BadRequestException).getResponse() as { code: string };
  }
  throw new Error('expected a rejection');
}

describe('starting a credit top-up', () => {
  it('is refused while top-ups are switched off', async () => {
    const { service, prisma } = setup({ settings: { enabled: false } });
    expect(
      (await rejection(service.createWalletTopUpSession('member', 10_000)))
        .code,
    ).toBe('WALLET_TOPUP_DISABLED');
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
  });

  it('is refused outside the allowed range', async () => {
    const { service } = setup({});
    expect(
      (await rejection(service.createWalletTopUpSession('member', 500))).code,
    ).toBe('WALLET_TOPUP_OUT_OF_RANGE');
    expect(
      (await rejection(service.createWalletTopUpSession('member', 200_000)))
        .code,
    ).toBe('WALLET_TOPUP_OUT_OF_RANGE');
  });

  it('fixes the bonus on the payment at the moment it starts', async () => {
    const { service, prisma } = setup({});
    const res = await service.createWalletTopUpSession('member', 10_000);
    expect(res).toMatchObject({
      demoMode: true,
      amountCents: 10_000,
      bonusCents: 2_000,
    });
    const data = (
      prisma.paymentIntent.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ]
    )[0].data;
    expect(data).toMatchObject({
      amountCents: 10_000,
      bonusCents: 2_000,
      purpose: 'wallet_topup',
    });
  });

  it('gives no bonus below the first tier', async () => {
    const { service } = setup({});
    expect(
      await service.createWalletTopUpSession('member', 3_000),
    ).toMatchObject({
      bonusCents: 0,
    });
  });
});

describe('crediting a paid top-up', () => {
  it('credits the top-up and its bonus together', async () => {
    const { service, ledger, intent } = setup({});
    const res = await service.completeDemoWalletTopUp('member', 'ref-1');
    expect(ledger).toEqual([
      { type: 'TOPUP', amountCents: 10_000, reason: 'xendit_wallet_topup' },
      {
        type: 'PROMOTIONAL_BONUS',
        amountCents: 2_000,
        reason: 'wallet_topup_bonus',
      },
    ]);
    expect(intent.status).toBe('SUCCEEDED');
    expect(res).toMatchObject({
      status: 'SUCCEEDED',
      amountCents: 10_000,
      bonusCents: 2_000,
    });
  });

  it('credits the bonus that was promised, even if the offer has changed since', async () => {
    // The offer now pays nothing; this payment started when it paid RM20.
    const { service, ledger } = setup({ settings: { tiers: [] } });
    await service.completeDemoWalletTopUp('member', 'ref-1');
    expect(ledger.map((e) => e.amountCents)).toEqual([10_000, 2_000]);
  });

  it('adds no bonus entry for a top-up that earned none', async () => {
    const { service, ledger } = setup({
      intent: { amountCents: 3_000, bonusCents: 0 },
    });
    await service.completeDemoWalletTopUp('member', 'ref-1');
    expect(ledger).toEqual([
      { type: 'TOPUP', amountCents: 3_000, reason: 'xendit_wallet_topup' },
    ]);
  });

  it('never credits the same payment twice', async () => {
    const { service, ledger } = setup({});
    await service.completeDemoWalletTopUp('member', 'ref-1');
    await service.completeDemoWalletTopUp('member', 'ref-1');
    await service.completeDemoWalletTopUp('member', 'ref-1');
    expect(ledger).toHaveLength(2);
  });

  it('credits nothing if the bonus entry fails, so a retry cannot double the top-up', async () => {
    const { service, ledger, intent } = setup({ failOnEntry: 2 });
    await expect(
      service.completeDemoWalletTopUp('member', 'ref-1'),
    ).rejects.toThrow('ledger down');
    expect(ledger).toHaveLength(0);
    expect(intent.status).toBe('PENDING');
  });

  it('then succeeds exactly once when retried', async () => {
    const { service, ledger } = setup({ failOnEntry: 2 });
    await expect(
      service.completeDemoWalletTopUp('member', 'ref-1'),
    ).rejects.toThrow();
    await service.completeDemoWalletTopUp('member', 'ref-1');
    expect(ledger).toHaveLength(2);
  });

  it('is only available in demo mode', async () => {
    const { service, ledger } = setup({ demo: false });
    expect(
      (await rejection(service.completeDemoWalletTopUp('member', 'ref-1')))
        .code,
    ).toBe('DEMO_NOT_ENABLED');
    expect(ledger).toHaveLength(0);
  });

  it('cannot complete another member’s payment', async () => {
    const { service, ledger } = setup({});
    await expect(
      service.completeDemoWalletTopUp('someone-else', 'ref-1'),
    ).rejects.toThrow();
    expect(ledger).toHaveLength(0);
  });
});
