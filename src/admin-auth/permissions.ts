import { AdminRoleCode } from '@prisma/client';

/** Action-based permissions for admin API routes. */
export const P = {
  ALL: '*',
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_WRITE_PROFILE: 'customer:write_profile',
  CUSTOMER_WRITE_IDENTITY: 'customer:write_identity',
  CUSTOMER_PHONE_CHANGE: 'customer:phone_change',
  CUSTOMER_EXPORT: 'customer:export',
  WALLET_READ: 'wallet:read',
  WALLET_ADJUST: 'wallet:adjust',
  WALLET_FREEZE: 'wallet:freeze',
  WALLET_REVERSE: 'wallet:reverse',
  WALLET_REVERSAL_REQUEST: 'wallet:reversal_request',
  WALLET_REVERSAL_APPROVE: 'wallet:reversal_approve',
  LOYALTY_ADJUST: 'loyalty:adjust',
  LOYALTY_READ: 'loyalty:read',
  VOUCHER_READ: 'voucher:read',
  VOUCHER_CREATE: 'voucher:create',
  VOUCHER_UPDATE: 'voucher:update',
  VOUCHER_ASSIGN: 'voucher:assign',
  VOUCHER_REVOKE: 'voucher:revoke',
  VOUCHER_GOODWILL: 'voucher:goodwill',
  CAMPAIGN_RUN: 'campaign:run',
  SEGMENT_MANAGE: 'segment:manage',
  SEGMENT_EXPORT: 'segment:export',
  IMPORT_COMMIT: 'import:commit',
  IMPORT_PREVIEW: 'import:preview',
  EXPORT_RUN: 'export:run',
  MASTER_MANAGE: 'master:manage',
  REPORT_VIEW: 'report:view',
  EMPLOYEE_READ: 'employee:read',
  EMPLOYEE_MANAGE: 'employee:manage',
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',
  ADMIN_MANAGE: 'admin:manage',
} as const;

export type PermissionKey = (typeof P)[keyof typeof P];

const set = (...keys: string[]) => new Set(keys);

/** Role → permission set (excluding SUPER which uses wildcard). */
export const ROLE_PERMISSIONS: Record<AdminRoleCode, Set<string>> = {
  [AdminRoleCode.SUPER_ADMIN]: set(P.ALL),
  [AdminRoleCode.CRM_ADMIN]: set(
    P.CUSTOMER_READ,
    P.CUSTOMER_WRITE_PROFILE,
    P.CUSTOMER_WRITE_IDENTITY,
    P.CUSTOMER_PHONE_CHANGE,
    P.CUSTOMER_EXPORT,
    P.VOUCHER_READ,
    P.VOUCHER_ASSIGN,
    P.WALLET_READ,
    P.LOYALTY_READ,
    P.AUDIT_READ,
    P.REPORT_VIEW,
    P.SEGMENT_MANAGE,
    P.SEGMENT_EXPORT,
  ),
  [AdminRoleCode.MARKETING_ADMIN]: set(
    P.CUSTOMER_READ,
    P.LOYALTY_READ,
    P.VOUCHER_READ,
    P.VOUCHER_CREATE,
    P.VOUCHER_UPDATE,
    P.VOUCHER_ASSIGN,
    P.CAMPAIGN_RUN,
    P.SEGMENT_MANAGE,
    P.SEGMENT_EXPORT,
    P.EXPORT_RUN,
    P.REPORT_VIEW,
    P.AUDIT_READ,
  ),
  [AdminRoleCode.FINANCE_ADMIN]: set(
    P.CUSTOMER_READ,
    P.WALLET_READ,
    P.WALLET_ADJUST,
    P.WALLET_FREEZE,
    P.WALLET_REVERSE,
    P.WALLET_REVERSAL_APPROVE,
    P.LOYALTY_ADJUST,
    P.LOYALTY_READ,
    P.IMPORT_PREVIEW,
    P.IMPORT_COMMIT,
    P.EXPORT_RUN,
    P.REPORT_VIEW,
    P.EMPLOYEE_READ,
    P.EMPLOYEE_MANAGE,
    P.AUDIT_READ,
    P.AUDIT_EXPORT,
  ),
  [AdminRoleCode.SUPPORT_ADMIN]: set(
    P.CUSTOMER_READ,
    P.WALLET_READ,
    P.LOYALTY_READ,
    P.VOUCHER_READ,
    P.VOUCHER_GOODWILL,
    P.WALLET_REVERSAL_REQUEST,
    P.AUDIT_READ,
    P.REPORT_VIEW,
    P.EMPLOYEE_READ,
  ),
  [AdminRoleCode.READONLY_ANALYST]: set(
    P.CUSTOMER_READ,
    P.CUSTOMER_EXPORT,
    P.WALLET_READ,
    P.LOYALTY_READ,
    P.VOUCHER_READ,
    P.REPORT_VIEW,
    P.EMPLOYEE_READ,
    P.AUDIT_READ,
    P.EXPORT_RUN,
    P.AUDIT_EXPORT,
  ),
  [AdminRoleCode.STORE_MANAGER]: set(
    P.CUSTOMER_READ,
    P.CUSTOMER_WRITE_PROFILE,
    P.WALLET_READ,
    P.LOYALTY_READ,
    P.VOUCHER_READ,
    P.REPORT_VIEW,
    P.EMPLOYEE_READ,
    P.EMPLOYEE_MANAGE,
  ),
};

export function permissionsForRole(role: AdminRoleCode): Set<string> {
  return new Set(ROLE_PERMISSIONS[role]);
}

export function hasPermission(
  granted: Set<string>,
  required: string,
): boolean {
  if (granted.has(P.ALL)) return true;
  return granted.has(required);
}
