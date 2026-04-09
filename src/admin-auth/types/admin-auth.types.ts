import type { AdminRoleCode } from '@prisma/client';

export type AdminAuthKind = 'user' | 'api_key';

export interface AdminAuthState {
  kind: AdminAuthKind;
  /** For audit actorId string (legacy column). */
  actorLabel: string;
  permissions: Set<string>;
  isSuper: boolean;
  adminUserId?: string;
  role?: AdminRoleCode | string;
  email?: string;
  ip?: string;
}
