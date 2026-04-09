import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'admin_permissions';

/** Require these permissions (any authenticated admin if omitted). API key bypasses = superuser. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
