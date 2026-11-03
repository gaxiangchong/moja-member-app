import { ShopCatalogService } from './shop-catalog.service';

const CSV = [
  'Product code,Product name,Category,Price,Product status',
  '30002-105,Strawberry Short Cake (6in),Creamcake,149.00,ENABLE',
  '30002-106,Strawberry Short Cake (8in),Creamcake,208.00,ENABLE',
  '30009-101,Old Cake,Creamcake,99.00,DISABLE',
].join('\n');

function makeService(csv: string | null) {
  const svc = Object.create(ShopCatalogService.prototype) as Record<
    string,
    unknown
  >;
  svc.readStoredSalesplayCsv = () =>
    Promise.resolve(
      csv ? { csv, uploadedAt: '2026-11-01T02:00:00.000Z' } : null,
    );
  svc.loadAll = () =>
    Promise.resolve([
      {
        id: 'strawberry-shortcake',
        name: 'Strawberry Short Cake',
        salesplayVariantCodes: { '6 inch': '30002-105', '8 inch': '30002-106' },
      },
      { id: 'brownie', name: 'Brownie', salesplayProductCode: '30002-106' },
    ]);
  svc.prisma = {
    posReceiptLine: {
      groupBy: jest.fn().mockResolvedValue([
        {
          productCode: '30002-105',
          _count: { _all: 12 },
          _max: { name: 'SSC 6in' },
        },
        {
          productCode: 'TILL-ONLY',
          _count: { _all: 3 },
          _max: { name: 'Mystery' },
        },
      ]),
    },
  };
  return svc as unknown as ShopCatalogService;
}

describe('ShopCatalogService.checkSalesplayCodes', () => {
  it('looks each code up in the product list, till receipts and the catalog', async () => {
    const res = await makeService(CSV).checkSalesplayCodes([
      '30002-105',
      ' 30002-106 ',
      '30009-101',
      'TILL-ONLY',
      'TYPO-1',
      '30002-105',
    ]);
    expect(res.productListUploadedAt).toBe('2026-11-01T02:00:00.000Z');
    const byCode = Object.fromEntries(res.results.map((r) => [r.code, r]));
    expect(Object.keys(byCode)).toEqual([
      '30002-105',
      '30002-106',
      '30009-101',
      'TILL-ONLY',
      'TYPO-1',
    ]);
    expect(byCode['30002-105']).toMatchObject({
      inProductList: true,
      productListName: 'Strawberry Short Cake (6in)',
      tillSales: 12,
      usedBy: [{ productId: 'strawberry-shortcake', variantLabel: '6 inch' }],
    });
    // Mapped twice: the 8 inch size and the brownie.
    expect(byCode['30002-106'].usedBy.map((u) => u.productId)).toEqual([
      'strawberry-shortcake',
      'brownie',
    ]);
    expect(byCode['30009-101']).toMatchObject({
      inProductList: true,
      productListEnabled: false,
    });
    expect(byCode['TILL-ONLY']).toMatchObject({
      inProductList: false,
      tillSales: 3,
      tillName: 'Mystery',
    });
    expect(byCode['TYPO-1']).toMatchObject({
      inProductList: false,
      tillSales: 0,
      usedBy: [],
    });
  });

  it('reports the product list as unknown before one is uploaded', async () => {
    const res = await makeService(null).checkSalesplayCodes(['30002-105']);
    expect(res.productListUploadedAt).toBeNull();
    expect(res.results[0]).toMatchObject({
      inProductList: null,
      tillSales: 12,
    });
  });
});
