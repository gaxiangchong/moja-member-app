import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ShopCartHandoffService } from './shop-cart-handoff.service';
import { ShopCatalogService } from './shop-catalog.service';

describe('ShopCartHandoffService', () => {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        SHOP_WEB_BASE_URL: 'https://shop.example',
        JWT_SECRET: 'test-secret',
      };
      return values[key] ?? fallback;
    }),
    getOrThrow: jest.fn(() => 'test-secret'),
  } as unknown as ConfigService;

  const activeProduct = {
    id: 'cake-1',
    category: 'whole_cakes' as const,
    name: 'Catalog Cake',
    shortDescription: '',
    description: '',
    imageUrl: '/catalog-cake.png',
    basePriceCents: 15900,
    variants: [
      {
        id: 'cake-1__8-inch',
        label: '8 inch',
        priceCents: 22800,
        available: true,
      },
    ],
    soldOut: false,
    isActive: true,
    sortOrder: 1,
  };

  function makeService(products = [activeProduct]) {
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };
    const catalog = {
      listPublicProducts: jest.fn(() => products),
    } as unknown as ShopCatalogService;
    return {
      service: new ShopCartHandoffService(
        config,
        jwt as unknown as JwtService,
        catalog,
      ),
      jwt,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('signs catalog-derived prices instead of caller-supplied prices', async () => {
    const { service, jwt } = makeService();

    const result = await service.createHandoff({
      lines: [
        {
          productId: 'cake-1',
          name: 'Tampered Cake',
          qty: 2,
          unitPriceCents: 1,
          variantLabel: '8 inch',
          imageUrl: 'https://attacker.example/cake.png',
        },
      ],
    });

    expect(result.subtotalCents).toBe(45600);
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            productId: 'cake-1',
            name: 'Catalog Cake',
            unitPriceCents: 22800,
            variantLabel: '8 inch',
            imageUrl: '/catalog-cake.png',
          }),
        ],
      }),
      expect.any(Object),
    );
  });

  it('reprices consumed handoff tokens from the catalog', async () => {
    const { service, jwt } = makeService();
    jwt.verifyAsync.mockResolvedValue({
      sub: 'shop_cart',
      lines: [
        {
          productId: 'cake-1',
          name: 'Tampered Cake',
          qty: 1,
          unitPriceCents: 1,
          variantLabel: 'cake-1__8-inch',
          imageUrl: 'https://attacker.example/cake.png',
        },
      ],
    });

    await expect(service.consumeHandoff('token')).resolves.toMatchObject({
      subtotalCents: 22800,
      lines: [
        {
          productId: 'cake-1',
          name: 'Catalog Cake',
          unitPriceCents: 22800,
          variantLabel: '8 inch',
          imageUrl: '/catalog-cake.png',
        },
      ],
    });
  });

  it('rejects products that are no longer available', async () => {
    const { service, jwt } = makeService([{ ...activeProduct, soldOut: true }]);

    await expect(
      service.createHandoff({
        lines: [
          {
            productId: 'cake-1',
            name: 'Catalog Cake',
            qty: 1,
            unitPriceCents: 15900,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CART_HANDOFF_PRODUCT_UNAVAILABLE',
      }),
    });
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
