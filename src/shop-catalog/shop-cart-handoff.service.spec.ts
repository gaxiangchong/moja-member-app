import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ShopCartHandoffService } from './shop-cart-handoff.service';
import type { ShopCatalogProduct } from './shop-catalog.service';

const products: ShopCatalogProduct[] = [
  {
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
      {
        id: 'caramel-espresso-gateau__8-inch',
        label: '8 inch',
        priceCents: 22800,
        available: true,
      },
    ],
    isActive: true,
    sortOrder: 10,
  },
];

function makeService() {
  const config = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'MEMBER_APP_PUBLIC_URL') return 'https://member.example';
      return defaultValue;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      throw new Error(`Missing config: ${key}`);
    }),
  };
  const catalog = {
    listPublicProducts: jest.fn(() => products),
  };
  return new ShopCartHandoffService(
    config as never,
    new JwtService(),
    catalog as never,
  );
}

describe('ShopCartHandoffService', () => {
  it('uses catalog pricing instead of client-supplied line pricing', async () => {
    const service = makeService();

    const handoff = await service.createHandoff({
      lines: [
        {
          productId: 'caramel-espresso-gateau',
          name: 'Tampered Name',
          qty: 1,
          unitPriceCents: 0,
          variantLabel: '8 inch',
          imageUrl: 'https://attacker.example/image.png',
        },
      ],
    });

    expect(handoff.subtotalCents).toBe(22800);

    const consumed = await service.consumeHandoff(handoff.handoffToken);
    expect(consumed.lines).toEqual([
      {
        productId: 'caramel-espresso-gateau',
        name: 'Caramel Espresso Gateau',
        qty: 1,
        unitPriceCents: 22800,
        variantLabel: '8 inch',
        imageUrl: '/images/products/caramel.png',
      },
    ]);
    expect(consumed.subtotalCents).toBe(22800);
  });

  it('rejects handoff lines for products outside the public catalog', async () => {
    const service = makeService();

    await expect(
      service.createHandoff({
        lines: [
          {
            productId: 'missing-product',
            name: 'Missing Product',
            qty: 1,
            unitPriceCents: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
