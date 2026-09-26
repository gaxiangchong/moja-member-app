import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { auditActorBase } from '../admin-auth/audit-context.util';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  DashboardMenuError,
  dashboardMenuSettings,
  dashboardSidebarConfig,
  normalizeDashboardMenu,
  resolveDashboardMenu,
  type LegacyDashboardConfig,
  type SavedDashboardMenu,
} from './admin-dashboard-menu';

const SETTINGS_KEY = 'admin_dashboard_menu';

/** Used when neither a saved menu nor `admin-dashboard.config.json` exists. */
const DEFAULT_DASHBOARD_CONFIG: LegacyDashboardConfig = {
  menuGroups: {
    dashboard: { showGroup: false, showSubmenu: true },
    customers: { showGroup: true, showSubmenu: true },
    bento: { showGroup: true, showSubmenu: true },
    wallet: { showGroup: false, showSubmenu: true },
    loyalty: { showGroup: true, showSubmenu: true },
    campaigns: { showGroup: false, showSubmenu: true },
    mailer: { showGroup: true, showSubmenu: true },
    'data-tools': { showGroup: false, showSubmenu: true },
    finance: { showGroup: true, showSubmenu: true },
    reports: { showGroup: false, showSubmenu: true },
    settings: { showGroup: true, showSubmenu: true },
    audit: { showGroup: false, showSubmenu: true },
  },
  menuViews: {
    'dashboard-overview': true,
    'dashboard-activity': true,
    'dashboard-employees': true,
    'customers-list': true,
    'customer-orders': true,
    'bento-overview': true,
    'bento-sales': true,
    'bento-menu': true,
    'bento-pricing': true,
    'bento-operations': true,
    'bento-orders': true,
    'bento-vouchers': true,
    'voucher-campaigns': true,
    'voucher-redeem': true,
    'gift-rewards': true,
    'mailer-campaigns': true,
    'settings-shopping-catalog': true,
    'settings-shop-layout': true,
    'settings-popular-items': true,
    'settings-home-ads': true,
    'settings-system': true,
    'reports-customers': true,
    'reports-sales': true,
    'finance-overview': true,
    'finance-transactions': true,
    'finance-daily': true,
    'finance-sync': true,
  },
};

/**
 * Sidebar visibility for the legacy admin dashboard. Admin choices live in
 * `app_settings`; until the first save, `admin-dashboard.config.json` applies.
 */
@Injectable()
export class AdminDashboardMenuService {
  private readonly logger = new Logger(AdminDashboardMenuService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async sidebarConfig() {
    const { visible } = await this.resolve();
    return dashboardSidebarConfig(visible);
  }

  async settings() {
    const { visible, saved } = await this.resolve();
    return dashboardMenuSettings(visible, saved !== null);
  }

  async save(input: unknown, auth: AdminAuthState) {
    let next: SavedDashboardMenu;
    try {
      next = normalizeDashboardMenu(input);
    } catch (err) {
      throw new BadRequestException({
        code: 'DASHBOARD_MENU_INVALID',
        message: err instanceof DashboardMenuError ? err.message : String(err),
      });
    }
    const before = await this.readSaved();
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'admin_dashboard.menu_updated',
      entityType: SETTINGS_KEY,
      beforeValue: before ?? undefined,
      afterValue: next,
    });
    return this.settings();
  }

  async reset(auth: AdminAuthState) {
    const before = await this.readSaved();
    await this.prisma.appSetting.deleteMany({ where: { key: SETTINGS_KEY } });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'admin_dashboard.menu_reset',
      entityType: SETTINGS_KEY,
      beforeValue: before ?? undefined,
    });
    return this.settings();
  }

  private async resolve() {
    const saved = await this.readSaved();
    const visible = resolveDashboardMenu(saved, this.readLegacyConfig());
    return { visible, saved };
  }

  private async readSaved(): Promise<SavedDashboardMenu | null> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row) return null;
    const views = (row.value as { views?: unknown } | null)?.views;
    if (!views || typeof views !== 'object' || Array.isArray(views)) {
      this.logger.error(`${SETTINGS_KEY} is invalid and was ignored.`);
      return null;
    }
    return { views: views as Record<string, boolean> };
  }

  private readLegacyConfig(): LegacyDashboardConfig {
    const path = resolve(process.cwd(), 'admin-dashboard.config.json');
    if (!existsSync(path)) return DEFAULT_DASHBOARD_CONFIG;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
      if (!parsed || typeof parsed !== 'object')
        return DEFAULT_DASHBOARD_CONFIG;
      const cfg = parsed as LegacyDashboardConfig;
      return {
        menuGroups: {
          ...DEFAULT_DASHBOARD_CONFIG.menuGroups,
          ...(cfg.menuGroups && typeof cfg.menuGroups === 'object'
            ? cfg.menuGroups
            : {}),
        },
        menuViews: {
          ...DEFAULT_DASHBOARD_CONFIG.menuViews,
          ...(cfg.menuViews && typeof cfg.menuViews === 'object'
            ? cfg.menuViews
            : {}),
        },
      };
    } catch {
      return DEFAULT_DASHBOARD_CONFIG;
    }
  }
}
