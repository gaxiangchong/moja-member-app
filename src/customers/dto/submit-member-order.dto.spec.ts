import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SubmitMemberOrderDto } from './submit-member-order.dto';

// The same settings as the app-wide pipe in main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: SubmitMemberOrderDto });

const order = {
  totalCents: 15900,
  discountCents: 0,
  fulfilmentType: 'PICKUP',
  scheduledDate: '2026-10-21',
  scheduledSlot: '11:00',
  lines: [
    {
      productId: 'caramel-espresso-gateau',
      name: 'Caramel Espresso Gateau',
      unitPriceCents: 15900,
      qty: 1,
    },
  ],
};

describe('SubmitMemberOrderDto validation', () => {
  it('accepts an ordinary order (no server-only field appears on its own)', async () => {
    const dto = (await validate(order)) as SubmitMemberOrderDto;
    expect(dto.totalCents).toBe(15900);
    expect(Object.keys(dto)).not.toContain('earlyOrderDiscountCents');
  });

  it('refuses an early-order discount sent by the app', async () => {
    await expect(
      validate({ ...order, earlyOrderDiscountCents: 5000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
