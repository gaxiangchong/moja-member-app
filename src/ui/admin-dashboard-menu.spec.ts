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

  it('serves a page script that parses', () => {
    // The dashboard's JS is a string inside a TS template literal, so an
    // escape that works in TS can emit broken JS — `'a\n'` in the source
    // becomes a literal newline in the served string, which is a syntax
    // error the compiler never sees. `new Function` compiles without running.
    const html = new AdminDashboardController(
      {} as AdminDashboardMenuService,
    ).getDashboard();
    const scripts = [
      ...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g),
    ].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) {
      // Compiling our own served output is the check; it is never called.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      expect(() => new Function(src)).not.toThrow();
    }
  });

  it('lets an admin hide every item except Menu visibility', () => {
    const hideAll = Object.fromEntries(
      DASHBOARD_MENU.flatMap((g) => g.views.map((v) => [v.id, false])),
    );
    const visible = resolveDashboardMenu({ views: hideAll }, LEGACY);
    // Previously customers / loyalty / mailer / settings were forced on; the
    // admin now owns all of them.
    for (const id of [
      'customers-merge',
      'loyalty-rules',
      'gift-rewards',
      'mailer-campaigns',
      'settings-system',
      'bento-menu',
      'audit',
    ]) {
      expect(visible[id]).toBe(false);
    }
    // The one exception, so the menu can always be changed back.
    expect(visible['settings-menu']).toBe(true);
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

  it('forces only Menu visibility on, and rejects unknown items', () => {
    const saved = normalizeDashboardMenu({
      views: {
        'mailer-campaigns': false,
        'finance-daily': false,
        'settings-menu': false,
      },
    });
    expect(saved.views['mailer-campaigns']).toBe(false);
    expect(saved.views['finance-daily']).toBe(false);
    // Ignores an attempt to hide the escape hatch rather than failing the save.
    expect(saved.views['settings-menu']).toBe(true);
    expect(() =>
      normalizeDashboardMenu({ views: { 'not-a-menu': true } }),
    ).toThrow('Unknown menu item');
    expect(() =>
      normalizeDashboardMenu({ views: { 'finance-daily': 'yes' } }),
    ).toThrow('must be true or false');
  });

  it('can hide a previously locked group entirely', () => {
    const visible = resolveDashboardMenu(
      { views: { 'mailer-campaigns': false } },
      {},
    );
    const cfg = dashboardSidebarConfig(visible);
    expect(cfg.menuGroups.mailer.showGroup).toBe(false);
  });
});
