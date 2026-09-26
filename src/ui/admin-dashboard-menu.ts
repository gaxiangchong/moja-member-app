/**
 * Legacy admin dashboard sidebar: groups and items as rendered in
 * `admin-dashboard.controller.ts`. Keys match `data-menu-group` / `data-view`.
 */
export type DashboardMenuView = { id: string; label: string };
export type DashboardMenuGroup = {
  key: string;
  label: string;
  views: DashboardMenuView[];
};

export const DASHBOARD_MENU: DashboardMenuGroup[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    views: [
      { id: 'dashboard-overview', label: 'Overview' },
      { id: 'dashboard-activity', label: 'Activity feed' },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    views: [
      { id: 'customers-list', label: 'Customer list' },
      { id: 'customer-orders', label: 'Customer orders' },
      { id: 'customers-segments', label: 'Tags / segments' },
      { id: 'customers-merge', label: 'Merge duplicates' },
    ],
  },
  {
    key: 'bento',
    label: 'Bento (meal plans)',
    views: [
      { id: 'bento-overview', label: 'Overview & members' },
      { id: 'bento-sales', label: 'Sales & transactions' },
      { id: 'bento-menu', label: 'Weekly menu' },
      { id: 'bento-pricing', label: 'Packages & pricing' },
      { id: 'bento-operations', label: 'Capacity & schedule' },
      { id: 'bento-orders', label: 'Kitchen orders export' },
      { id: 'bento-vouchers', label: 'Discount vouchers' },
    ],
  },
  {
    key: 'wallet',
    label: 'Wallet',
    views: [
      { id: 'wallet-balances', label: 'Wallet balances' },
      { id: 'wallet-transactions', label: 'Wallet transactions' },
      { id: 'wallet-adjustment', label: 'Manual adjustment' },
      { id: 'wallet-rules', label: 'Top-up bonus rules' },
    ],
  },
  {
    key: 'loyalty',
    label: 'Loyalty & rewards',
    views: [
      { id: 'loyalty-balances', label: 'Points balances' },
      { id: 'loyalty-transactions', label: 'Loyalty transactions' },
      { id: 'loyalty-rules', label: 'Points rules' },
      { id: 'loyalty-campaigns', label: 'Bonus campaigns' },
      { id: 'voucher-campaigns', label: 'Vouchers' },
      { id: 'voucher-redeem', label: 'Redeem voucher (in-store)' },
      { id: 'gift-rewards', label: 'Gift rewards' },
    ],
  },
  {
    key: 'campaigns',
    label: 'Campaigns',
    views: [
      { id: 'campaigns-segments', label: 'Customer segments' },
      { id: 'campaigns-push-voucher', label: 'Push voucher' },
      { id: 'campaigns-push-points', label: 'Push points' },
      { id: 'campaigns-push-wallet', label: 'Push wallet bonus' },
      { id: 'campaigns-history', label: 'Campaign history' },
    ],
  },
  {
    key: 'mailer',
    label: 'Email marketing',
    views: [{ id: 'mailer-campaigns', label: 'Email campaigns' }],
  },
  {
    key: 'data-tools',
    label: 'Data Tools',
    views: [
      { id: 'data-import', label: 'Import data' },
      { id: 'data-export', label: 'Export data' },
      { id: 'data-templates', label: 'Template downloads' },
      { id: 'data-import-history', label: 'Import history' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    views: [
      { id: 'finance-overview', label: 'Revenue overview' },
      { id: 'finance-transactions', label: 'All transactions' },
      { id: 'finance-daily', label: 'Daily close' },
      { id: 'finance-sync', label: 'POS sync health' },
    ],
  },
  {
    key: 'reports',
    label: 'Sales & reports',
    views: [
      { id: 'reports-sales', label: 'Sales & transactions' },
      { id: 'reports-customers', label: 'Customer reports' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    views: [
      { id: 'settings-shopping-catalog', label: 'Shopping catalog' },
      { id: 'settings-shop-layout', label: 'Shop layout' },
      { id: 'settings-popular-items', label: 'Popular items' },
      { id: 'settings-home-ads', label: 'Home ad carousel' },
      { id: 'dashboard-employees', label: 'Employees & payroll' },
      { id: 'settings-system', label: 'System config' },
      { id: 'settings-menu', label: 'Menu visibility' },
    ],
  },
  {
    key: 'audit',
    label: 'Audit',
    views: [
      { id: 'audit', label: 'Audit logs' },
      { id: 'audit-logins', label: 'Admin login logs' },
    ],
  },
];

/** Groups that stay visible whatever is saved, so admins cannot hide core tools. */
export const LOCKED_MENU_GROUPS: ReadonlySet<string> = new Set([
  'customers',
  'loyalty',
  'mailer',
  'settings',
]);

/** Shape of the older `admin-dashboard.config.json` file (and its built-in default). */
export type LegacyDashboardConfig = {
  menuGroups?: Record<string, { showGroup?: boolean; showSubmenu?: boolean }>;
  menuViews?: Record<string, boolean>;
};

/** Saved in `app_settings` once an admin uses Settings → Menu visibility. */
export type SavedDashboardMenu = { views: Record<string, boolean> };

export class DashboardMenuError extends Error {}

function legacyVisible(
  legacy: LegacyDashboardConfig,
  groupKey: string,
  viewId: string,
): boolean {
  const group = legacy.menuGroups?.[groupKey] ?? {};
  if (group.showGroup === false || group.showSubmenu === false) return false;
  const whitelist = legacy.menuViews ?? {};
  if (Object.keys(whitelist).length === 0) return true;
  return whitelist[viewId] === true;
}

/**
 * Visibility of every menu item. Locked groups are always shown; otherwise a
 * saved choice wins, and items without one follow the legacy config file.
 */
export function resolveDashboardMenu(
  saved: SavedDashboardMenu | null,
  legacy: LegacyDashboardConfig,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const group of DASHBOARD_MENU) {
    for (const view of group.views) {
      if (LOCKED_MENU_GROUPS.has(group.key)) {
        out[view.id] = true;
      } else if (saved && typeof saved.views[view.id] === 'boolean') {
        out[view.id] = saved.views[view.id];
      } else {
        out[view.id] = legacyVisible(legacy, group.key, view.id);
      }
    }
  }
  return out;
}

/** Validates an admin's save: known item ids only, locked items forced on. */
export function normalizeDashboardMenu(input: unknown): SavedDashboardMenu {
  const raw =
    input && typeof input === 'object'
      ? (input as { views?: unknown }).views
      : undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DashboardMenuError(
      'Send { views: { "<item id>": true|false } }.',
    );
  }
  const entries = raw as Record<string, unknown>;
  const views: Record<string, boolean> = {};
  for (const group of DASHBOARD_MENU) {
    const locked = LOCKED_MENU_GROUPS.has(group.key);
    for (const view of group.views) {
      const value = entries[view.id];
      if (locked) {
        views[view.id] = true;
      } else if (typeof value === 'boolean') {
        views[view.id] = value;
      } else if (value !== undefined) {
        throw new DashboardMenuError(`"${view.id}" must be true or false.`);
      }
    }
  }
  const known = new Set(
    DASHBOARD_MENU.flatMap((g) => g.views.map((v) => v.id)),
  );
  const unknown = Object.keys(entries).filter((id) => !known.has(id));
  if (unknown.length) {
    throw new DashboardMenuError(`Unknown menu item: ${unknown.join(', ')}.`);
  }
  return { views };
}

/** Payload for `GET /admin-dashboard/config.json`, read by the sidebar script. */
export function dashboardSidebarConfig(visible: Record<string, boolean>) {
  const menuGroups: Record<string, { showGroup: boolean; showSubmenu: true }> =
    {};
  for (const group of DASHBOARD_MENU) {
    menuGroups[group.key] = {
      showGroup: group.views.some((v) => visible[v.id]),
      showSubmenu: true,
    };
  }
  return { menuGroups, menuViews: visible };
}

/** Payload for the Settings → Menu visibility page. */
export function dashboardMenuSettings(
  visible: Record<string, boolean>,
  customized: boolean,
) {
  return {
    customized,
    groups: DASHBOARD_MENU.map((group) => ({
      key: group.key,
      label: group.label,
      locked: LOCKED_MENU_GROUPS.has(group.key),
      views: group.views.map((v) => ({
        id: v.id,
        label: v.label,
        visible: visible[v.id] === true,
      })),
    })),
  };
}
