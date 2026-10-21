import { resolveShopFilter } from './shop-filter';

const p = (category: string, id: string, name: string, shopFilter?: string) => ({
  category,
  id,
  name,
  shopFilter,
});

describe('resolveShopFilter', () => {
  it('uses the admin choice when set', () => {
    expect(resolveShopFilter(p('cake_slices', 'chocolate-brownie', 'Chocolate Brownie', 'cookies'))).toBe(
      'cookies',
    );
  });

  it('finds cheesecakes by id even when the name does not say so', () => {
    expect(resolveShopFilter(p('whole_cakes', 'jasmine-blanc-cheesecake', 'Jasmine Blanc'))).toBe(
      'cheesecake',
    );
    expect(resolveShopFilter(p('whole_cakes', 'x', 'Citron Basque'))).toBe('cheesecake');
  });

  it('puts cookie jars and soft cookies under Cookies', () => {
    expect(resolveShopFilter(p('specials', 'matcha-cookies-jar', 'Matcha Cookies Jar'))).toBe('cookies');
    expect(resolveShopFilter(p('cake_slices', 'chocolate-chip-soft-cookies', 'Peanut Butter Melt'))).toBe(
      'cookies',
    );
  });

  it('treats other cakes as Cream Cake and drinks as Drinks', () => {
    expect(resolveShopFilter(p('whole_cakes', 'strawberry-shortcake', 'Strawberry Short Cake'))).toBe(
      'cream_cake',
    );
    expect(resolveShopFilter(p('drinks', 'latte', 'Latte'))).toBe('drinks');
  });

  it('ignores an unknown stored value and leaves other specials unfiltered', () => {
    expect(resolveShopFilter(p('specials', 'gift-card', 'Gift Card', 'bogus'))).toBeNull();
  });
});
