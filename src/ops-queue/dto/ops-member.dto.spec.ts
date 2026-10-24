import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OpsCreateMemberDto } from './ops-member.dto';

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(OpsCreateMemberDto, {
    phone: '0123456789',
    email: 'ada@example.com',
    ...body,
  });
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('OpsCreateMemberDto PIN', () => {
  it('accepts a 6-digit PIN and confirmation', async () => {
    expect(await errorsFor({ pin: '123456', pinConfirm: '123456' })).toEqual([]);
  });

  it('accepts registering without a PIN', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it.each(['12345', '1234567', 'dddddd', '12a456'])('rejects %s', async (pin) => {
    expect(await errorsFor({ pin, pinConfirm: pin })).toEqual(
      expect.arrayContaining(['PIN must be 6 digits', 'PIN confirmation must be 6 digits']),
    );
  });
});
