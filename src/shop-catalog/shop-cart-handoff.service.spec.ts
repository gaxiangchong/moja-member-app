import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ShopCartHandoffService } from './shop-cart-handoff.service';
import type {
  ShopCatalogProduct,
  ShopCatalogService,
} from './shop-catalog.service';

const baseProduct = (
  overrides: Partial<ShopCatalogProduct> = {},
): ShopCatalogProduct => ({
  id: 'catalog-cake',
  category: 'whole_cakes',
  name: 'Catalog Cake',
  shortDescription: '',
  description: '',
  imageUrl: '/images/catalog-cake.png',
  basePriceCents: 12000,
  variants: [
    {
      id: 'catalog-cake__6-inch',
      label: '6 inch',
      priceCents: 12000,
      available: true,
    },
    {
      id: 'catalog-cake__8-inch',
      label: '8 inch',
      priceCents: 18000,
      available: true,
    },
  ],
  isActive: true,
  sortOrder: 1,
  ...overrides,
});

const badRequestCode = async (
  promise: Promise<unknown>,
): Promise<string | undefined> => {
  const error = await promise.catch((err: unknown) => err);
  expect(error).toBeInstanceOf(BadRequestException);
  const response = (error as BadRequestException).getResponse();
  return typeof response === 'object' && response !== null
    ? (response as { code?: string }).code
    : undefined;
};

describe('ShopCartHandoffService', () => {
  let products: ShopCatalogProduct[];
  let service: ShopCartHandoffService;

  beforeEach(() => {
    products = [baseProduct()];

    const configValues: Record<string, string | number> = {
      JWT_SECRET: 'test-secret',
      CLIENT_WEB_ORIGIN: 'https://member.example',
      SHOP_CART_HANDOFF_ISSUER: 'https://api.example',
    };
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key in configValues ? configValues[key] : defaultValue,
      ),
      getOrThrow: jest.fn((key: string) => {
        if (!(key in configValues)) throw new Error(`Missing ${key}`);
        return configValues[key];
      }),
    } as unknown as ConfigService;

    const shopCatalog = {
      listPublicProducts: jest.fn(() => products),
    } as unknown as ShopCatalogService;

    service = new ShopCartHandoffService(config, new JwtService(), shopCatalog);
  });

  it('signs catalog-derived prices instead of forged request prices', async () => {
    const created = await service.createHandoff({
      lines: [
        {
          productId: 'catalog-cake',
          variantId: 'catalog-cake__8-inch',
          variantLabel: '6 inch',
          name: 'Fake cheap cake',
          qty: 2,
          unitPriceCents: 1,
        },
      ],
    });

    expect(created.subtotalCents).toBe(36000);

    const consumed = await service.consumeHandoff(created.handoffToken);
    expect(consumed).toMatchObject({
      subtotalCents: 36000,
      lines: [
        {
          productId: 'catalog-cake',
          variantId: 'catalog-cake__8-inch',
          name: 'Catalog Cake',
          qty: 2,
          unitPriceCents: 18000,
          variantLabel: '8 inch',
          imageUrl: '/images/catalog-cake.png',
        },
      ],
    });
  });

  it('rejects sold-out catalog products', async () => {
    products = [baseProduct({ soldOut: true })];

    await expect(
      badRequestCode(
        service.createHandoff({
          lines: [
            {
              productId: 'catalog-cake',
              variantId: 'catalog-cake__6-inch',
              name: 'Catalog Cake',
              qty: 1,
              unitPriceCents: 12000,
            },
          ],
        }),
      ),
    ).resolves.toBe('CART_HANDOFF_UNAVAILABLE_PRODUCT');
  });

  it('rejects unavailable variants', async () => {
    products = [
      baseProduct({
        variants: [
          {
            id: 'catalog-cake__6-inch',
            label: '6 inch',
            priceCents: 12000,
            available: false,
          },
        ],
      }),
    ];

    await expect(
      badRequestCode(
        service.createHandoff({
          lines: [
            {
              productId: 'catalog-cake',
              variantId: 'catalog-cake__6-inch',
              name: 'Catalog Cake',
              qty: 1,
              unitPriceCents: 1,
            },
          ],
        }),
      ),
    ).resolves.toBe('CART_HANDOFF_UNAVAILABLE_VARIANT');
  });
});
