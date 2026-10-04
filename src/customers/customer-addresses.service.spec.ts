import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AddressError,
  composeAddress,
  validateAddressInput,
} from './customer-address';
import { CustomerAddressesService } from './customer-addresses.service';

const good = {
  label: ' Home ',
  recipientName: '  Aisyah  Rahman ',
  phone: '012-345 6789',
  line1: 'No 12, Jalan SS2/24',
  city: 'Petaling Jaya',
  state: 'Selangor',
  postcode: '47300',
};

describe('validateAddressInput', () => {
  it('tidies a good address', () => {
    expect(validateAddressInput(good)).toEqual({
      label: 'Home',
      recipientName: 'Aisyah Rahman',
      phone: '0123456789',
      line1: 'No 12, Jalan SS2/24',
      city: 'Petaling Jaya',
      state: 'Selangor',
      postcode: '47300',
    });
    expect(validateAddressInput({ ...good, label: '  ' }).label).toBeNull();
  });

  it.each([
    ['nothing', undefined],
    ['no name', { ...good, recipientName: ' ' }],
    ['a short phone', { ...good, phone: '123' }],
    ['a tiny street line', { ...good, line1: 'PJ' }],
    ['a 4-digit postcode', { ...good, postcode: '4730' }],
    ['a postcode with letters', { ...good, postcode: '47A00' }],
    ['no city', { ...good, city: '' }],
    ['no state', { ...good, state: '' }],
  ])('rejects %s', (_label, raw) => {
    expect(() => validateAddressInput(raw)).toThrow(AddressError);
  });
});

describe('composeAddress', () => {
  it('puts the postcode where the local-area check can find it', () => {
    expect(composeAddress(good)).toBe(
      'No 12, Jalan SS2/24, 47300 Petaling Jaya, Selangor',
    );
  });
});

/** A tiny in-memory stand-in for the address table. */
function fakeDb() {
  type Row = Record<string, any>;
  const rows: Row[] = [];
  let n = 0;
  const match = (r: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => r[k] === v);
  const model = {
    findMany: ({ where }: { where: Row }) =>
      Promise.resolve(
        rows
          .filter((r) => match(r, where))
          .sort(
            (a, b) =>
              Number(b.isDefault) - Number(a.isDefault) ||
              b.createdAt - a.createdAt,
          ),
      ),
    findFirst: ({ where }: { where: Row }) =>
      Promise.resolve(
        rows
          .filter((r) => match(r, where))
          .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
      ),
    count: ({ where }: { where: Row }) =>
      Promise.resolve(rows.filter((r) => match(r, where)).length),
    create: ({ data }: { data: Row }) => {
      const row = { id: `a${++n}`, createdAt: n, ...data };
      rows.push(row);
      return Promise.resolve(row);
    },
    updateMany: ({ where, data }: { where: Row; data: Row }) => {
      rows
        .filter((r) => match(r, where))
        .forEach((r) => Object.assign(r, data));
      return Promise.resolve({ count: 1 });
    },
    update: ({ where, data }: { where: Row; data: Row }) => {
      const r = rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return Promise.resolve(r);
    },
    delete: ({ where }: { where: Row }) => {
      rows.splice(
        rows.findIndex((x) => x.id === where.id),
        1,
      );
      return Promise.resolve();
    },
  };
  const prisma = {
    customerAddress: model,
    $transaction: (fn: (t: { customerAddress: typeof model }) => unknown) =>
      fn({ customerAddress: model }),
  };
  return { rows, svc: new CustomerAddressesService(prisma as never) };
}

describe('CustomerAddressesService', () => {
  it('makes the first address the default, and later ones not', async () => {
    const { svc } = fakeDb();
    const a = await svc.create('c1', good);
    const b = await svc.create('c1', { ...good, label: 'Office' });
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(false);
  });

  it('moves the default when a new default is asked for', async () => {
    const { svc } = fakeDb();
    await svc.create('c1', good);
    const b = await svc.create('c1', { ...good, label: 'Office' }, true);
    const list = await svc.list('c1');
    expect(b.isDefault).toBe(true);
    expect(list.filter((x) => x.isDefault)).toHaveLength(1);
    expect(list[0].id).toBe(b.id);
  });

  it('promotes the newest remaining address when the default is deleted', async () => {
    const { svc } = fakeDb();
    const a = await svc.create('c1', good);
    await svc.create('c1', { ...good, label: 'Office' });
    const c = await svc.create('c1', { ...good, label: 'Parents' });
    const list = await svc.remove('c1', a.id);
    expect(list).toHaveLength(2);
    expect(list.find((x) => x.isDefault)?.id).toBe(c.id);
  });

  it("keeps one member out of another member's addresses", async () => {
    const { svc } = fakeDb();
    const a = await svc.create('c1', good);
    await expect(svc.remove('c2', a.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.update('c2', a.id, good)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await svc.list('c2')).toEqual([]);
  });

  it('refuses bad input and an eleventh address', async () => {
    const { svc } = fakeDb();
    await expect(
      svc.create('c1', { ...good, postcode: '1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    for (let i = 0; i < 10; i += 1) await svc.create('c1', good);
    await expect(svc.create('c1', good)).rejects.toMatchObject({
      response: { code: 'ADDRESS_LIMIT' },
    });
  });
});
