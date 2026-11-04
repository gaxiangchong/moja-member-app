import {
  canonicalVariantLabel,
  dedupeVariantLabels,
  findDuplicateVariantLabel,
  tidyVariantLabel,
} from './variant-label';

describe('tidyVariantLabel', () => {
  it('trims and collapses inner whitespace', () => {
    expect(tidyVariantLabel('  6   inch ')).toBe('6 inch');
    expect(tidyVariantLabel('6\tinch')).toBe('6 inch');
  });

  it('keeps the admin casing', () => {
    expect(tidyVariantLabel('6 Inch')).toBe('6 Inch');
  });

  it('survives a missing label', () => {
    expect(tidyVariantLabel(undefined)).toBe('');
    expect(tidyVariantLabel(null)).toBe('');
  });
});

describe('canonicalVariantLabel', () => {
  it('treats case and spacing differences as the same size', () => {
    const all = ['6 inch', '6 Inch', '6  inch', ' 6 INCH '];
    expect(new Set(all.map(canonicalVariantLabel)).size).toBe(1);
  });

  it('keeps genuinely different sizes apart', () => {
    expect(canonicalVariantLabel('6 inch')).not.toBe(
      canonicalVariantLabel('8 inch'),
    );
  });
});

describe('dedupeVariantLabels', () => {
  it('leaves distinct sizes alone', () => {
    expect(dedupeVariantLabels(['6 inch', '8 inch'])).toEqual([
      '6 inch',
      '8 inch',
    ]);
  });

  it('keeps the first spelling of a repeated size', () => {
    expect(dedupeVariantLabels(['6 inch', '6 Inch', '8 inch'])).toEqual([
      '6 inch',
      '8 inch',
    ]);
  });

  it('collapses the double space that painted as a twin column', () => {
    expect(dedupeVariantLabels(['6 inch', '6  inch'])).toEqual(['6 inch']);
  });

  it('drops blank labels', () => {
    expect(dedupeVariantLabels(['6 inch', '   ', ''])).toEqual(['6 inch']);
  });
});

describe('findDuplicateVariantLabel', () => {
  it('is null when every size is distinct', () => {
    expect(findDuplicateVariantLabel(['6 inch', '8 inch', 'Slice'])).toBeNull();
  });

  it('reports both spellings of the clash', () => {
    expect(findDuplicateVariantLabel(['6 inch', '8 inch', '6 Inch'])).toEqual([
      '6 inch',
      '6 Inch',
    ]);
  });

  it('reports an exact repeat', () => {
    expect(findDuplicateVariantLabel(['8 inch', '8 inch'])).toEqual([
      '8 inch',
      '8 inch',
    ]);
  });

  it('ignores blanks rather than calling them a clash', () => {
    expect(findDuplicateVariantLabel(['6 inch', '', undefined])).toBeNull();
  });
});
