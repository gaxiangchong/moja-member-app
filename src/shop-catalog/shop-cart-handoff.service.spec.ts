import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ShopCartHandoffService } from './shop-cart-handoff.service';
import type { ShopCatalogProduct } from './shop-catalog.service';
import { ShopCatalogService } from './shop-catalog.service';

const catalogProduct: ShopCatalogProduct = {
  id: 'caramel-espresso-gateau',
  category: 'whole_cakes',
  name: 'Caramel Espresso Gateau',
  shortDescription: 'Espresso cake',
  description: 'Espresso cake',
  imageUrl: '/images/products/caramel.png',
  images: [{ src: '/images/products/caramel-primary.png', alt: 'Cake' }],
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
  sortOrder: 1,
};

function makeService(products: ShopCatalogProduct[] = [catalogProduct]) {
  const values = new Map<string, string | number>([
    ['JWT_SECRET', 'test-secret'],
    ['SHOP_WEB_BASE_URL', 'https://shop.example.com'],
    ['MEMBER_APP_PUBLIC_URL', 'https://member.example.com'],
  ]);
  const config = {
    get: jest.fn((key: string, fallback?: string | number) =>
      values.has(key) ? values.get(key) : fallback,
    ),
    getOrThrow: jest.fn((key: string) => {
      const value = values.get(key);
      if (value == null) throw new Error(`Missing ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;
  const shopCatalog = {
    listPublicProducts: jest.fn(() => products),
  } as unknown as ShopCatalogService;

  return {
    service: new ShopCartHandoffService(config, jwt, shopCatalog),
    jwt,
  };
}

describe('ShopCartHandoffService', () => {
  it('signs canonical catalog details instead of client supplied price fields', async () => {
    const { service, jwt } = makeService();

    const result = await service.createHandoff({
      lines: [
        {
          productId: 'caramel-espresso-gateau',
          name: 'Forged free cake',
          qty: 2,
          unitPriceCents: 0,
          variantLabel: '8 inch',
          imageUrl: 'https://attacker.example/free.png',
        },
      ],
    });

    expect(result.subtotalCents).toBe(45600);
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
    expect((jwt.signAsync as jest.Mock).mock.calls[0][0].lines).toEqual([
      {
        productId: 'caramel-espresso-gateau',
        name: 'Caramel Espresso Gateau',
        qty: 2,
        unitPriceCents: 22800,
        variantLabel: '8 inch',
        imageUrl: '/images/products/caramel-primary.png',
      },
    ]);
  });

  it('rejects unknown products before signing a handoff token', async () => {
    const { service, jwt } = makeService();

    await expect(
      service.createHandoff({
        lines: [
          {
            productId: 'not-in-catalog',
            name: 'Unknown',
            qty: 1,
            unitPriceCents: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
