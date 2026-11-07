import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ShopCartHandoffService } from './shop-cart-handoff.service';
import type { ShopCatalogProduct } from './shop-catalog.service';

describe('ShopCartHandoffService', () => {
  const product: ShopCatalogProduct = {
    id: 'catalog-cake',
    category: 'whole_cakes',
    name: 'Catalog Cake',
    shortDescription: '',
    description: '',
    imageUrl: '/images/catalog-cake.png',
    basePriceCents: 15900,
    variants: [
      {
        id: 'catalog-cake__8-inch',
        label: '8 inch',
        priceCents: 22800,
        available: true,
      },
    ],
    isActive: true,
    sortOrder: 1,
  };

  const configValues: Record<string, unknown> = {
    SHOP_WEB_BASE_URL: 'https://shop.example',
    MEMBER_APP_PUBLIC_URL: 'https://member.example',
    SHOP_CART_HANDOFF_JWT_SECRET: 'handoff-test-secret',
    SHOP_CART_HANDOFF_ISSUER: 'https://api.example',
    SHOP_CART_HANDOFF_AUDIENCE: 'member_app_cart',
    SHOP_CART_HANDOFF_TTL_SEC: 300,
    JWT_SECRET: 'fallback-secret',
  };

  function makeService(products: ShopCatalogProduct[] = [product]) {
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key in configValues ? configValues[key] : defaultValue,
      ),
      getOrThrow: jest.fn((key: string) => {
        if (key in configValues) return configValues[key];
        throw new Error(`Missing config ${key}`);
      }),
    } as unknown as ConfigService;
    const catalog = {
      listPublicProducts: jest.fn(() => products),
    };

    return new ShopCartHandoffService(
      config,
      new JwtService(),
      catalog as never,
    );
  }

  it('reprices handoff lines from the catalog before signing', async () => {
    const service = makeService();

    const handoff = await service.createHandoff({
      lines: [
        {
          productId: 'catalog-cake',
          name: 'Forged Cake',
          qty: 2,
          unitPriceCents: 0,
          variantLabel: '8 inch',
          imageUrl: 'https://attacker.example/free.png',
        },
      ],
    });

    const consumed = await service.consumeHandoff(handoff.handoffToken);

    expect(handoff.subtotalCents).toBe(45600);
    expect(consumed.subtotalCents).toBe(45600);
    expect(consumed.lines).toEqual([
      {
        productId: 'catalog-cake',
        name: 'Catalog Cake',
        qty: 2,
        unitPriceCents: 22800,
        variantLabel: '8 inch',
        imageUrl: '/images/catalog-cake.png',
      },
    ]);
  });

  it('rejects products that are not available in the public catalog', async () => {
    const service = makeService([]);

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
