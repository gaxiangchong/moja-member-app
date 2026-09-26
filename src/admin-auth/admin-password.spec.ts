import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminRoleCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AdminAuthService } from './admin-auth.service';
import type { AdminAuthState } from './types/admin-auth.types';

/** Minimal stubs — these tests are about the password rules, not persistence. */
type UpdateCall = { data: { passwordHash?: string; passwordChangedAt?: Date } };

/** jest mock calls are untyped; narrow once here instead of at each use. */
function firstUpdateData(update: jest.Mock): UpdateCall['data'] {
  const calls = update.mock.calls as unknown as UpdateCall[][];
  return calls[0][0].data;
}
function makeService(user: {
  id: string;
  passwordHash: string;
  isActive?: boolean;
}) {
  const adminUser = {
    findUnique: jest.fn().mockResolvedValue({
      id: user.id,
      email: 'a@b.com',
      role: AdminRoleCode.SUPER_ADMIN,
      isActive: user.isActive ?? true,
      passwordHash: user.passwordHash,
      displayName: null,
    }),
    update: jest.fn().mockImplementation((args: UpdateCall) => ({
      id: user.id,
      email: 'a@b.com',
      role: AdminRoleCode.SUPER_ADMIN,
      displayName: null,
      isActive: true,
      ...args.data,
    })),
  };
  const prisma = { adminUser } as never;
  const jwt = { signAsync: jest.fn().mockResolvedValue('new.token') } as never;
  const config = {
    get: jest.fn(() => 'a'.repeat(40)),
    getOrThrow: jest.fn(() => 'a'.repeat(40)),
  } as never;
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as never;
  return {
    service: new AdminAuthService(prisma, jwt, config, audit),
    adminUser,
    audit: audit as unknown as { log: jest.Mock },
  };
}

const userActor: AdminAuthState = {
  kind: 'user',
  actorLabel: 'admin:a@b.com',
  permissions: new Set(['*']),
  isSuper: true,
  adminUserId: 'u1',
  role: AdminRoleCode.SUPER_ADMIN,
  email: 'a@b.com',
} as AdminAuthState;

const keyActor: AdminAuthState = {
  kind: 'api_key',
  actorLabel: 'key:abc123…',
  permissions: new Set(['*']),
  isSuper: true,
} as AdminAuthState;

describe('admin password reset (updateUser)', () => {
  it('refuses a reset from a shared API key', async () => {
    const { service } = makeService({ id: 'u1', passwordHash: 'x' });
    await expect(
      service.updateUser(keyActor, 'u1', { password: 'LongEnough123' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still lets an API key change non-credential fields', async () => {
    const { service, adminUser } = makeService({ id: 'u1', passwordHash: 'x' });
    await service.updateUser(keyActor, 'u1', { displayName: 'Ops' });
    expect(adminUser.update).toHaveBeenCalled();
  });

  it('hashes the new password and stamps passwordChangedAt', async () => {
    const { service, adminUser } = makeService({ id: 'u1', passwordHash: 'x' });
    await service.updateUser(userActor, 'u1', { password: 'LongEnough123' });
    const data = firstUpdateData(adminUser.update);
    expect(data.passwordHash).toBeDefined();
    expect(data.passwordHash).not.toBe('LongEnough123');
    await expect(
      bcrypt.compare('LongEnough123', data.passwordHash),
    ).resolves.toBe(true);
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
  });

  it('never writes the password into the audit log', async () => {
    const { service, audit } = makeService({ id: 'u1', passwordHash: 'x' });
    await service.updateUser(userActor, 'u1', { password: 'LongEnough123' });
    const logged = JSON.stringify(audit.log.mock.calls);
    expect(logged).not.toContain('LongEnough123');
    expect(logged).toContain('admin.password_reset');
  });
});

describe('admin changes own password', () => {
  it('rejects a wrong current password', async () => {
    const hash = await bcrypt.hash('RealPassword1', 10);
    const { service } = makeService({ id: 'u1', passwordHash: hash });
    await expect(
      service.changeOwnPassword(userActor, {
        currentPassword: 'WrongPassword1',
        newPassword: 'BrandNewPass1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an API-key caller (no person behind it)', async () => {
    const { service } = makeService({ id: 'u1', passwordHash: 'x' });
    await expect(
      service.changeOwnPassword(keyActor, {
        currentPassword: 'a',
        newPassword: 'BrandNewPass1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects reusing the current password', async () => {
    const hash = await bcrypt.hash('RealPassword1', 10);
    const { service } = makeService({ id: 'u1', passwordHash: hash });
    await expect(
      service.changeOwnPassword(userActor, {
        currentPassword: 'RealPassword1',
        newPassword: 'RealPassword1',
      }),
    ).rejects.toThrow();
  });

  it('stamps passwordChangedAt and returns a fresh token', async () => {
    const hash = await bcrypt.hash('RealPassword1', 10);
    const { service, adminUser } = makeService({
      id: 'u1',
      passwordHash: hash,
    });
    const res = await service.changeOwnPassword(userActor, {
      currentPassword: 'RealPassword1',
      newPassword: 'BrandNewPass1',
    });
    expect(res.accessToken).toBe('new.token');
    const data = firstUpdateData(adminUser.update);
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    await expect(
      bcrypt.compare('BrandNewPass1', data.passwordHash),
    ).resolves.toBe(true);
  });
});
