import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';

const auth = {
  kind: 'user',
  adminUserId: 'admin-1',
  role: 'MANAGER',
  actorLabel: 'manager@moja.test',
} as unknown as AdminAuthState;

function makeService(customer: Record<string, unknown> | null) {
  const update = jest.fn().mockResolvedValue({});
  const log = jest.fn().mockResolvedValue(undefined);
  const svc = Object.create(AdminService.prototype) as unknown as Record<
    string,
    unknown
  >;
  svc.prisma = {
    customer: {
      findUnique: jest.fn().mockResolvedValue(customer),
      update,
    },
  };
  svc.audit = { log };
  return { svc: svc as unknown as AdminService, update, log };
}

describe('admin login PIN rescue', () => {
  describe('setCustomerLoginPin', () => {
    it('stores only a hash of a fresh 6-digit PIN, and returns the PIN once', async () => {
      const { svc, update, log } = makeService({
        id: 'c1',
        phoneE164: '+60123456789',
        status: 'ACTIVE',
        loginPinHash: null,
      });
      const { pin } = await svc.setCustomerLoginPin('c1', auth);
      expect(pin).toMatch(/^\d{6}$/);
      const stored = (
        update.mock.calls[0] as [{ data: { loginPinHash: string } }]
      )[0].data.loginPinHash;
      expect(stored).not.toContain(pin);
      await expect(bcrypt.compare(pin, stored)).resolves.toBe(true);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'customer.login_pin_set_by_admin',
          entityId: 'c1',
          actorId: 'manager@moja.test',
        }),
      );
      // The PIN itself never goes in the audit log.
      expect(JSON.stringify(log.mock.calls)).not.toContain(pin);
    });

    it('says so when the member does not exist', async () => {
      const { svc, update } = makeService(null);
      await expect(
        svc.setCustomerLoginPin('nope', auth),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('clearCustomerLoginPin', () => {
    it('removes the PIN and records who did it', async () => {
      const { svc, update, log } = makeService({
        id: 'c1',
        phoneE164: '+60123456789',
        loginPinHash: '$2b$12$hash',
      });
      await expect(svc.clearCustomerLoginPin('c1', auth)).resolves.toEqual({
        cleared: true,
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { loginPinHash: null },
      });
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'customer.login_pin_cleared_by_admin',
          entityId: 'c1',
        }),
      );
    });

    it('does nothing, and logs nothing, when there is no PIN to remove', async () => {
      const { svc, update, log } = makeService({
        id: 'c1',
        phoneE164: '+60123456789',
        loginPinHash: null,
      });
      await expect(svc.clearCustomerLoginPin('c1', auth)).resolves.toEqual({
        cleared: false,
      });
      expect(update).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('says so when the member does not exist', async () => {
      const { svc } = makeService(null);
      await expect(
        svc.clearCustomerLoginPin('nope', auth),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
