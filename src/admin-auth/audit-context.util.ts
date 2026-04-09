import type { AuditActorType } from '../audit/audit.service';
import type { AdminAuthState } from './types/admin-auth.types';

export function auditActorBase(auth: AdminAuthState): {
  actorType: AuditActorType;
  actorId: string;
  adminUserId: string | null;
  adminRole: string | null;
  ipAddress: string | null;
} {
  return {
    actorType: 'admin',
    actorId: auth.actorLabel,
    adminUserId: auth.kind === 'user' ? (auth.adminUserId ?? null) : null,
    adminRole: auth.kind === 'user' && auth.role != null ? String(auth.role) : null,
    ipAddress: auth.ip ?? null,
  };
}
