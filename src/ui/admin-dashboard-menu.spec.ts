import {
  DASHBOARD_MENU,
  dashboardSidebarConfig,
  normalizeDashboardMenu,
  resolveDashboardMenu,
} from './admin-dashboard-menu';
import type { AdminDashboardMenuService } from './admin-dashboard-menu.service';
import { AdminDashboardController } from './admin-dashboard.controller';

const LEGACY = {
  menuGroups: {
    wallet: { showGroup: false, showSubmenu: true },
    mailer: { showGroup: false, showSubmenu: true },
  },
  menuViews: { 'bento-menu': true, 'customers-list': true },
};

describe('admin dashboard menu', () => {
  it('lists every sidebar item rendered by the dashboard', () => {
    const html = new AdminDashboardController(
      {} as AdminDashboardMenuService,
    ).getDashboard();
    const sidebar = html.slice(
      html.indexOf('<aside class="sidebar">'),
      html.indexOf('</aside>'),
    );
    const rendered = [...sidebar.matchAll(/data-view="([^"]+)"/g)]
      .map((m) => m[1])
      .sort();
    const catalog = DASHBOARD_MENU.flatMap((g) => g.views.map((v) => v.id));
    expect(catalog.sort()).toEqual(rendered);
  });

  it('keeps customers, loyalty, email marketing, and settings visible', () => {
    const hideAll = Object.fromEntries(
      DASHBOARD_MENU.flatMap((g) => g.views.map((v) => [v.id, false])),
    );
    const visible = resolveDashboardMenu({ views: hideAll }, LEGACY);
    for (const id of [
      'customers-merge',
      'loyalty-rules',
      'gift-rewards',
      'mailer-campaigns',
      'settings-system',
      'settings-menu',
    ]) {
      expect(visible[id]).toBe(true);
    }
    expect(visible['bento-menu']).toBe(false);
    expect(visible['audit']).toBe(false);
  });

  it('follows the legacy config until an admin saves a choice', () => {
    const visible = resolveDashboardMenu(null, LEGACY);
    expect(visible['bento-menu']).toBe(true);
    expect(visible['bento-sales']).toBe(false);
    expect(visible['wallet-balances']).toBe(false);

    const saved = resolveDashboardMenu(
      { views: { 'bento-sales': true, 'bento-menu': false } },
      LEGACY,
    );
    expect(saved['bento-sales']).toBe(true);
    expect(saved['bento-menu']).toBe(false);
    expect(saved['wallet-balances']).toBe(false);
  });

  it('hides a group once all of its items are hidden', () => {
    const visible = resolveDashboardMenu(
      { views: { audit: false, 'audit-logins': false } },
      {},
    );
    const cfg = dashboardSidebarConfig(visible);
    expect(cfg.menuGroups.audit.showGroup).toBe(false);
    expect(cfg.menuGroups.customers.showGroup).toBe(true);
  });

  it('forces locked items on and rejects unknown items when saving', () => {
    const saved = normalizeDashboardMenu({
      views: { 'mailer-campaigns': false, 'finance-daily': false },
    });
    expect(saved.views['mailer-campaigns']).toBe(true);
    expect(saved.views['finance-daily']).toBe(false);
    expect(() =>
      normalizeDashboardMenu({ views: { 'not-a-menu': true } }),
    ).toThrow('Unknown menu item');
    expect(() =>
      normalizeDashboardMenu({ views: { 'finance-daily': 'yes' } }),
    ).toThrow('must be true or false');
  });
});
