import { BadRequestException } from '@nestjs/common';
import { DEFAULT_DELIVERY_SETTINGS } from '../orders/delivery';
import { CustomersService } from './customers.service';
import type { SubmitMemberOrderDto } from './dto/submit-member-order.dto';

const ADDRESS = 'No 8, Jalan Burma, George Town, 10250 Penang';

const CAKE = {
  productId: 'choc-cake',
  name: 'Chocolate Cake',
  unitPriceCents: 9800,
  qty: 1,
};
const COOKIES = {
  productId: 'butter-cookies',
  name: 'Butter Cookies',
  unitPriceCents: 2800,
  qty: 2,
};

function makeService(settings = DEFAULT_DELIVERY_SETTINGS) {
  const created: Record<string, unknown>[] = [];
  // Mirrors PickupRulesService: a delivery with no collection slot is rejected.
  // Shipping must not call this, or every parcel order fails.
  const assertCanPlace = jest.fn(
    async (input: {
      fulfilmentType?: string;
      scheduledDate?: string | null;
      scheduledSlot?: string | null;
    }) => {
      if (input.fulfilmentType === 'IN_STORE') return;
      if (!input.scheduledDate?.trim() || !input.scheduledSlot?.trim()) {
        throw new BadRequestException({
          code: 'PICKUP_SLOT_REQUIRED',
          message: 'Select a pickup date and time.',
        });
      }
    },
  );
  const tx = {
    customerOrder: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        const lines = (data.lines as { create: Record<string, unknown>[] })
          .create;
        return Promise.resolve({ ...data, id: 'o1', lines });
      }),
    },
  };
  const svc = Object.create(CustomersService.prototype) as unknown as Record<
    string,
    unknown
  >;
  svc.deliverySettings = { getSettings: () => Promise.resolve(settings) };
  svc.pickupRules = { assertCanPlace };
  svc.productStock = { reserveForOrderLines: jest.fn().mockResolvedValue([]) };
  svc.prisma = {
    shopProduct: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'choc-cake', shippable: false, name: 'Chocolate Cake' },
        { id: 'butter-cookies', shippable: true, name: 'Butter Cookies' },
      ]),
    },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  const place = (dto: Partial<SubmitMemberOrderDto>) =>
    (svc as unknown as CustomersService).createPendingMemberOrder(
      'c1',
      dto as SubmitMemberOrderDto,
    );
  return { place, created, assertCanPlace };
}

const shippingDto = (
  lines: (typeof CAKE)[],
  totalCents: number,
): Partial<SubmitMemberOrderDto> => ({
  totalCents,
  fulfilmentType: 'DELIVERY',
  deliveryMethod: 'SHIPPING',
  delivery: {
    address: ADDRESS,
    contactName: 'Aisyah',
    contactPhone: '012-345 6789',
  },
  lines,
});

describe('createPendingMemberOrder: nationwide shipping', () => {
  it('ships cookies, adding the flat fee to the total', async () => {
    const { place, created, assertCanPlace } = makeService();
    // 2 x RM28 = 5600, plus the RM10 parcel fee.
    await place(shippingDto([COOKIES], 5600 + 1000));
    expect(created[0]).toMatchObject({
      fulfilmentType: 'DELIVERY',
      deliveryMethod: 'SHIPPING',
      deliveryFeeCents: 1000,
      deliveryArrangement: 'MOJA',
      totalCents: 6600,
      scheduledDate: null,
      scheduledSlot: null,
    });
    // A parcel has no collection slot, so the pickup rules are not applied.
    expect(assertCanPlace).not.toHaveBeenCalled();
  });

  it('waives the fee once the goods are over RM100', async () => {
    const { place, created } = makeService();
    // 4 x RM28 = 11200, over the RM100 line, so no parcel fee.
    await place(shippingDto([{ ...COOKIES, qty: 4 }], 11200));
    expect(created[0]).toMatchObject({
      deliveryFeeCents: 0,
      totalCents: 11200,
    });
  });

  it('still charges it at exactly RM100', async () => {
    const { place, created } = makeService();
    await place(
      shippingDto([{ ...COOKIES, unitPriceCents: 5000, qty: 2 }], 11000),
    );
    expect(created[0]).toMatchObject({
      deliveryFeeCents: 1000,
      totalCents: 11000,
    });
  });

  it('refuses to post a cake, even in a mixed order', async () => {
    const { place, created } = makeService();
    await expect(
      place(shippingDto([CAKE, COOKIES], 9800 + 5600)),
    ).rejects.toMatchObject({
      response: { code: 'SHIPPING_NOT_ALLOWED' },
    });
    expect(created).toHaveLength(0);
  });

  it('refuses a total that leaves out the shipping fee', async () => {
    const { place } = makeService();
    await expect(place(shippingDto([COOKIES], 5600))).rejects.toMatchObject({
      response: { code: 'ORDER_TOTAL_MISMATCH' },
    });
  });

  it('refuses shipping while it is switched off', async () => {
    const { place } = makeService({
      ...DEFAULT_DELIVERY_SETTINGS,
      shippingEnabled: false,
    });
    await expect(place(shippingDto([COOKIES], 6600))).rejects.toMatchObject({
      response: { code: 'SHIPPING_UNAVAILABLE' },
    });
  });

  it('needs an address to ship to', async () => {
    const { place } = makeService();
    const dto = shippingDto([COOKIES], 6600);
    dto.delivery = { address: 'PJ', contactName: 'A', contactPhone: '1' };
    await expect(place(dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps a courier delivery inside the local area', async () => {
    const { place } = makeService({
      ...DEFAULT_DELIVERY_SETTINGS,
      localDeliveryPostcodes: ['47'],
    });
    const local = {
      totalCents: 9800,
      fulfilmentType: 'DELIVERY' as const,
      scheduledDate: '2026-10-10',
      scheduledSlot: '14:00',
      lines: [CAKE],
      delivery: {
        address: 'No 12, Jalan SS2/24, Petaling Jaya, 47300 Selangor',
        contactName: 'Aisyah',
        contactPhone: '012-345 6789',
        arrangement: 'SELF' as const,
      },
    };
    await expect(place(local)).resolves.toBeDefined();
    await expect(
      place({ ...local, delivery: { ...local.delivery, address: ADDRESS } }),
    ).rejects.toMatchObject({ response: { code: 'DELIVERY_OUT_OF_AREA' } });
  });

  it('does not limit a parcel to the local area', async () => {
    const { place } = makeService({
      ...DEFAULT_DELIVERY_SETTINGS,
      localDeliveryPostcodes: ['47'],
    });
    await expect(place(shippingDto([COOKIES], 6600))).resolves.toBeDefined();
  });

  it('leaves a local pickup of cake and cookies together unchanged', async () => {
    const { place, created } = makeService();
    await place({
      totalCents: 9800 + 5600,
      fulfilmentType: 'PICKUP',
      scheduledDate: '2026-10-10',
      scheduledSlot: '14:00',
      lines: [CAKE, COOKIES],
    });
    expect(created[0]).toMatchObject({
      fulfilmentType: 'PICKUP',
      deliveryFeeCents: 0,
      totalCents: 15400,
    });
    expect(created[0]).not.toHaveProperty('deliveryMethod');
  });
});
