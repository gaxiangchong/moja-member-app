import { deliveryClassFor, localOnlyProductIds } from './delivery-class';

describe('deliveryClassFor', () => {
  it('lets only products marked shippable go nationwide', () => {
    expect(deliveryClassFor(true)).toBe('NATIONWIDE');
  });

  it('keeps everything else local, including unknown products', () => {
    expect(deliveryClassFor(false)).toBe('LOCAL_ONLY');
    expect(deliveryClassFor(null)).toBe('LOCAL_ONLY');
    expect(deliveryClassFor(undefined)).toBe('LOCAL_ONLY');
  });
});

describe('localOnlyProductIds', () => {
  const shippable = new Map([
    ['choc-cake', false],
    ['butter-cookies', true],
    ['butter-cookies-jar', true],
  ]);

  it('lists the products that cannot be posted, once each', () => {
    const lines = [
      { productId: 'choc-cake' },
      { productId: 'butter-cookies' },
      { productId: 'choc-cake' },
    ];
    expect(localOnlyProductIds(lines, shippable)).toEqual(['choc-cake']);
  });

  it('does not care about category: a jar marked shippable ships', () => {
    expect(
      localOnlyProductIds(
        [{ productId: 'butter-cookies-jar' }, { productId: 'butter-cookies' }],
        shippable,
      ),
    ).toEqual([]);
  });

  it('treats a product the catalog does not know as local-only', () => {
    expect(localOnlyProductIds([{ productId: 'ghost' }], shippable)).toEqual([
      'ghost',
    ]);
  });
});
