import { salesplayImportAction } from './import-export.service';
import { readSalesplayCustomerRow } from './salesplay-customer-row';

describe('readSalesplayCustomerRow', () => {
  it('reads a typical Back Office export (headers already normalized)', () => {
    expect(
      readSalesplayCustomerRow({
        customer_id: '1000',
        customer_code: '60123456789',
        customer_name: 'Ada Member',
        phone_number: '012-345 6789',
        email: 'Ada@Example.com',
      }),
    ).toEqual({
      salesplayId: '1000',
      idSource: 'customer_id',
      phoneRaw: '012-345 6789',
      displayName: 'Ada Member',
      email: 'ada@example.com',
    });
  });

  it('falls back to Customer Code, first/last name and a mobile column', () => {
    const r = readSalesplayCustomerRow({
      customer_code: 'C-77',
      first_name: 'Ben',
      last_name: 'Tan',
      mobile: '0198765432',
    });
    expect(r).toMatchObject({
      salesplayId: 'C-77',
      idSource: 'customer_code',
      phoneRaw: '0198765432',
      displayName: 'Ben Tan',
      email: null,
    });
  });

  it('uses a phone-shaped customer code as the phone (our own pushes)', () => {
    expect(readSalesplayCustomerRow({ customer_code: '60123456789' }).phoneRaw).toBe(
      '60123456789',
    );
  });

  it('reports no id when neither id nor code is present', () => {
    expect(readSalesplayCustomerRow({ phone: '0123456789' }).salesplayId).toBeNull();
  });
});

describe('salesplayImportAction', () => {
  it('creates members that only exist in SalesPlay', () => {
    expect(salesplayImportAction(false, null, '1000')).toBe('create');
  });
  it('links an existing member with no SalesPlay id', () => {
    expect(salesplayImportAction(true, null, '1000')).toBe('link');
  });
  it('leaves a member already linked to the same id alone', () => {
    expect(salesplayImportAction(true, '1000', '1000')).toBe('unchanged');
  });
  it('never overwrites a different SalesPlay id', () => {
    expect(salesplayImportAction(true, '2000', '1000')).toBe('conflict');
  });
});
