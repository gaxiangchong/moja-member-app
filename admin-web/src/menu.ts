// Information architecture for the new admin shell — deliberately NOT a 1:1
// mirror of the legacy dashboard's DEFAULT_DASHBOARD_CONFIG.menuViews
// anymore. Consolidated per product direction:
//   - Bento and the shop catalog were split across two unrelated top-level
//     groups ("Bento" vs "Settings") even though they're the same sales
//     transaction — merged into one "Sales" group.
//   - Wallet/Loyalty/Campaigns/Gift-rewards were 4 separate top-level groups
//     for what is really one "points, vouchers & rewards" concern — merged
//     into "Rewards & Loyalty".
//   - Mailer moves under a new "Marketing" group.
//   - Standalone "Reports" removed — customer reports moved into Customers,
//     sales reporting moved into Finance (one financial view, not a
//     separate copy of the same numbers).
// View ids are frontend-only navigation keys (not tied to any backend
// permission code or route), so renaming/regrouping them here is safe.

export type MenuView = { id: string; label: string };
export type MenuGroup = { id: string; label: string; views: MenuView[] };

export const MENU: MenuGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    views: [
      { id: 'dashboard-overview', label: 'Overview' },
      { id: 'dashboard-activity', label: 'Activity' },
      { id: 'dashboard-employees', label: 'Employees' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    views: [
      { id: 'customers-list', label: 'All customers' },
      { id: 'customer-orders', label: 'Orders' },
      { id: 'customer-reports', label: 'Customer reports' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    views: [
      { id: 'sales-overview', label: 'Overview' },
      { id: 'sales-catalog', label: 'Catalog' },
      { id: 'sales-shop-layout', label: 'Shop layout' },
      { id: 'sales-popular-items', label: 'Popular items' },
      { id: 'sales-home-ads', label: 'Home ads' },
      { id: 'sales-bento-menu', label: 'Bento menu' },
      { id: 'sales-bento-pricing', label: 'Bento pricing' },
      { id: 'sales-operations', label: 'Operations' },
      { id: 'sales-orders', label: 'Orders' },
    ],
  },
  {
    id: 'rewards',
    label: 'Rewards & Loyalty',
    views: [
      { id: 'rewards-wallet', label: 'Points & wallet' },
      { id: 'rewards-voucher-campaigns', label: 'Voucher campaigns' },
      { id: 'rewards-voucher-redeem', label: 'Redeem voucher' },
      { id: 'rewards-bento-vouchers', label: 'Bento vouchers' },
      { id: 'rewards-gift-rewards', label: 'Gift rewards' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    views: [{ id: 'marketing-mailer', label: 'Mailer campaigns' }],
  },
  {
    id: 'finance',
    label: 'Finance',
    views: [
      { id: 'finance-overview', label: 'Overview' },
      { id: 'finance-transactions', label: 'Transactions' },
      { id: 'finance-daily', label: 'Daily report' },
      { id: 'finance-sales-analytics', label: 'Sales analytics' },
      { id: 'finance-sync', label: 'Sync' },
    ],
  },
  {
    id: 'data-tools',
    label: 'Data tools',
    views: [{ id: 'data-tools', label: 'Import / export' }],
  },
  {
    id: 'settings',
    label: 'Settings',
    views: [{ id: 'settings-system', label: 'System' }],
  },
  {
    id: 'audit',
    label: 'Audit',
    views: [{ id: 'audit', label: 'Audit log' }],
  },
];

/** Views with a real React component so far — everything else is a "coming soon" placeholder. */
export const IMPLEMENTED_VIEWS = new Set([
  'dashboard-overview',
  'customers-list',
  'customer-orders',
  'sales-catalog',
  'sales-shop-layout',
  'sales-popular-items',
  'sales-home-ads',
  'rewards-wallet',
  'rewards-voucher-campaigns',
  'rewards-voucher-redeem',
  'rewards-bento-vouchers',
  'rewards-gift-rewards',
]);

export const DEFAULT_VIEW = 'dashboard-overview';

export function groupIdForView(viewId: string): string | undefined {
  return MENU.find((g) => g.views.some((v) => v.id === viewId))?.id;
}
