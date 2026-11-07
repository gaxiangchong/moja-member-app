import 'reflect-metadata';
import { AdminRoleCode } from '@prisma/client';
import { PERMISSIONS_KEY } from '../admin-auth/decorators/require-permissions.decorator';
import {
  P,
  hasPermission,
  permissionsForRole,
} from '../admin-auth/permissions';
import { AdminReportsController } from './admin-reports.controller';

describe('AdminReportsController permissions', () => {
  const subscriptionMutationHandlers = [
    'markBentoSubscriptionRefunded',
    'activateBentoSubscription',
    'cancelBentoSubscription',
    'scheduleBentoSubscription',
  ] as const;

  it.each(subscriptionMutationHandlers)(
    'protects %s with the subscription-management permission',
    (handlerName) => {
      const handler = AdminReportsController.prototype[handlerName];

      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        P.BENTO_SUBSCRIPTION_MANAGE,
      ]);
    },
  );

  it('does not grant subscription mutations to read-only or unrelated roles', () => {
    for (const role of [
      AdminRoleCode.READONLY_ANALYST,
      AdminRoleCode.CRM_ADMIN,
      AdminRoleCode.MARKETING_ADMIN,
    ]) {
      expect(
        hasPermission(
          permissionsForRole(role),
          P.BENTO_SUBSCRIPTION_MANAGE,
        ),
      ).toBe(false);
    }
  });

  it('grants subscription management to operational roles and super admins', () => {
    for (const role of [
      AdminRoleCode.FINANCE_ADMIN,
      AdminRoleCode.SUPPORT_ADMIN,
      AdminRoleCode.STORE_MANAGER,
      AdminRoleCode.SUPER_ADMIN,
    ]) {
      expect(
        hasPermission(
          permissionsForRole(role),
          P.BENTO_SUBSCRIPTION_MANAGE,
        ),
      ).toBe(true);
    }
  });
});
