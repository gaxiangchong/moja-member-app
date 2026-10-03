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

  it('applies the SalesPlay preview the admin confirmed, not a later form edit', async () => {
    const html = new AdminDashboardController(
      {} as AdminDashboardMenuService,
    ).getDashboard();
    const src = [
      ...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g),
    ].map((m) => m[1])[0];
    const start = src.indexOf('function spInvalidateSyncPreview');
    const end = src.indexOf('function haAbsoluteImageUrl');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const chunk = src.slice(start, end);

    const posts: { url: string; body: { missingAction?: string } }[] = [];
    const confirms: string[] = [];
    let nextBody: { missingAction: string } = { missingAction: 'keep' };
    let holdPreviews = true;
    const pending: {
      url: string;
      body: { missingAction?: string };
      resolve: (plan: unknown) => void;
    }[] = [];

    function planFor(body: { missingAction?: string }) {
      const deleting = body.missingAction === 'delete';
      return {
        summary: {
          codesToWrite: 2,
          pricesToWrite: 0,
          productsToCreate: 0,
          variantsToCreate: 0,
          toHide: 0,
          toDelete: deleting ? 2 : 0,
        },
        catalogOnly: deleting
          ? [
              { action: 'delete', productId: 'a', productName: 'Citron Basque' },
              { action: 'delete', productId: 'b', productName: 'Pistachio Noir' },
            ]
          : [],
      };
    }

    // Compiles the served sync helpers with stubs. It is only called below.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const harness = new Function(
      'posts',
      'confirms',
      'pending',
      'readBody',
      'planFor',
      'holding',
      `
      var lastSpSyncPlan = null;
      var lastSpSyncBody = null;
      var spPreviewGen = 0;
      var spPreviewArmed = false;
      function spCollectBody() { return readBody(); }
      function apiPost(url, body) {
        posts.push({ url: url, body: body });
        if (url.indexOf('/apply') !== -1) {
          return Promise.resolve({
            productsUpdated: 0,
            productsCreated: 0,
            productsHidden: 0,
            productsDeleted: 0,
          });
        }
        if (!holding()) return Promise.resolve(planFor(body));
        return new Promise(function (resolve) {
          pending.push({ url: url, body: body, resolve: resolve });
        });
      }
      function spRenderPlan(plan) { lastSpSyncPlan = plan; }
      var document = { getElementById: function () { return { textContent: '' }; } };
      var window = {
        confirm: function (msg) { confirms.push(msg); return true; },
        prompt: function () { return String((lastSpSyncPlan.summary || {}).toDelete); },
      };
      function fmt(n) { return String(n); }
      function loadShopCatalog() { return Promise.resolve(); }
      ${chunk}
      return {
        preview: spSyncPreview,
        apply: spSyncApply,
        invalidate: spInvalidateSyncPreview,
        snapshot: function () { return { plan: lastSpSyncPlan, body: lastSpSyncBody }; },
      };
    `,
    )(
      posts,
      confirms,
      pending,
      () => nextBody,
      planFor,
      () => holdPreviews,
    ) as {
      preview: () => Promise<void>;
      apply: () => Promise<void>;
      invalidate: () => void;
      snapshot: () => {
        plan: { summary?: { toDelete?: number } } | null;
        body: { missingAction?: string } | null;
      };
    };

    // Preview "leave them alone", then the dropdown moves to delete before
    // Apply. The post must still be the confirmed preview. The refresh preview
    // that follows a successful apply should not block the assertion.
    const first = harness.preview();
    expect(harness.snapshot().plan).toBeNull();
    pending[0].resolve(planFor(pending[0].body));
    await first;
    expect(harness.snapshot().body).toEqual({ missingAction: 'keep' });

    nextBody = { missingAction: 'delete' };
    holdPreviews = false;
    await harness.apply();
    holdPreviews = true;
    const applied = posts.filter((p) => p.url.endsWith('/apply'));
    expect(applied).toHaveLength(1);
    expect(applied[0].body.missingAction).toBe('keep');
    expect(confirms.join(' ')).not.toContain('DELETE');

    // Switching to delete starts a new preview and drops the old plan, so
    // Apply in that gap cannot post the delete.
    posts.length = 0;
    confirms.length = 0;
    const pendingBefore = pending.length;
    const second = harness.preview();
    expect(harness.snapshot().plan).toBeNull();
    await harness.apply();
    expect(posts.filter((p) => p.url.endsWith('/apply'))).toHaveLength(0);
    pending[pendingBefore].resolve(planFor(pending[pendingBefore].body));
    await second;
    expect(harness.snapshot().body).toEqual({ missingAction: 'delete' });
    expect(harness.snapshot().plan?.summary?.toDelete).toBe(2);

    // An older preview must not overwrite the newer one when it lands late.
    nextBody = { missingAction: 'keep' };
    const older = harness.preview();
    const olderCall = pending[pending.length - 1];
    nextBody = { missingAction: 'delete' };
    const newer = harness.preview();
    const newerCall = pending[pending.length - 1];
    newerCall.resolve(planFor(newerCall.body));
    await newer;
    olderCall.resolve(planFor(olderCall.body));
    await older;
    expect(harness.snapshot().body).toEqual({ missingAction: 'delete' });

    harness.invalidate();
    expect(harness.snapshot().plan).toBeNull();
    expect(harness.snapshot().body).toBeNull();
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
