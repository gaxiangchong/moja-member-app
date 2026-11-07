import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { SubmitMemberOrderDto } from '../customers/dto/submit-member-order.dto';
import type { ShopCatalogProduct } from '../shop-catalog/shop-catalog.service';

const catalogProduct: ShopCatalogProduct = {
  id: 'caramel-espresso-gateau',
  category: 'whole_cakes',
  name: 'Caramel Espresso Gateau',
  shortDescription: '',
  description: '',
  imageUrl: '/images/products/caramel.png',
  basePriceCents: 15900,
  variants: [
    {
      id: 'caramel-espresso-gateau__6-inch',
      label: '6 inch',
      priceCents: 15900,
      available: true,
    },
  ],
  isActive: true,
  sortOrder: 1,
};

describe('PaymentsService.createShopOrderCheckout catalog pricing', () => {
  let service: PaymentsService;
  let prisma: { paymentIntent: { create: jest.Mock } };
  let customers: {
    createPendingMemberOrder: jest.Mock;
    finalizeShopOrderAfterPayment: jest.Mock;
  };
  let xendit: {
    createPaymentRequest: jest.Mock;
    extractRedirectUrl: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      paymentIntent: {
        create: jest.fn(),
      },
    };
    customers = {
      createPendingMemberOrder: jest.fn(async (_customerId, order) => ({
        id: 'order-1',
        orderNumber: 1001,
        totalCents: order.totalCents,
        placedAt: new Date('2026-01-01T00:00:00.000Z'),
        status: 'pending_payment',
      })),
      finalizeShopOrderAfterPayment: jest.fn(),
    };
    xendit = {
      createPaymentRequest: jest.fn().mockResolvedValue({
        payment_request_id: 'pr-1',
        status: 'PENDING',
      }),
      extractRedirectUrl: jest.fn().mockReturnValue('https://pay.example/pr-1'),
    };

    service = new PaymentsService(
      prisma as never,
      { get: jest.fn() } as never,
      xendit as never,
      {} as never,
      customers as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        listPublicProducts: jest.fn().mockReturnValue([catalogProduct]),
      } as never,
    );
  });

  function orderWithLine(unitPriceCents: number): SubmitMemberOrderDto {
    return {
      totalCents: unitPriceCents,
      lines: [
        {
          productId: catalogProduct.id,
          name: 'Client supplied name',
          unitPriceCents,
          qty: 1,
          variantLabel: '6 inch',
          imageUrl: '/client-image.png',
        },
      ],
      fulfillmentSummary: ['Pickup'],
    };
  }

  it('rejects a forged line price before creating an order or payment', async () => {
    await expect(
      service.createShopOrderCheckout('customer-1', orderWithLine(100), 'TOUCHNGO'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(customers.createPendingMemberOrder).not.toHaveBeenCalled();
    expect(xendit.createPaymentRequest).not.toHaveBeenCalled();
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
  });

  it('uses catalog line data and total even when submitted total is lower', async () => {
    const dto = orderWithLine(15900);
    dto.totalCents = 1;

    const result = await service.createShopOrderCheckout(
      'customer-1',
      dto,
      'TOUCHNGO',
    );

    expect(customers.createPendingMemberOrder).toHaveBeenCalledWith(
      'customer-1',
      expect.objectContaining({
        discountCents: 0,
        totalCents: 15900,
        lines: [
          {
            productId: catalogProduct.id,
            name: catalogProduct.name,
            unitPriceCents: 15900,
            qty: 1,
            variantLabel: '6 inch',
            imageUrl: catalogProduct.imageUrl,
          },
        ],
      }),
    );
    expect(xendit.createPaymentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestAmount: 159 }),
    );
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountCents: 15900 }),
      }),
    );
    expect(result).toMatchObject({
      amountCents: 15900,
      subtotalCents: 15900,
      discountCents: 0,
    });
  });
});
