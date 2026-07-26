import { Controller, Get, Header } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_DASHBOARD_CONFIG = {
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

@Controller()
export class AdminDashboardController {
  @Get('admin-dashboard/config.json')
  getDashboardConfig() {
    return this.readDashboardConfig();
  }

  private readDashboardConfig() {
    const path = resolve(process.cwd(), 'admin-dashboard.config.json');
    if (!existsSync(path)) return DEFAULT_DASHBOARD_CONFIG;
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object')
        return DEFAULT_DASHBOARD_CONFIG;
      const pg =
        parsed.menuGroups && typeof parsed.menuGroups === 'object'
          ? parsed.menuGroups
          : {};
      const pv =
        parsed.menuViews && typeof parsed.menuViews === 'object'
          ? parsed.menuViews
          : {};
      return {
        ...DEFAULT_DASHBOARD_CONFIG,
        ...parsed,
        menuGroups: { ...DEFAULT_DASHBOARD_CONFIG.menuGroups, ...pg },
        menuViews: { ...DEFAULT_DASHBOARD_CONFIG.menuViews, ...pv },
      };
    } catch {
      return DEFAULT_DASHBOARD_CONFIG;
    }
  }

  @Get('admin-dashboard')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getDashboard(): string {
    const shopWebOrigin = (
      process.env.SHOP_WEB_BASE_URL || 'http://localhost:3000'
    )
      .trim()
      .replace(/\/$/, '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Moja Member Admin</title>
  <style>
    :root {
      --sidebar-bg: #151b2e;
      --sidebar-border: #252f4a;
      --sidebar-text: #cbd5e1;
      --sidebar-muted: #64748b;
      --sidebar-active: #1e293b;
      --sidebar-accent: #3b82f6;
      --main-bg: #e8edf3;
      --surface: #ffffff;
      --text: #0f172a;
      --text-muted: #475569;
      --border: #cbd5e1;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --banner-bg: #dbeafe;
      --banner-border: #93c5fd;
      --banner-text: #1e3a5f;
      --table-head-bg: #bfdbfe;
      --table-head-text: #1e3a5f;
      --shadow: 0 1px 3px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.06);
      --radius: 8px;
      --radius-lg: 12px;
      --ok: #059669;
      --danger: #dc2626;
    }
    .sa-page { max-width: 1200px; margin: 0 auto; padding: 0 0 28px; }
    .sa-toolbar {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      padding: 14px 18px;
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 12px 16px;
      margin-bottom: 16px;
    }
    .sa-toolbar-group { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .sa-toolbar-group label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }
    .sa-toolbar-group input[type="date"],
    .sa-toolbar-group select {
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 13px;
      font-family: inherit;
      background: #fff;
      color: var(--text);
      min-width: 0;
    }
    .sa-toolbar-presets { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .sa-toolbar-actions { margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .sa-kpi-strip {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    @media (max-width: 1020px) {
      .sa-kpi-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 520px) {
      .sa-kpi-strip { grid-template-columns: 1fr; }
    }
    .sa-kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      padding: 14px 16px 16px;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .sa-kpi-card:hover { border-color: #93c5fd; }
    .sa-kpi-card.is-active {
      border-color: var(--primary);
      box-shadow: var(--shadow), inset 0 -3px 0 var(--primary);
    }
    .sa-kpi-card-title { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .sa-kpi-card-value { font-size: 24px; font-weight: 700; color: var(--text); margin-top: 6px; line-height: 1.15; font-variant-numeric: tabular-nums; }
    .sa-kpi-card-delta { font-size: 12px; margin-top: 6px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .sa-kpi-card-delta .sa-pos { color: var(--ok); font-weight: 600; }
    .sa-kpi-card-delta .sa-neg { color: var(--danger); font-weight: 600; }
    .sa-chart-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      padding: 16px 18px 12px;
      margin-bottom: 16px;
    }
    .sa-chart-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .sa-chart-head-title { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .sa-chart-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .sa-chart-controls select { padding: 6px 10px; border-radius: var(--radius); border: 1px solid var(--border); font-size: 13px; background: #fff; }
    .sa-line-chart-wrap { width: 100%; overflow-x: auto; padding: 4px 0 8px; }
    .sa-line-chart-wrap svg { display: block; min-width: 480px; width: 100%; height: auto; }
    .sa-chart-axis { font-size: 11px; fill: var(--text-muted); }
    .sa-chart-grid { stroke: #e2e8f0; stroke-width: 1; }
    .sa-chart-line { fill: none; stroke: var(--primary); stroke-width: 2.25; stroke-linejoin: round; stroke-linecap: round; }
    .sa-chart-area { fill: rgba(37, 99, 235, 0.08); stroke: none; }
    .sa-chart-dot { fill: #fff; stroke: var(--primary); stroke-width: 2; }
    .sa-substats {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
      padding: 0 2px 14px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 14px;
    }
    .sa-substats strong { color: var(--text); font-weight: 600; }
    .sa-split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    @media (max-width: 900px) { .sa-split { grid-template-columns: 1fr; } }
    .sa-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .sa-panel-head { padding: 12px 18px; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 700; color: var(--text); }
    .sa-panel-body { padding: 0 0 12px; font-size: 13px; line-height: 1.55; color: var(--text); }
    .sa-panel-body-inner { padding: 12px 18px 4px; }
    .sa-export-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px 10px;
      border-bottom: 1px solid var(--border);
    }
    .sa-export-head h3 { margin: 0; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; color: var(--text); }
    .sa-export-block .table-wrap { border-radius: 0; border: none; }
    .sa-export-block table.data thead { background: var(--table-head-bg); color: var(--table-head-text); }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: var(--text); background: var(--main-bg); font-size: 14px; }
    .layout { display: grid; grid-template-columns: 268px 1fr; min-height: 100vh; }
    .sidebar {
      background: var(--sidebar-bg);
      border-right: 1px solid var(--sidebar-border);
      display: flex;
      flex-direction: column;
      padding: 0 0 16px;
    }
    .sidebar-brand {
      padding: 22px 20px 18px;
      border-bottom: 1px solid var(--sidebar-border);
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }
    .sidebar-brand small { display: block; font-size: 11px; font-weight: 600; color: var(--sidebar-muted); margin-top: 4px; letter-spacing: 0.04em; text-transform: uppercase; }
    .nav-scroll { flex: 1; overflow-y: auto; padding: 12px 10px; }
    .nav-group { margin-bottom: 6px; }
    .nav-group summary {
      list-style: none;
      cursor: pointer;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 700;
      color: var(--sidebar-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .nav-group summary::-webkit-details-marker { display: none; }
    .nav-group summary::after {
      content: '';
      margin-left: auto;
      width: 6px; height: 6px;
      border-right: 1.5px solid var(--sidebar-muted);
      border-bottom: 1.5px solid var(--sidebar-muted);
      transform: rotate(-45deg);
      transition: transform 0.15s;
    }
    .nav-group:not([open]) summary::after { transform: rotate(45deg); }
    .nav-group .nav-items { padding: 4px 0 8px; display: flex; flex-direction: column; gap: 2px; }
    .nav-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      border-radius: var(--radius);
      color: var(--sidebar-text);
      padding: 10px 12px 10px 14px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }
    .nav-btn svg { flex-shrink: 0; opacity: 0.85; }
    .nav-btn:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .nav-btn.active {
      background: var(--sidebar-active);
      color: #fff;
      box-shadow: inset 3px 0 0 var(--sidebar-accent);
    }
    .nav-btn.nav-sub {
      padding-left: 30px;
      font-size: 13px;
      color: #94a3b8;
    }
    .nav-btn.nav-sub svg { width: 16px; height: 16px; opacity: 0.75; }
    .nav-btn.nav-sub.active { color: #fff; }
    .coming-soon {
      margin-top: 16px;
      padding: 20px;
      background: #f8fafc;
      border: 1px dashed var(--border);
      border-radius: var(--radius);
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .sidebar-footer {
      margin-top: auto;
      padding: 12px 16px;
      border-top: 1px solid var(--sidebar-border);
      font-size: 12px;
      color: var(--sidebar-muted);
    }
    .main { display: flex; flex-direction: column; min-width: 0; }
    .top-bar {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 12px 28px;
    }
    .connection-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .connection-status {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: var(--text);
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #f97316;
      box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
    }
    .status-dot.connected {
      background: var(--ok);
      box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
    }
    .connection-meta {
      font-size: 12px;
      color: var(--text-muted);
    }
    .auth-form-grid {
      display: grid;
      gap: 12px;
    }
    .auth-mode-tabs {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      background: #f8fafc;
    }
    .auth-mode-btn {
      border: none;
      background: transparent;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
    }
    .auth-mode-btn.active {
      background: #fff;
      color: var(--text);
      box-shadow: inset 0 -2px 0 var(--primary);
    }
    .muted-hint { font-size: 12px; color: var(--text-muted); width: 100%; margin: 0; }
    .btn-outline {
      background: #fff !important;
      color: var(--text) !important;
      border: 1px solid var(--border) !important;
    }
    .btn-outline:hover { background: #f8fafc !important; }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 9px 18px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary:hover { background: var(--primary-hover); }
    .page { padding: 20px 28px 40px; flex: 1; }
    .page-title-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 6px; flex-wrap: wrap; }
    .page-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 10px; }
    .page-title svg { opacity: 0.7; }
    .phase-badge {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--primary);
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 5px 10px;
      border-radius: 999px;
    }
    .tabs {
      display: flex;
      gap: 0;
      margin-top: 18px;
      border-bottom: 2px solid var(--border);
    }
    .tabs.hidden { display: none; }
    .tab {
      background: transparent;
      border: none;
      padding: 12px 20px 14px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
      cursor: pointer;
      position: relative;
      margin-bottom: -2px;
    }
    .tab:hover { color: var(--text); }
    .tab.active {
      color: #fff;
      background: var(--primary);
      border-radius: var(--radius) var(--radius) 0 0;
    }
    .tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-bottom-color: var(--main-bg);
    }
    .tab:disabled { opacity: 0.45; cursor: not-allowed; }
    .info-banner {
      margin-top: 16px;
      padding: 12px 16px;
      background: var(--banner-bg);
      border: 1px solid var(--banner-border);
      border-radius: var(--radius);
      color: var(--banner-text);
      font-size: 13px;
      line-height: 1.45;
    }
    .info-banner code { background: rgba(255,255,255,0.6); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
    .vrh-shell { margin-top: 0; }
    .vrh-hero {
      background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
      color: #e2e8f0;
      border-radius: var(--radius-lg);
      padding: 20px 22px 18px;
      margin-bottom: 16px;
      box-shadow: var(--shadow);
    }
    .vrh-hero h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
    .vrh-hero p { margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8; max-width: 720px; }
    .vrh-hero a { color: #93c5fd; }
    .vrh-tabbar {
      display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;
      border-bottom: 1px solid var(--border); padding-bottom: 2px;
    }
    .vrh-tab {
      border: 1px solid transparent; background: transparent;
      padding: 10px 14px; font-size: 12px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted);
      border-radius: var(--radius) var(--radius) 0 0; cursor: pointer;
    }
    .vrh-tab:hover { color: var(--text); background: rgba(37, 99, 235, 0.06); }
    .vrh-tab.active {
      color: var(--primary); background: var(--surface);
      border-color: var(--border); border-bottom-color: var(--surface); margin-bottom: -1px;
      box-shadow: 0 -2px 0 var(--primary) inset;
    }
    .vrh-stepper { display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }
    .vrh-step {
      flex: 1; min-width: 100px; text-align: center; padding: 8px 10px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--text-muted); background: #f1f5f9; border-radius: var(--radius); border: 1px solid var(--border);
    }
    .vrh-step.is-current { background: #eff6ff; color: var(--primary); border-color: #93c5fd; }
    .vrh-step.is-done { background: #ecfdf5; color: #047857; border-color: #6ee7b7; }
    .vrh-wiz-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
      box-shadow: var(--shadow); padding: 20px 22px; max-width: 640px;
    }
    .vrh-offer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
    @media (max-width: 640px) { .vrh-offer-grid { grid-template-columns: 1fr; } }
    .vrh-offer-card {
      border: 2px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; cursor: pointer;
      text-align: left; background: #fff; transition: border-color 0.15s, box-shadow 0.15s;
    }
    .vrh-offer-card:hover { border-color: #93c5fd; }
    .vrh-offer-card.is-selected { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
    .vrh-offer-card strong { display: block; font-size: 14px; margin-bottom: 4px; color: var(--text); }
    .vrh-offer-card span { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
    .vrh-wiz-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; align-items: center; }
    .kpi-panel {
      margin-top: 20px;
      background: var(--surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      border: 1px solid var(--border);
      padding: 20px 12px;
    }
    .kpi-panel h2 {
      margin: 0 0 16px 12px;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
    }
    .kpi {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border-radius: var(--radius);
      border: 1px solid transparent;
    }
    .kpi:hover { background: #f8fafc; border-color: #e2e8f0; }
    .kpi-icon {
      width: 40px;
      height: 40px;
      border-radius: var(--radius);
      background: #eff6ff;
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); line-height: 1.3; }
    .kpi-value { font-size: 22px; font-weight: 700; color: var(--text); margin-top: 4px; }
    .kpi-hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; line-height: 1.35; }
    .sheet {
      margin-top: 20px;
      background: var(--surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .sheet-head h2 { margin: 0; font-size: 16px; font-weight: 700; }
    .sheet-actions { display: flex; gap: 8px; }
    .btn-outline {
      background: #fff;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 8px 14px;
      border-radius: var(--radius);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-outline:hover { border-color: var(--primary); color: var(--primary); }
    .table-wrap { overflow-x: auto; }
    table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.data th {
      text-align: left;
      padding: 11px 14px;
      background: var(--table-head-bg);
      color: var(--table-head-text);
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid #93c5fd;
      white-space: nowrap;
    }
    table.data th .sort-hint { opacity: 0.5; font-weight: 400; margin-left: 4px; }
    table.data td { padding: 12px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
    table.data tbody tr:hover { background: #f8fafc; }
    .bento-orders-summary { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0 4px; }
    .bento-stat { flex: 1 1 120px; min-width: 110px; background: var(--surface, #fff); border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; }
    .bento-stat-num { display: block; font-size: 22px; font-weight: 700; line-height: 1.1; }
    .bento-stat-lbl { display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: .03em; }
    .bento-stat-warn { background: #fef9c3; border-color: #fde68a; }
    .bento-stat-warn .bento-stat-num { color: #854d0e; }
    .bento-date-group { margin: 0 0 16px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .bento-date-group-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 14px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
    .bento-date-group-title { font-weight: 700; font-size: 13px; }
    .bento-date-group-counts { font-size: 12px; color: var(--text-muted); }
    .bento-date-group .table-wrap { margin: 0; }
    .bento-date-group table.data th { background: #fff; }
    .bento-await-badge { display: inline-block; min-width: 20px; padding: 1px 8px; border-radius: 999px; background: #fef9c3; color: #854d0e; font-size: 12px; font-weight: 700; text-align: center; margin-left: 4px; }
    .pill { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; display: inline-block; }
    .pill.ok { background: #dcfce7; color: #166534; }
    .pill.warn { background: #fef9c3; color: #854d0e; }
    .pill.neutral { background: #f1f5f9; color: #475569; }
    .td-actions { text-align: right; white-space: nowrap; }
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: #fff;
      color: var(--primary);
      cursor: pointer;
      margin-left: 6px;
    }
    .icon-btn:hover { background: #eff6ff; border-color: #93c5fd; }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 1000;
    }
    .modal-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(560px, calc(100vw - 24px));
      max-height: calc(100vh - 40px);
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border-radius: var(--radius-lg);
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.28);
      border: 1px solid var(--border);
      z-index: 1001;
    }
    .modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .modal-head h2 { margin: 0; font-size: 17px; font-weight: 700; }
    .modal-body { padding: 18px 20px; overflow-y: auto; flex: 1; min-height: 0; }
    .modal-footer {
      padding: 14px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      flex-shrink: 0;
    }
    /* Sortable / filterable data table (shop catalog) */
    th.sc-sortable { cursor: pointer; user-select: none; white-space: nowrap; }
    th.sc-sortable:hover { color: var(--brand, #2563eb); }
    .sc-sort-ind { font-size: 10px; color: var(--text-muted); margin-left: 4px; }
    tr.sc-filter-row th { padding-top: 6px; padding-bottom: 6px; background: #f8fafc; }
    tr.sc-filter-row input, tr.sc-filter-row select {
      width: 100%;
      box-sizing: border-box;
      padding: 5px 7px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 12px;
      font-family: inherit;
      font-weight: 400;
    }
    .form-section { margin-bottom: 14px; }
    .form-section:last-child { margin-bottom: 0; }
    .form-section label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .form-section input, .form-section select, .form-section textarea {
      width: 100%;
      padding: 9px 11px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 13px;
      font-family: inherit;
    }
    .form-section textarea { min-height: 80px; resize: vertical; }
    .form-section .field-hint { font-weight: 400; font-size: 11px; color: var(--text-muted); margin-top: 4px; line-height: 1.35; }
    .form-row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    @media (max-width: 520px) {
      .form-row-2 { grid-template-columns: 1fr; }
    }
    /* Aligned campaign config form: two columns of label:input pairs where the
       inputs line up on a fixed label gutter. */
    .vc-form {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 28px;
      max-width: 780px;
    }
    .vc-form .vc-field {
      display: grid;
      grid-template-columns: 150px 1fr;
      align-items: center;
      gap: 10px;
    }
    .vc-form .vc-field--full { grid-column: 1 / -1; }
    .vc-form .vc-field label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin: 0;
      line-height: 1.25;
    }
    .vc-form .vc-field input,
    .vc-form .vc-field select {
      width: 100%;
      padding: 9px 11px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 13px;
      font-family: inherit;
    }
    @media (max-width: 640px) {
      .vc-form { grid-template-columns: 1fr; }
      .vc-form .vc-field { grid-template-columns: 130px 1fr; }
    }
    /* Bento weekly menu editor cells: stacked EN/中文 dish + description. */
    .bm-cell {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 160px;
      padding: 2px 0;
    }
    .bm-cell .bm-lbl {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-top: 8px;
    }
    .bm-cell .bm-lbl:first-child { margin-top: 0; }
    .bm-cell .bm-input {
      width: 100%;
      box-sizing: border-box;
      padding: 7px 9px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 12.5px;
      font-family: inherit;
      background: #fff;
    }
    .bm-cell .bm-input:disabled { background: #f1f5f9; color: #94a3b8; }
    .bm-cell textarea.bm-input { resize: vertical; line-height: 1.45; }
    .hidden { display: none !important; }
    body.login-locked { overflow: hidden; }
    .login-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      background: linear-gradient(165deg, #f8fafc 0%, #dbeafe 48%, var(--main-bg) 100%);
    }
    .login-card {
      width: min(440px, 100%);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow), 0 24px 48px rgba(15, 23, 42, 0.12);
      padding: 28px 26px 24px;
    }
    .login-brand {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 10px;
    }
    .login-brand span { color: var(--primary); }
    .login-title { margin: 0 0 6px; font-size: 24px; font-weight: 800; color: var(--text); }
    .login-lead { margin: 0 0 18px; font-size: 14px; line-height: 1.5; color: var(--text-muted); }
    .login-status {
      min-height: 20px;
      margin-top: 12px;
      font-size: 13px;
      line-height: 1.45;
      color: var(--danger);
    }
    .login-status.ok { color: var(--ok); }
    .tab-panel { margin-top: 0; }
    .muted-box { padding: 16px 20px; color: var(--text-muted); font-size: 13px; }
    .mk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px 20px; }
    .mk-span-2 { grid-column: 1 / -1; }
    @media (max-width: 1100px) { .mk-grid { grid-template-columns: 1fr; } }
    .mk-chart-wrap { min-height: 140px; }
    .mk-chart-title { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .mk-chart { display: flex; align-items: flex-end; gap: 4px; height: 140px; padding: 4px 0 22px; border-bottom: 1px solid var(--border); }
    .mk-chart.mk-chart-signups { height: 168px; }
    .mk-chart-scroll { overflow-x: auto; max-width: 100%; }
    .mk-bar-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
    .mk-bar { width: 100%; max-width: 14px; min-height: 2px; background: linear-gradient(180deg, #3b82f6, #1d4ed8); border-radius: 3px 3px 0 0; transition: height 0.2s; }
    .mk-legend { display: flex; flex-wrap: wrap; gap: 14px 18px; font-size: 12px; color: var(--text-muted); margin: 0 0 8px; align-items: center; }
    .mk-legend-item { display: inline-flex; align-items: center; gap: 6px; }
    .mk-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
    .mk-swatch.ref { background: #059669; }
    .mk-swatch.org { background: #3b82f6; }
    .mk-stack-tower {
      display: flex; flex-direction: column-reverse; width: 100%; max-width: 16px;
      min-height: 4px; margin: 0 auto 20px; border-radius: 4px; overflow: hidden; align-self: flex-end;
    }
    .mk-stack-seg { min-height: 1px; width: 100%; }
    .mk-stack-seg.org { background: #3b82f6; }
    .mk-stack-seg.ref { background: #059669; }
    .mk-spender-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    .mk-spender-head select { padding: 6px 10px; border-radius: var(--radius); border: 1px solid var(--border); font-size: 13px; }
    .mk-hbar-panel { padding: 4px 0 12px; min-height: 100px; }
    .mk-hbar-row { display: grid; grid-template-columns: minmax(72px, 1fr) 2.2fr minmax(56px, auto); gap: 8px; align-items: center; margin-bottom: 7px; font-size: 12px; }
    .mk-hbar-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
    .mk-hbar-track { height: 11px; background: #e2e8f0; border-radius: 6px; overflow: hidden; }
    .mk-hbar-fill { height: 100%; background: linear-gradient(90deg, #2563eb, #7c3aed); border-radius: 6px; min-width: 2px; transition: width 0.2s; }
    .mk-hbar-val { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-muted); }
    .mk-bar-lbl { font-size: 9px; color: var(--text-muted); margin-top: 4px; white-space: nowrap; transform: rotate(-55deg); transform-origin: top center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
    .mk-mini-table { font-size: 13px; }
    .mk-mini-table th { text-align: left; font-size: 11px; color: var(--text-muted); }
    .mk-mini-table td { padding: 4px 8px 4px 0; border-top: 1px solid #e2e8f0; }
    .customer-sort-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 0 20px 12px; }
    .customer-sort-bar label { font-size: 12px; color: var(--text-muted); margin-right: 4px; }
    .customer-sort-bar select, .customer-sort-bar input { padding: 6px 10px; border-radius: var(--radius); border: 1px solid var(--border); }
    .customer-pager { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: flex-end; padding: 12px 20px; }
    .customer-pager .pager-info { font-size: 12px; color: var(--text-muted); margin-right: auto; }
    @media (max-width: 960px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { border-right: none; border-bottom: 1px solid var(--sidebar-border); }
      .nav-scroll { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; }
      .nav-group { flex: 1 1 100%; }
      .nav-group .nav-items { flex-direction: row; flex-wrap: wrap; }
      .nav-btn { flex: 1 1 auto; min-width: 140px; }
    }
    .em-payslip {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      color: #000;
      background: #fff;
      border: 1px solid #000;
      padding: 14px 16px 18px;
      max-width: 820px;
      font-variant-numeric: tabular-nums;
    }
    .em-payslip-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid #000;
      margin-bottom: 10px;
    }
    .em-payslip-co { font-weight: 700; font-size: 14px; }
    .em-payslip-title { font-weight: 700; font-size: 13px; text-align: right; }
    .em-payslip-sub { font-size: 11px; font-weight: 400; margin-top: 4px; }
    .em-payslip-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 20px;
      margin-bottom: 12px;
      font-size: 11px;
    }
    .em-payslip-grid span:nth-child(odd) { font-weight: 600; }
    .em-payslip-2col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      border: 1px solid #000;
      margin-bottom: 10px;
    }
    .em-payslip-col { border-right: 1px solid #000; padding: 0; }
    .em-payslip-col:last-child { border-right: none; }
    .em-payslip-col h3 {
      margin: 0;
      padding: 6px 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      border-bottom: 1px solid #000;
      background: #f8fafc;
    }
    .em-payslip-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 4px 8px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 11px;
    }
    .em-payslip-row:last-child { border-bottom: none; }
    .em-payslip-row em { font-style: normal; text-align: right; min-width: 88px; }
    .em-payslip-foot {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 6px 8px;
      font-weight: 700;
      border-top: 1px solid #000;
      background: #f1f5f9;
      font-size: 11px;
    }
    .em-payslip-foot em { font-style: normal; text-align: right; min-width: 88px; }
    .em-payslip-net {
      margin-top: 8px;
      padding: 8px 10px;
      border: 1px solid #000;
      display: grid;
      grid-template-columns: 1fr auto;
      font-weight: 700;
      font-size: 12px;
    }
    .em-payslip-net em { font-style: normal; text-align: right; }
    .em-payslip-meta { font-size: 10px; color: #334155; margin-top: 10px; line-height: 1.45; }
    .em-payslip-sign {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #000;
      font-size: 11px;
    }
    .em-payslip-sign div { min-height: 48px; border-bottom: 1px solid #000; padding-top: 22px; }
    .em-payslip-lines { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 12px; }
    .em-payslip-lines th, .em-payslip-lines td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
    .em-payslip-lines th { background: #f8fafc; font-weight: 600; }
    .em-payslip-lines td.num, .em-payslip-lines th.num { text-align: right; }
    @media print {
      @page { margin: 10mm; }
      body * { visibility: hidden !important; }
      #emPayslipRoot, #emPayslipRoot * { visibility: visible !important; }
      #emPayslipRoot {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        max-height: none !important;
        overflow: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        border: none !important;
      }
      #emPayslipRoot .em-payslip {
        border: 1px solid #000;
        max-width: none;
        box-shadow: none;
      }
    }
  </style>
</head>
<body class="login-locked">
  <div id="loginScreen" class="login-screen">
    <div class="login-card" role="main">
      <div class="login-brand">Moja <span>Member admin</span></div>
      <h1 class="login-title">Sign in</h1>
      <p class="login-lead">Authenticate before accessing the back-office dashboard.</p>
      <div class="auth-form-grid">
        <div class="auth-mode-tabs">
          <button type="button" class="auth-mode-btn active" id="authTabKey">API key</button>
          <button type="button" class="auth-mode-btn" id="authTabJwt">Email &amp; password</button>
        </div>
        <div id="authKeyPanel">
          <div class="form-section" style="margin-top:0">
            <label for="apiKey">Admin API key</label>
            <input id="apiKey" type="password" placeholder="From ADMIN_API_KEYS in server env" autocomplete="off" />
          </div>
        </div>
        <div id="authJwtPanel" class="hidden">
          <div class="form-section" style="margin-top:0">
            <label for="adminEmail">Admin email</label>
            <input id="adminEmail" type="email" placeholder="admin@example.com" autocomplete="username" />
          </div>
          <div class="form-section">
            <label for="adminPassword">Password</label>
            <input id="adminPassword" type="password" placeholder="Password" autocomplete="current-password" />
          </div>
        </div>
        <p class="muted-hint" id="authHelpText">Use an API key for service access, or sign in with admin credentials.</p>
      </div>
      <button type="button" class="btn-primary" id="loginSubmitBtn" style="width:100%;margin-top:8px">Sign in</button>
      <p class="login-status" id="loginStatus" aria-live="polite"></p>
    </div>
  </div>

  <div id="dashboardApp" class="hidden">
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-brand">Moja <small>Member admin</small></div>
      <div class="nav-scroll">
        <details class="nav-group" data-menu-group="dashboard" open>
          <summary>Dashboard</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub active" data-view="dashboard-overview">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              Overview
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="dashboard-activity">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Activity feed
            </button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="customers" open>
          <summary>Customers</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="customers-list">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
              Customer list
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="customer-orders">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
              Customer orders
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="customers-segments">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><circle cx="12" cy="12" r="1"/></svg>
              Tags / segments
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="customers-merge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h10"/><path d="M6 12h12"/><path d="M8 18h10"/><path d="M4 12h.01"/></svg>
              Merge duplicates
            </button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="bento" open>
          <summary>Bento (meal plans)</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="bento-overview">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8a6 6 0 0 1-6 6H3"/><circle cx="7" cy="17" r="1"/></svg>
              Overview &amp; members
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="bento-sales">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-6 3 4 5-8"/></svg>
              Sales &amp; transactions
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="bento-menu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 4v6"/></svg>
              Weekly menu
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="bento-pricing">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Packages &amp; pricing
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="bento-operations">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Capacity &amp; schedule
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="bento-orders">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Kitchen orders export
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="bento-vouchers">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V21"/><path d="M7 12h.01M17 12h.01M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/></svg>
              Discount vouchers
            </button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="wallet" open>
          <summary>Wallet</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="wallet-balances">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              Wallet balances
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="wallet-transactions">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
              Wallet transactions
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="wallet-adjustment">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              Manual adjustment
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="wallet-rules">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Top-up bonus rules
            </button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="loyalty" open>
          <summary>Loyalty &amp; rewards</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="loyalty-balances">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Points balances
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="loyalty-transactions">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Loyalty transactions
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="loyalty-rules">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              Points rules
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="loyalty-campaigns">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
              Bonus campaigns
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="voucher-campaigns">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V21"/><path d="M7 12h.01M17 12h.01M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/></svg>
              Vouchers
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="voucher-redeem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
              Redeem voucher (in-store)
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="gift-rewards">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
              Gift rewards
            </button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="campaigns" open>
          <summary>Campaigns</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="campaigns-segments">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><circle cx="12" cy="12" r="1"/></svg>
              Customer segments
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="campaigns-push-voucher">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V21"/></svg>
              Push voucher
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="campaigns-push-points">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Push points
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="campaigns-push-wallet">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              Push wallet bonus
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="campaigns-history">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13a9 9 0 1 0 .5-4"/><polyline points="12 7 12 12 15 15"/></svg>
              Campaign history
            </button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="mailer" open>
          <summary>Email marketing</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="mailer-campaigns">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              Email campaigns
            </button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="data-tools" open>
          <summary>Data Tools</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="data-import">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Import data
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="data-export">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Export data
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="data-templates">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="7" y1="14" x2="14" y2="14"/></svg>
              Template downloads
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="data-import-history">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
              Import history
            </button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="finance" open>
          <summary>Finance</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="finance-overview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Revenue overview</button>
            <button type="button" class="nav-btn nav-sub" data-view="finance-transactions"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>All transactions</button>
            <button type="button" class="nav-btn nav-sub" data-view="finance-daily"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>Daily close</button>
            <button type="button" class="nav-btn nav-sub" data-view="finance-sync"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg>POS sync health</button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="reports" open>
          <summary>Sales &amp; reports</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="reports-sales"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-6 3 4 5-8"/></svg>Sales &amp; transactions</button>
            <button type="button" class="nav-btn nav-sub" data-view="reports-customers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>Customer reports</button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="settings" open>
          <summary>Settings</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="settings-shopping-catalog">Shopping catalog</button>
            <button type="button" class="nav-btn nav-sub" data-view="settings-shop-layout">Shop layout</button>
            <button type="button" class="nav-btn nav-sub" data-view="settings-popular-items">Popular items</button>
            <button type="button" class="nav-btn nav-sub" data-view="settings-home-ads">Home ad carousel</button>
            <button type="button" class="nav-btn nav-sub" data-view="dashboard-employees">Employees &amp; payroll</button>
            <button type="button" class="nav-btn nav-sub" data-view="settings-system">System config</button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="audit" open>
          <summary>Audit</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="audit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Audit logs
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="audit-logins">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Admin login logs
            </button>
          </div>
        </details>
      </div>
      <div class="sidebar-footer">Live data via <code style="color:#94a3b8">/admin/*</code></div>
    </aside>

    <main class="main">
      <div class="top-bar">
        <div class="connection-bar">
          <div>
            <div class="connection-status">
              <span id="connectionDot" class="status-dot"></span>
              <strong id="connectionStateText">Not connected</strong>
            </div>
            <div class="connection-meta" id="connectionMeta">Authenticate with API key or email/password to load data.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn-primary btn-outline" id="refreshDataBtn">Refresh data</button>
            <button type="button" class="btn-primary btn-outline" id="disconnectBtn">Sign out</button>
          </div>
        </div>
      </div>

      <div class="page">
        <div class="page-title-row">
          <h1 class="page-title" id="titleRow">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="titleIcon"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span id="title">Dashboard · Overview</span>
          </h1>
          <span class="phase-badge">Phase 1</span>
        </div>

        <div class="info-banner" id="statusPanel">Dashboard data loads from <code>/admin/*</code>. Use <strong>Refresh data</strong> to reload.</div>

        <section id="dashboard-overview" class="tab-panel">
          <div id="ovPanelMetrics">
            <div class="kpi-panel">
              <h2>Membership</h2>
              <div class="kpi-row">
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
                  <div><div class="kpi-label">Total members</div><div class="kpi-value" id="ovMembers">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                  <div><div class="kpi-label">Active members</div><div class="kpi-value" id="ovActive">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                  <div><div class="kpi-label">New today</div><div class="kpi-value" id="ovNewToday">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
                  <div><div class="kpi-label">New this week</div><div class="kpi-value" id="ovNewWeek">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
                  <div><div class="kpi-label">New this month</div><div class="kpi-value" id="ovNewMonth">-</div></div>
                </div>
              </div>
            </div>
            <div class="kpi-panel">
              <h2>Points &amp; wallet</h2>
              <div class="kpi-row">
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
                  <div><div class="kpi-label">Points issued (+)</div><div class="kpi-value" id="ovPtsIssued">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
                  <div><div class="kpi-label">Points redeemed (−)</div><div class="kpi-value" id="ovPtsRedeemed">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div>
                  <div><div class="kpi-label">Wallet top-ups</div><div class="kpi-value" id="ovTopUp">-</div><div class="kpi-hint">Ledger <code>referenceType</code> = wallet_topup</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg></div>
                  <div><div class="kpi-label">OTP verified</div><div class="kpi-value" id="ovOtp">-</div></div>
                </div>
              </div>
            </div>
            <div class="kpi-panel">
              <h2>Vouchers &amp; engagement</h2>
              <div class="kpi-row">
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
                  <div><div class="kpi-label">Issued (active)</div><div class="kpi-value" id="ovVIssued">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                  <div><div class="kpi-label">Redeemed</div><div class="kpi-value" id="ovVRedeemed">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                  <div><div class="kpi-label">Expired</div><div class="kpi-value" id="ovVExpired">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
                  <div><div class="kpi-label">Void</div><div class="kpi-value" id="ovVVoid">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
                  <div><div class="kpi-label">Redemption rate</div><div class="kpi-value" id="ovVRate">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
                  <div><div class="kpi-label">Birthdays this month</div><div class="kpi-value" id="ovBirthdays">-</div></div>
                </div>
              </div>
            </div>
            <div class="sheet">
              <div class="sheet-head"><h2>Shop orders &amp; growth (30 days)</h2></div>
              <div class="kpi-row" style="padding:16px 20px 0">
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12l1.5 4H4.5z"/><path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg></div>
                  <div><div class="kpi-label">Orders (30d)</div><div class="kpi-value" id="ovOrders30">-</div></div>
                </div>
                <div class="kpi">
                  <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
                  <div><div class="kpi-label">GMV (30d, stored value)</div><div class="kpi-value" id="ovGmv30">-</div><div class="kpi-hint">Sum of member-submitted order totals</div></div>
                </div>
              </div>
              <div class="mk-grid">
                <div class="mk-chart-wrap mk-span-2">
                  <div class="mk-chart-title">New members per day (UTC) — stacked: referral vs direct</div>
                  <div class="mk-legend" aria-hidden="true">
                    <span class="mk-legend-item"><span class="mk-swatch org"></span> Direct / other</span>
                    <span class="mk-legend-item"><span class="mk-swatch ref"></span> Joined via referral</span>
                  </div>
                  <div class="mk-chart mk-chart-signups" id="mkDashSignupBars" aria-label="Signups stacked chart"></div>
                </div>
                <div class="mk-chart-wrap mk-span-2">
                  <div class="mk-spender-head">
                    <div class="mk-chart-title" style="margin:0">Top spenders (order totals)</div>
                    <div>
                      <label for="mkDashSpenderPeriod" class="muted-hint" style="margin-right:8px;font-size:12px">Period</label>
                      <select id="mkDashSpenderPeriod" aria-label="Top spenders period">
                        <option value="day">Today (UTC)</option>
                        <option value="month">This month (UTC)</option>
                        <option value="year">This year (UTC)</option>
                        <option value="all">All time</option>
                      </select>
                    </div>
                  </div>
                  <p class="field-hint" style="margin:0 0 8px">Ranked by sum of stored member-app orders in the selected window.</p>
                  <div id="mkDashSpenderBars" class="mk-hbar-panel" aria-label="Top spenders chart"></div>
                  <table class="data mk-mini-table"><thead><tr><th>Member</th><th>Spent</th></tr></thead><tbody id="mkDashSpenderPeriodBody"></tbody></table>
                </div>
                <div>
                  <div class="mk-chart-title">Top referrers</div>
                  <table class="data mk-mini-table"><thead><tr><th>Member</th><th>Referrals</th></tr></thead><tbody id="mkDashTopReferrersBody"></tbody></table>
                </div>
                <div>
                  <div class="mk-chart-title">Top products (30d qty)</div>
                  <table class="data mk-mini-table"><thead><tr><th>Product</th><th>Qty</th></tr></thead><tbody id="mkDashTopProductsBody"></tbody></table>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="dashboard-activity" class="tab-panel hidden">
          <div id="ovPanelActivity">
            <div class="sheet">
              <div class="sheet-head"><h2>Recent registrations</h2></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Phone <span class="sort-hint">↕</span></th><th>Name <span class="sort-hint">↕</span></th><th>Status</th><th>Registered <span class="sort-hint">↕</span></th></tr></thead>
                  <tbody id="recentRegBody"></tbody>
                </table>
              </div>
            </div>
            <div class="sheet">
              <div class="sheet-head"><h2>Recent voucher activity</h2></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Member</th><th>Code</th><th>Status</th><th>Updated</th></tr></thead>
                  <tbody id="recentVoucherBody"></tbody>
                </table>
              </div>
            </div>
            <div class="sheet">
              <div class="sheet-head"><h2>Recent wallet activity</h2></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Member</th><th>Delta</th><th>Balance</th><th>Reason</th><th>When</th></tr></thead>
                  <tbody id="recentWalletBody"></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="dashboard-employees" class="tab-panel hidden">
          <div class="info-banner" style="margin-top:0">
            <strong>Clock in/out</strong> runs from the ops order queue (Timesheet window). Here: staff records, work calendar (off / public holiday), closed punches, payroll rules (hours, decimal multipliers, percentage), and a period salary preview you can print.
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Payroll rules</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="emPayrollReloadBtn">Reload</button><button type="button" class="btn-primary" id="emPayrollSaveBtn">Save</button></div></div>
            <div style="padding:16px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
              <div class="form-section" style="margin:0"><label for="emStdHours">Standard day (hours)</label><input type="number" id="emStdHours" min="0.1" step="0.1" title="Converted to minutes for payroll (e.g. 8.0 = 480 min)" /></div>
              <div class="form-section" style="margin:0"><label for="emOtMul">Overtime multiplier</label><input type="number" id="emOtMul" min="0" step="0.01" title="e.g. 1.50 = 1.5× on minutes after the standard day" /></div>
              <div class="form-section" style="margin:0"><label for="emPhMul">Public holiday multiplier</label><input type="number" id="emPhMul" min="0" step="0.01" title="e.g. 2.00 = 2× for all minutes that day" /></div>
              <div class="form-section" style="margin:0"><label for="emOffMul">Off-day worked multiplier</label><input type="number" id="emOffMul" min="0" step="0.01" title="Applied to pay for minutes worked on calendar off days" /></div>
            </div>
            <p class="field-hint" id="emPayrollSaveHint" style="padding:0 20px 16px;margin:0"></p>
          </div>
          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Employees</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="emEmpReloadBtn">Refresh</button></div></div>
            <div style="padding:16px 20px;border-bottom:1px solid rgba(0,0,0,0.08)">
              <p class="muted-hint" style="margin:0 0 12px">New hire — <strong>Employee ID</strong> is what staff type at the queue timesheet.</p>
              <div class="form-row-2">
                <div class="form-section" style="margin:0"><label for="emNewCode">Employee ID</label><input type="text" id="emNewCode" maxlength="64" /></div>
                <div class="form-section" style="margin:0"><label for="emNewName">Display name</label><input type="text" id="emNewName" maxlength="200" /></div>
              </div>
              <div class="form-row-2">
                <div class="form-section" style="margin:0"><label for="emNewPos">Position</label><input type="text" id="emNewPos" maxlength="120" placeholder="Barista, shift lead…" /></div>
                <div class="form-section" style="margin:0"><label for="emNewRate">Monthly salary (¢)</label><input type="number" id="emNewRate" min="0" step="1" value="0" /></div>
              </div>
              <div class="form-section" style="margin:0"><label for="emNewComm">Percentage (% of wage subtotal)</label><input type="number" id="emNewComm" min="0" step="0.01" value="0" title="e.g. 5.00 means 5%" /></div>
              <p class="field-hint" style="margin:0 0 8px">Monthly salary is converted to an implied hourly rate using 173.33 hours per month (40 h/week basis) for the same wage engine.</p>
              <button type="button" class="btn-primary" id="emEmpCreateBtn" style="margin-top:12px">Add employee</button>
              <p class="field-hint" id="emEmpCreateHint" style="margin-top:8px"></p>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>ID</th><th>Name</th><th>Position</th><th>Monthly ¢</th><th>%</th><th>Active</th><th>Save row</th></tr></thead>
                <tbody id="emEmpBody"></tbody>
              </table>
            </div>
          </div>
          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Work calendar</h2></div>
            <div style="padding:16px 20px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
              <div class="form-section" style="margin:0"><label for="emCalFrom">From</label><input type="date" id="emCalFrom" /></div>
              <div class="form-section" style="margin:0"><label for="emCalTo">To</label><input type="date" id="emCalTo" /></div>
              <button type="button" class="btn-outline" id="emCalLoadBtn">Load range</button>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Date</th><th>Type</th><th>Label</th></tr></thead>
                <tbody id="emCalBody"></tbody>
              </table>
            </div>
            <div style="padding:16px 20px;border-top:1px solid rgba(0,0,0,0.08)">
              <p class="muted-hint" style="margin:0 0 10px">Set one day (UTC date) — <strong>REGULAR</strong>, <strong>OFF</strong>, or <strong>PUBLIC_HOLIDAY</strong>.</p>
              <div class="form-row-2">
                <div class="form-section" style="margin:0"><label for="emCalDay">Date</label><input type="date" id="emCalDay" /></div>
                <div class="form-section" style="margin:0"><label for="emCalType">Type</label>
                  <select id="emCalType"><option value="REGULAR">REGULAR</option><option value="OFF">OFF</option><option value="PUBLIC_HOLIDAY">PUBLIC_HOLIDAY</option></select>
                </div>
              </div>
              <div class="form-section" style="margin:0"><label for="emCalLabel">Label (optional)</label><input type="text" id="emCalLabel" maxlength="120" placeholder="CNY, team off…" /></div>
              <button type="button" class="btn-primary" id="emCalSaveBtn" style="margin-top:10px">Save calendar day</button>
              <p class="field-hint" id="emCalHint"></p>
            </div>
          </div>
          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Clock in / out report</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="emTeReloadBtn">Load</button></div></div>
            <div style="padding:16px 20px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
              <div class="form-section" style="margin:0"><label for="emTeFrom">From</label><input type="date" id="emTeFrom" /></div>
              <div class="form-section" style="margin:0"><label for="emTeTo">To</label><input type="date" id="emTeTo" /></div>
              <div class="form-section" style="margin:0"><label for="emTeEmp">Employee (optional)</label><select id="emTeEmp"><option value="">All</option></select></div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>In</th><th>Out</th><th>Minutes</th><th>ID</th><th>Name</th><th>Position</th></tr></thead>
                <tbody id="emTeBody"></tbody>
              </table>
            </div>
          </div>
          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Salary calculator (period)</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="emPayPrintBtn">Print payslip</button></div></div>
            <div style="padding:16px 20px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
              <div class="form-section" style="margin:0"><label for="emPayEmp">Employee</label><select id="emPayEmp"></select></div>
              <div class="form-section" style="margin:0"><label for="emPayFrom">From</label><input type="date" id="emPayFrom" /></div>
              <div class="form-section" style="margin:0"><label for="emPayTo">To</label><input type="date" id="emPayTo" /></div>
              <div class="form-section" style="margin:0"><label for="emPayManual">Manual add-on (¢)</label><input type="number" id="emPayManual" min="0" step="1" value="0" /></div>
              <button type="button" class="btn-primary" id="emPayCalcBtn">Calculate</button>
            </div>
            <div id="emPayslipRoot" style="margin:16px 20px;max-height:520px;overflow:auto"></div>
          </div>
        </section>

        <section id="customers-list" class="tab-panel hidden">
          <div class="info-banner" style="margin-top:0">
            Browse members and open <strong>Edit</strong> for full profile, tags, and recent orders for that customer.
          </div>
          <div class="sheet">
            <div class="sheet-head">
              <h2>Customer list</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="exportCustomersBtn">Export CSV</button>
                <button type="button" class="btn-outline" id="refreshCustomersBtn">Refresh list</button>
              </div>
            </div>
            <div class="customer-sort-bar">
              <span style="flex:1 1 240px;min-width:220px">
                <label for="customerSearch">Search</label>
                <input type="search" id="customerSearch" placeholder="Phone, name, email, or member id" style="width:100%" />
              </span>
              <span>
                <label for="customerStatusFilter">Status</label>
                <select id="customerStatusFilter">
                  <option value="">All</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </span>
              <span>
                <label for="customerTierFilter">Tier</label>
                <input type="text" id="customerTierFilter" placeholder="e.g. standard" style="width:120px" />
              </span>
              <span>
                <label for="customerSourceFilter">Source</label>
                <input type="text" id="customerSourceFilter" placeholder="e.g. otp" style="width:120px" />
              </span>
              <span>
                <label for="customerTagFilter">Tag</label>
                <input type="text" id="customerTagFilter" placeholder="e.g. bento, cake" style="width:130px" title="Comma-separated: members with any of these tags" />
              </span>
              <span style="display:flex;align-items:center;gap:6px">
                <input type="checkbox" id="customerHasVoucher" style="width:auto" />
                <label for="customerHasVoucher" style="margin:0">Has active voucher</label>
              </span>
              <span>
                <label for="customerSortBy">Sort by</label>
                <select id="customerSortBy">
                  <option value="createdAt">Joined</option>
                  <option value="lastLoginAt">Last visit</option>
                  <option value="points">Points</option>
                  <option value="spent">Lifetime spent</option>
                  <option value="referrals">Referrals made</option>
                  <option value="name">Name</option>
                </select>
              </span>
              <span>
                <label for="customerSortDir">Direction</label>
                <select id="customerSortDir">
                  <option value="desc">High → low / New first</option>
                  <option value="asc">Low → high / Old first</option>
                </select>
              </span>
              <span style="display:flex;gap:8px;align-items:flex-end">
                <button type="button" class="btn-primary" id="customerSearchBtn">Search</button>
                <button type="button" class="btn-outline" id="customerClearBtn">Clear</button>
              </span>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Phone</th><th>Name</th><th>Email</th><th>Tier</th><th>Source</th><th>Birthday in</th><th>Vouchers</th><th>Status</th><th>Points</th><th>Spent</th><th>Refs</th><th>Last visit</th><th>Edit</th></tr></thead>
                <tbody id="customersBody"></tbody>
              </table>
            </div>
            <div class="customer-pager">
              <span class="pager-info" id="customersPageInfo"></span>
              <span>
                <label for="customerPageSize">Per page</label>
                <select id="customerPageSize">
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </span>
              <button type="button" class="btn-outline" id="customersPrevBtn" disabled>‹ Prev</button>
              <button type="button" class="btn-outline" id="customersNextBtn" disabled>Next ›</button>
            </div>
          </div>
        </section>

        <section id="customer-orders" class="tab-panel hidden">
          <div class="info-banner" style="margin-top:0">
            Member-app commerce orders across all customers. Filter by status and date (placed or completed), or by <strong>Product contains</strong> / <strong>Product / SKU id</strong> on order lines.
          </div>
          <div class="sheet">
            <div class="sheet-head">
              <h2>Customer orders</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-primary" id="oqRefreshBtn">Apply filters</button>
              </div>
            </div>
            <div style="padding:16px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px 16px;align-items:end">
              <div class="form-section" style="margin:0">
                <label for="oqStatus">Status</label>
                <select id="oqStatus">
                  <option value="all">All</option>
                  <option value="placed">Open (placed)</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div class="form-section" style="margin:0">
                <label for="oqDateField">Date field</label>
                <select id="oqDateField">
                  <option value="placed">Placed at</option>
                  <option value="completed">Completed at</option>
                </select>
              </div>
              <div class="form-section" style="margin:0">
                <label for="oqFrom">From (UTC date)</label>
                <input type="date" id="oqFrom" />
              </div>
              <div class="form-section" style="margin:0">
                <label for="oqTo">To (UTC, inclusive)</label>
                <input type="date" id="oqTo" />
              </div>
              <div class="form-section" style="margin:0">
                <label for="oqProductContains">Product contains</label>
                <input type="text" id="oqProductContains" maxlength="120" placeholder="e.g. cheesecake" />
              </div>
              <div class="form-section" style="margin:0">
                <label for="oqProductId">Product / SKU id</label>
                <input type="text" id="oqProductId" maxlength="120" placeholder="exact line productId" />
              </div>
              <div class="form-section" style="margin:0">
                <label for="oqSort">Sort</label>
                <select id="oqSort">
                  <option value="placed_desc">Placed · newest first</option>
                  <option value="placed_asc">Placed · oldest first</option>
                  <option value="completed_desc">Completed · newest first</option>
                  <option value="completed_asc">Completed · oldest first</option>
                  <option value="total_desc">Total · high → low</option>
                  <option value="total_asc">Total · low → high</option>
                </select>
              </div>
              <div class="form-section" style="margin:0">
                <label for="oqLimit">Row limit</label>
                <select id="oqLimit">
                  <option value="50">50</option>
                  <option value="100" selected>100</option>
                  <option value="200">200</option>
                </select>
              </div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>#</th><th>Status</th><th>Placed</th><th>Completed</th><th>Customer</th><th>Phone</th><th>Total</th><th>Lines</th></tr></thead>
                <tbody id="oqBody"></tbody>
              </table>
            </div>
            <p class="field-hint" id="oqHint" style="padding:0 20px 16px;margin:0"></p>
          </div>
        </section>

        <section id="customers-segments" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Tags / segments</h2></div>
            <div class="coming-soon">
              Segment builder and saved audiences will connect to <code>GET/POST /admin/segments/*</code>. Use the API or a future release for audience management and tag vocabularies from master data.
            </div>
          </div>
        </section>

        <section id="customers-merge" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Merge duplicates</h2></div>
            <div class="coming-soon">
              Duplicate detection and safe merge workflows are not implemented in this dashboard yet. Plan: match on phone / email, pick canonical member, re-point wallet and vouchers.
            </div>
          </div>
        </section>

        <section id="wallet-balances" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Wallet summary</h2>
            <div class="kpi-row">
              <div class="kpi">
                <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
                <div><div class="kpi-label">Members (total)</div><div class="kpi-value" id="wbMembers">-</div></div>
              </div>
              <div class="kpi">
                <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/></svg></div>
                <div><div class="kpi-label">Wallet top-ups (sum)</div><div class="kpi-value" id="wbTopUp">-</div></div>
              </div>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Per-member balances</h2></div>
            <div class="muted-box">Detailed stored-wallet balances per member will use <code>GET /admin/customers/:id/wallet</code> from the profile or list actions in a later iteration.</div>
          </div>
        </section>

        <section id="wallet-transactions" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Wallet transactions</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshWalletLedgerBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>When</th><th>Member</th><th>Type</th><th>Amount (¢)</th><th>Balance after</th><th>Reason</th></tr></thead>
                <tbody id="walletLedgerBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="wallet-adjustment" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Manual wallet adjustment</h2></div>
            <div style="padding:16px 20px;max-width:480px">
              <div class="form-section">
                <label for="waCustomerId">Customer ID</label>
                <input type="text" id="waCustomerId" placeholder="UUID" />
              </div>
              <div class="form-section">
                <label for="waType">Transaction type</label>
                <select id="waType">
                  <option value="MANUAL_ADJUSTMENT">MANUAL_ADJUSTMENT</option>
                  <option value="TOPUP">TOPUP</option>
                  <option value="PROMOTIONAL_BONUS">PROMOTIONAL_BONUS</option>
                  <option value="REFUND">REFUND</option>
                  <option value="SPEND">SPEND (negative cents)</option>
                </select>
              </div>
              <div class="form-section">
                <label for="waAmount">Amount (cents)</label>
                <input type="number" id="waAmount" step="1" />
              </div>
              <div class="form-section">
                <label for="waReason">Reason</label>
                <input type="text" id="waReason" maxlength="300" placeholder="Shown on ledger" />
              </div>
              <div class="form-section">
                <label for="waCampaign">Campaign code (optional)</label>
                <input type="text" id="waCampaign" maxlength="200" />
              </div>
              <button type="button" class="btn-primary" id="waSubmitBtn">Post adjustment</button>
              <p class="field-hint" id="waResult" style="margin-top:12px"></p>
            </div>
          </div>
        </section>

        <section id="wallet-rules" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Top-up bonus rules</h2></div>
            <div class="coming-soon">
              Configure wallet bonus rules via <code>GET/PATCH /admin/master/rules</code> (business rules) when exposed in the UI. This screen is reserved for finance-owned top-up incentives.
            </div>
          </div>
        </section>

        <section id="loyalty-balances" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Points summary</h2>
            <div class="kpi-row">
              <div class="kpi">
                <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
                <div><div class="kpi-label">Points issued (+)</div><div class="kpi-value" id="lbPtsIssued">-</div></div>
              </div>
              <div class="kpi">
                <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg></div>
                <div><div class="kpi-label">Points redeemed (−)</div><div class="kpi-value" id="lbPtsRedeemed">-</div></div>
              </div>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Per-member points</h2></div>
            <div class="muted-box">Member points appear in the customer list. Full balance drill-down: <code>GET /admin/customers/:id</code>.</div>
          </div>
        </section>

        <section id="loyalty-transactions" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Loyalty transactions</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshLoyaltyBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Customer</th><th>Delta</th><th>Balance after</th><th>Reference</th></tr></thead>
                <tbody id="loyaltyBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="loyalty-rules" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Points rules</h2></div>
            <div class="coming-soon">
              Loyalty earn / redeem / expiry rules live in master business rules (<code>WALLET_BONUS</code>, <code>LOYALTY_*</code> kinds). Admin API: <code>/admin/master/rules</code>.
            </div>
          </div>
        </section>

        <section id="loyalty-campaigns" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Bonus campaigns</h2></div>
            <div class="coming-soon">
              Campaign runs (points / wallet / vouchers) use <code>POST /admin/segments/campaigns/run</code>. This dashboard view will list runs and outcomes in a future release.
            </div>
          </div>
        </section>

        <section id="voucher-campaigns" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Vouchers</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshVoucherCampaignsBtn">Refresh</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1040px">
              <p class="field-hint" style="margin-top:0">
                Create a voucher campaign and push it to your members. Pick a template to pre-fill the common settings, adjust the amount and dates, then create. Members receive the voucher in their app wallet — no codes or IDs to type.
              </p>

              <h3 style="margin:18px 0 8px;font-size:14px">1 &middot; Pick a template</h3>
              <div id="vcTemplateGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:18px"></div>

              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:16px">
                <h3 style="margin:0 0 12px;font-size:14px">2 &middot; Configure &amp; create</h3>
                <input type="hidden" id="vcTemplate" value="CUSTOM" />
                <div class="vc-form">
                  <div class="vc-field">
                    <label for="vcName">Voucher name</label>
                    <input type="text" id="vcName" placeholder="e.g. Welcome RM5 off" />
                  </div>
                  <div class="vc-field">
                    <label for="vcType">Discount type</label>
                    <select id="vcType">
                      <option value="FIXED_AMOUNT">RM amount off</option>
                      <option value="PERCENTAGE">Percentage off</option>
                      <option value="FREE_ITEM">Free item</option>
                      <option value="DELIVERY_DISCOUNT">Delivery discount</option>
                    </select>
                  </div>
                  <div class="vc-field" id="vcAmountWrap">
                    <label for="vcAmount">Amount off (RM)</label>
                    <input type="text" id="vcAmount" inputmode="decimal" placeholder="5.00" />
                  </div>
                  <div class="vc-field" id="vcPercentWrap" style="display:none">
                    <label for="vcPercent">Percentage off (%)</label>
                    <input type="text" id="vcPercent" inputmode="numeric" placeholder="15" />
                  </div>
                  <div class="vc-field">
                    <label for="vcMinSpend">Min spend (RM)</label>
                    <input type="text" id="vcMinSpend" inputmode="decimal" placeholder="optional" />
                  </div>
                  <div class="vc-field">
                    <label for="vcStart">Valid from</label>
                    <input type="date" id="vcStart" />
                  </div>
                  <div class="vc-field">
                    <label for="vcEnd">Campaign ends</label>
                    <input type="date" id="vcEnd" />
                  </div>
                  <div class="vc-field">
                    <label for="vcValidDays">Voucher valid (days)</label>
                    <input type="text" id="vcValidDays" inputmode="numeric" placeholder="30" />
                  </div>
                  <div class="vc-field">
                    <label for="vcMaxIssued">Max total issued</label>
                    <input type="text" id="vcMaxIssued" inputmode="numeric" placeholder="unlimited" />
                  </div>
                  <div class="vc-field vc-field--full">
                    <label for="vcTnc">Terms / note</label>
                    <input type="text" id="vcTnc" placeholder="Shown to members in their wallet (optional)" />
                  </div>
                </div>
                <div style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <button type="button" class="btn-primary" id="vcCreateBtn">Create voucher campaign</button>
                  <span class="field-hint" id="vcCreateResult" style="margin:0"></span>
                </div>
              </div>

              <h3 style="margin:18px 0 8px;font-size:14px">Your campaigns</h3>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Discount</th>
                      <th>Issued</th>
                      <th>Window</th>
                      <th style="text-align:center">Status</th>
                      <th style="text-align:center">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="voucherCampaignsBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="voucherCampaignsListResult"></p>

              <div id="vcIssuePanel" style="display:none;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;margin-top:14px">
                <h3 style="margin:0 0 6px;font-size:14px">Push voucher to members &mdash; <span id="vcIssueCampaignName"></span></h3>
                <p class="field-hint" style="margin-top:0">Issuing creates a voucher in the member's wallet so it shows up in their app. Find one member by phone, or push to every active member at once.</p>
                <div class="form-row-2" style="gap:12px;max-width:680px">
                  <div>
                    <label for="vcIssuePhone">Member phone</label>
                    <input type="text" id="vcIssuePhone" placeholder="e.g. 60123456789" />
                  </div>
                  <div style="display:flex;align-items:flex-end">
                    <button type="button" class="btn-primary" id="vcIssueOneBtn">Find &amp; issue</button>
                  </div>
                </div>
                <div style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <button type="button" class="btn-outline" id="vcIssueAllBtn">Issue to all active members</button>
                  <button type="button" class="btn-outline" id="vcIssueCloseBtn">Close</button>
                  <span class="field-hint" id="vcIssueResult" style="margin:0"></span>
                </div>
              </div>

              <div id="vcEditPanel" style="display:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-top:14px">
                <h3 style="margin:0 0 12px;font-size:14px">Edit campaign &mdash; <span id="vcEditCode"></span></h3>
                <input type="hidden" id="vcEditId" />
                <div class="vc-form">
                  <div class="vc-field">
                    <label for="vcEditName">Name</label>
                    <input type="text" id="vcEditName" />
                  </div>
                  <div class="vc-field">
                    <label for="vcEditActive">Status</label>
                    <select id="vcEditActive">
                      <option value="true">Active</option>
                      <option value="false">Paused</option>
                    </select>
                  </div>
                  <div class="vc-field" id="vcEditAmountWrap">
                    <label for="vcEditAmount">Amount off (RM)</label>
                    <input type="text" id="vcEditAmount" inputmode="decimal" />
                  </div>
                  <div class="vc-field" id="vcEditPercentWrap" style="display:none">
                    <label for="vcEditPercent">Percentage off (%)</label>
                    <input type="text" id="vcEditPercent" inputmode="numeric" />
                  </div>
                  <div class="vc-field">
                    <label for="vcEditMinSpend">Min spend (RM)</label>
                    <input type="text" id="vcEditMinSpend" inputmode="decimal" placeholder="optional" />
                  </div>
                  <div class="vc-field">
                    <label for="vcEditValidDays">Voucher valid (days)</label>
                    <input type="text" id="vcEditValidDays" inputmode="numeric" />
                  </div>
                  <div class="vc-field">
                    <label for="vcEditMaxIssued">Max total issued</label>
                    <input type="text" id="vcEditMaxIssued" inputmode="numeric" placeholder="unlimited" />
                  </div>
                  <div class="vc-field vc-field--full">
                    <label for="vcEditTnc">Terms / note</label>
                    <input type="text" id="vcEditTnc" />
                  </div>
                </div>
                <div style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <button type="button" class="btn-primary" id="vcEditSaveBtn">Save changes</button>
                  <button type="button" class="btn-outline" id="vcEditCancelBtn">Cancel</button>
                  <span class="field-hint" id="vcEditResult" style="margin:0"></span>
                </div>
              </div>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head">
              <h2>Issued vouchers</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="ivRefreshBtn">Refresh</button>
              </div>
            </div>
            <div style="padding:12px 20px">
              <p class="field-hint" style="margin-top:0">Every voucher issued to a member &mdash; search by code, name or phone, filter by status or campaign, and withdraw any unredeemed voucher. Set status to <strong>Used</strong> to see who redeemed.</p>
              <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
                <div>
                  <label for="ivSearch">Search</label>
                  <input type="text" id="ivSearch" placeholder="code, name or phone" style="min-width:200px" />
                </div>
                <div>
                  <label for="ivStatus">Status</label>
                  <select id="ivStatus">
                    <option value="">All</option>
                    <option value="ACTIVE">Active</option>
                    <option value="USED">Used (redeemed)</option>
                    <option value="LOCKED">Locked (in checkout)</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="VOID">Withdrawn</option>
                  </select>
                </div>
                <div>
                  <label for="ivCampaign">Campaign</label>
                  <select id="ivCampaign"><option value="">All</option></select>
                </div>
                <button type="button" class="btn-primary" id="ivApplyBtn">Apply</button>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Recipient</th>
                      <th>Phone</th>
                      <th>Campaign</th>
                      <th style="text-align:center">Status</th>
                      <th>Issued</th>
                      <th>Used / Expiry</th>
                      <th style="text-align:center">Action</th>
                    </tr>
                  </thead>
                  <tbody id="issuedVouchersBody"></tbody>
                </table>
              </div>
              <div style="display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap">
                <button type="button" class="btn-outline" id="ivPrevBtn">Prev</button>
                <span class="field-hint" id="ivPageInfo" style="margin:0"></span>
                <button type="button" class="btn-outline" id="ivNextBtn">Next</button>
                <span class="field-hint" id="ivResult" style="margin:0"></span>
              </div>
            </div>
          </div>
        </section>

        <section id="voucher-redeem" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Redeem voucher (in-store)</h2>
            </div>
            <div style="padding:12px 20px;max-width:760px">
              <p class="field-hint" style="margin-top:0">
                For walk-in members: find them by phone, then mark whichever voucher they're using as redeemed.
                SalesPlay has no voucher/discount API, so apply the matching discount manually on the till first,
                then redeem it here so it can't be reused.
              </p>
              <div class="form-row-2" style="gap:12px;max-width:520px">
                <div>
                  <label for="vrPhone">Member phone</label>
                  <input type="text" id="vrPhone" placeholder="e.g. 60123456789" />
                </div>
                <div style="display:flex;align-items:flex-end">
                  <button type="button" class="btn-primary" id="vrFindBtn">Find member</button>
                </div>
              </div>
              <p class="field-hint" id="vrFindResult"></p>

              <div id="vrMemberPanel" style="display:none;margin-top:16px">
                <h3 style="margin:0 0 8px;font-size:14px">Vouchers for <span id="vrMemberName"></span></h3>
                <div class="table-wrap">
                  <table class="data">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Title</th>
                        <th>Discount</th>
                        <th>Source</th>
                        <th>Expires</th>
                        <th style="text-align:center">Action</th>
                      </tr>
                    </thead>
                    <tbody id="vrVouchersBody"></tbody>
                  </table>
                </div>
                <p class="field-hint" id="vrVouchersResult"></p>
              </div>
            </div>
          </div>
        </section>

        <section id="gift-rewards" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Gift rewards</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshGiftRewardsBtn">Refresh</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1040px">
              <p class="field-hint" style="margin-top:0">
                Gift rewards let members spend their points. Create a reward, set the points cost, and link it to a voucher campaign. When a member redeems, the linked voucher lands in their wallet automatically.
              </p>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:16px">
                <h3 style="margin:0 0 10px;font-size:14px">New reward</h3>
                <div class="form-row-2" style="gap:12px;max-width:680px">
                  <div>
                    <label for="grName">Reward name</label>
                    <input type="text" id="grName" placeholder="e.g. RM10 voucher (100 pts)" />
                  </div>
                  <div>
                    <label for="grPoints">Points cost</label>
                    <input type="text" id="grPoints" inputmode="numeric" placeholder="100" />
                  </div>
                </div>
                <div class="form-row-2" style="gap:12px;max-width:680px;margin-top:8px">
                  <div>
                    <label for="grType">Reward type</label>
                    <select id="grType">
                      <option value="DISCOUNT_VOUCHER">Discount voucher</option>
                      <option value="FREE_ITEM">Free item</option>
                    </select>
                  </div>
                  <div id="grCampaignWrap">
                    <label for="grCampaign">Linked voucher campaign</label>
                    <select id="grCampaign"><option value="">&mdash; select a campaign &mdash;</option></select>
                  </div>
                </div>
                <div style="margin-top:8px;max-width:680px">
                  <label for="grTnc">Terms (optional)</label>
                  <input type="text" id="grTnc" placeholder="Shown to members" />
                </div>
                <div style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <button type="button" class="btn-primary" id="grCreateBtn">Create reward</button>
                  <span class="field-hint" id="grCreateResult" style="margin:0"></span>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Points</th>
                      <th>Type</th>
                      <th>Linked voucher</th>
                      <th style="text-align:center">Active</th>
                      <th style="text-align:center">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="giftRewardsBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="giftRewardsListResult"></p>

              <div id="grEditPanel" style="display:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-top:14px">
                <h3 style="margin:0 0 10px;font-size:14px">Edit reward</h3>
                <input type="hidden" id="grEditId" />
                <div class="form-row-2" style="gap:12px;max-width:680px">
                  <div>
                    <label for="grEditName">Reward name</label>
                    <input type="text" id="grEditName" />
                  </div>
                  <div>
                    <label for="grEditPoints">Points cost</label>
                    <input type="text" id="grEditPoints" inputmode="numeric" />
                  </div>
                </div>
                <div class="form-row-2" style="gap:12px;max-width:680px;margin-top:8px">
                  <div>
                    <label for="grEditActive">Status</label>
                    <select id="grEditActive">
                      <option value="true">Active</option>
                      <option value="false">Hidden</option>
                    </select>
                  </div>
                  <div>
                    <label for="grEditCampaign">Linked voucher campaign</label>
                    <select id="grEditCampaign"><option value="">&mdash; select a campaign &mdash;</option></select>
                  </div>
                </div>
                <div style="margin-top:8px;max-width:680px">
                  <label for="grEditTnc">Terms (optional)</label>
                  <input type="text" id="grEditTnc" />
                </div>
                <div style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <button type="button" class="btn-primary" id="grEditSaveBtn">Save changes</button>
                  <button type="button" class="btn-outline" id="grEditCancelBtn">Cancel</button>
                  <span class="field-hint" id="grEditResult" style="margin:0"></span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="campaigns-segments" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Customer segments</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshCampaignSegmentsBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Name</th><th>Description</th><th>Updated</th></tr></thead>
                <tbody id="campaignSegmentsBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="campaigns-push-voucher" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Audience summary</h2>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Birthday today</div><div class="kpi-value" id="cpvBirthdayCount">-</div></div>
              <div class="kpi"><div class="kpi-label">Not returning</div><div class="kpi-value" id="cpvNotReturningCount">-</div></div>
              <div class="kpi"><div class="kpi-label">Overlap</div><div class="kpi-value" id="cpvOverlapCount">-</div></div>
              <div class="kpi"><div class="kpi-label">Total targetable</div><div class="kpi-value" id="cpvTotalCount">-</div></div>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Push voucher campaign</h2></div>
            <div style="padding:16px 20px">
              <div class="form-row-2">
                <div class="form-section" style="margin:0">
                  <label for="cpvVoucherCode">Voucher code</label>
                  <input type="text" id="cpvVoucherCode" placeholder="e.g. BDAY_10_OFF" />
                </div>
                <div class="form-section" style="margin:0">
                  <label for="cpvStrategy">Campaign strategy</label>
                  <select id="cpvStrategy">
                    <option value="birthday">Birthday today voucher</option>
                    <option value="reengagement">Re-engagement (not returning)</option>
                    <option value="mixed">Mixed strategy (birthday + not returning)</option>
                    <option value="all">All customers</option>
                  </select>
                </div>
              </div>
              <div class="form-row-2" style="margin-top:8px;align-items:end">
                <div class="form-section" style="margin:0">
                  <label for="cpvPhoneSearch">Target by phone (optional)</label>
                  <input type="text" id="cpvPhoneSearch" placeholder="+6591234567" />
                </div>
                <div class="form-section" style="margin:0">
                  <label for="cpvInactiveDays">Not-returning threshold (days)</label>
                  <input type="number" id="cpvInactiveDays" value="60" min="1" max="3650" />
                </div>
              </div>
              <div class="form-section" style="margin-top:10px">
                <label><input type="checkbox" id="cpvUseBirthdayToday" checked style="width:auto;margin-right:8px" />Include members with birthday today</label>
                <label style="margin-top:6px;display:block"><input type="checkbox" id="cpvUseNotReturning" checked style="width:auto;margin-right:8px" />Include members who have not returned within threshold</label>
              </div>
              <div class="sheet-actions" style="padding:8px 0 0">
                <button type="button" class="btn-outline" id="refreshCampaignVoucherInsightsBtn">Refresh audience</button>
                <button type="button" class="btn-primary" id="runCampaignPushVoucherBtn">Push voucher now</button>
              </div>
              <p class="field-hint" id="cpvRunResult" style="margin-top:10px"></p>
              <p class="field-hint">Safety: use phone search for precise targeting, and always refresh audience before running bulk push.</p>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Guest list (strategy candidates)</h2></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Phone</th><th>Name</th><th>Tier</th><th>Birthday today</th><th>Not returning</th><th>Days since seen</th><th>Last login</th></tr></thead>
                <tbody id="cpvGuestBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="campaigns-push-points" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Push points campaign</h2></div>
            <div class="coming-soon">
              Points grants will use campaign runs with explicit reason, bounded amount controls, and role checks (<code>campaign:run</code>). Current release exposes endpoint operations only.
            </div>
          </div>
        </section>

        <section id="campaigns-push-wallet" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Push wallet bonus campaign</h2></div>
            <div class="coming-soon">
              Wallet bonus campaigns should enforce sign validation, idempotency keys, and audit metadata. UI action flow is reserved for a guarded release.
            </div>
          </div>
        </section>

        <section id="campaigns-history" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Campaign history</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshCampaignHistoryBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
                <tbody id="campaignHistoryBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="mailer-campaigns" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Email campaigns</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="mailNewBtn">New campaign</button>
                <button type="button" class="btn-outline" id="mailRefreshBtn">Refresh</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1040px">
              <p class="field-hint" style="margin-top:0">
                Draft marketing emails, send a test to yourself, then send now or schedule for later.
                Emails go to <strong>active members with an email address</strong>; the default audience only includes members who opted in to marketing.
                Every email carries an automatic unsubscribe link.
              </p>

              <h3 style="margin:18px 0 8px;font-size:14px">1 &middot; Start from a template</h3>
              <div id="mailTemplateGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:18px"></div>

              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:16px">
                <h3 style="margin:0 0 4px;font-size:14px">2 &middot; Draft the email &mdash; <span id="mailEditorMode">new campaign</span></h3>
                <p class="field-hint" style="margin-top:0">Use <code>{{name}}</code> anywhere in the subject or body to insert the member's name. With an attached voucher you can also use <code>{{voucher_title}}</code>, <code>{{voucher_code}}</code> and <code>{{voucher_expiry}}</code>. The body is placed inside the branded layout (logo header, footer, unsubscribe link) automatically.</p>
                <input type="hidden" id="mailEditingId" value="" />
                <input type="hidden" id="mailTemplateKind" value="PLAIN" />
                <div class="vc-form">
                  <div class="vc-field">
                    <label for="mailName">Internal name</label>
                    <input type="text" id="mailName" placeholder="e.g. July newsletter" />
                  </div>
                  <div class="vc-field">
                    <label for="mailSubject">Subject</label>
                    <input type="text" id="mailSubject" placeholder="e.g. This week at Moja Maison" />
                  </div>
                  <div class="vc-field vc-field--full">
                    <label for="mailPreheader">Preview line</label>
                    <input type="text" id="mailPreheader" placeholder="Shown next to the subject in the inbox (optional)" />
                  </div>
                  <div class="vc-field vc-field--full">
                    <label for="mailBody">Body (HTML)</label>
                    <textarea id="mailBody" rows="12" style="width:100%;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;line-height:1.5;border:1px solid #cbd5e1;border-radius:8px;padding:10px;box-sizing:border-box" placeholder="&lt;h2&gt;Hi {{name}},&lt;/h2&gt;&#10;&lt;p&gt;Write your message here...&lt;/p&gt;"></textarea>
                  </div>
                  <div class="vc-field">
                    <label for="mailAudience">Audience</label>
                    <select id="mailAudience">
                      <option value="OPTED_IN">Opted-in members (recommended)</option>
                      <option value="ALL_WITH_EMAIL">All members with email</option>
                      <option value="BIRTHDAY_UPCOMING">🎂 Birthday coming up (opted-in)</option>
                    </select>
                  </div>
                  <div class="vc-field">
                    <label for="mailTier">Member tier</label>
                    <input type="text" id="mailTier" placeholder="all tiers (e.g. gold)" />
                  </div>
                  <div class="vc-field" id="mailBirthdayDaysWrap" style="display:none">
                    <label for="mailBirthdayDays">Birthday within (days)</label>
                    <input type="number" id="mailBirthdayDays" min="1" max="60" value="14" />
                  </div>
                  <div class="vc-field">
                    <label for="mailVoucherDef">Attach voucher (added to each recipient's wallet)</label>
                    <select id="mailVoucherDef"><option value="">— no voucher —</option></select>
                  </div>
                  <div class="vc-field">
                    <label for="mailVoucherValidDays">Voucher valid for (days)</label>
                    <input type="number" id="mailVoucherValidDays" min="1" max="365" placeholder="no expiry" />
                  </div>
                </div>
                <p class="field-hint" id="mailAudienceCount" style="margin:10px 0 0"></p>
                <div id="mailBirthdayPreview" style="display:none;margin-top:10px"></div>
                <div style="margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <button type="button" class="btn-primary" id="mailSaveBtn">Save draft</button>
                  <button type="button" class="btn-outline" id="mailPreviewBtn">Preview</button>
                  <input type="email" id="mailTestEmail" placeholder="you@example.com" style="max-width:220px" />
                  <button type="button" class="btn-outline" id="mailTestBtn">Send test</button>
                  <span class="field-hint" id="mailEditorResult" style="margin:0"></span>
                </div>
                <div style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px dashed #cbd5e1;padding-top:12px">
                  <input type="datetime-local" id="mailScheduleAt" style="max-width:230px" />
                  <button type="button" class="btn-outline" id="mailScheduleBtn">Schedule</button>
                  <button type="button" class="btn-primary" id="mailSendNowBtn">Send now</button>
                  <span class="field-hint" id="mailScheduleResult" style="margin:0"></span>
                </div>
                <div id="mailPreviewWrap" style="display:none;margin-top:14px">
                  <h3 style="margin:0 0 6px;font-size:14px">Preview</h3>
                  <iframe id="mailPreviewFrame" title="Email preview" style="width:100%;height:460px;border:1px solid #cbd5e1;border-radius:10px;background:#fff"></iframe>
                </div>
              </div>

              <h3 style="margin:18px 0 8px;font-size:14px">Your campaigns</h3>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Subject</th>
                      <th>Audience</th>
                      <th style="text-align:center">Status</th>
                      <th>Scheduled / sent</th>
                      <th style="text-align:center">Delivered</th>
                      <th style="text-align:center">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="mailCampaignsBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="mailListResult"></p>
            </div>
          </div>
        </section>

        <section id="data-import" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Import data</h2></div>
            <div class="coming-soon">
              Guided import wizard is pending. Backend is live via <code>POST /admin/import/preview/:kind</code> then <code>POST /admin/import/batches/:batchId/commit</code>. Recommended control pattern: template download, validation preview, explicit commit.
            </div>
          </div>
        </section>

        <section id="data-export" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Export data</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshExportJobsBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Created</th><th>Kind</th><th>Format</th><th>Status</th><th>File</th></tr></thead>
                <tbody id="exportJobsBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="data-templates" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Template downloads</h2></div>
            <div style="padding:16px 20px">
              <p class="muted-hint" style="margin-top:0">Templates are downloaded through authenticated API calls to avoid exposing data tooling without authorization.</p>
              <div class="sheet-actions" style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn-outline template-dl-btn" data-kind="CUSTOMER_MASTER">Customers template</button>
                <button type="button" class="btn-outline template-dl-btn" data-kind="WALLET_ADJUSTMENT">Wallet adjustments template</button>
                <button type="button" class="btn-outline template-dl-btn" data-kind="LOYALTY_ADJUSTMENT">Loyalty adjustments template</button>
                <button type="button" class="btn-outline template-dl-btn" data-kind="VOUCHER_ASSIGNMENT">Voucher assignments template</button>
              </div>
              <p class="field-hint" id="templateDownloadStatus" style="margin-top:12px"></p>
            </div>
          </div>
        </section>

        <section id="data-import-history" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Import history</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshImportHistoryBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Created</th><th>Kind</th><th>Status</th><th>Rows</th><th>Error</th></tr></thead>
                <tbody id="importHistoryBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="reports-customers" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Customer reports</h2>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Total members</div><div class="kpi-value" id="rpMembers">-</div></div>
              <div class="kpi"><div class="kpi-label">Inactive members</div><div class="kpi-value" id="rpInactive">-</div></div>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Acquisition by source</h2></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Source</th><th>Count</th></tr></thead>
                <tbody id="reportSourceBody"></tbody>
              </table>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Marketing &amp; advocacy (30 days)</h2></div>
            <p class="muted-hint" style="margin:0 20px 8px">Same signals as the dashboard overview: signups trend, top spenders, referrers, and best-selling SKUs from stored member orders.</p>
            <div class="mk-grid">
              <div class="mk-chart-wrap mk-span-2">
                <div class="mk-chart-title">New members per day (UTC) — stacked: referral vs direct</div>
                <div class="mk-legend" aria-hidden="true">
                  <span class="mk-legend-item"><span class="mk-swatch org"></span> Direct / other</span>
                  <span class="mk-legend-item"><span class="mk-swatch ref"></span> Joined via referral</span>
                </div>
                <div class="mk-chart mk-chart-signups" id="mkRpSignupBars" aria-label="Signups stacked chart reports"></div>
              </div>
              <div class="mk-chart-wrap mk-span-2">
                <div class="mk-spender-head">
                  <div class="mk-chart-title" style="margin:0">Top spenders (order totals)</div>
                  <div>
                    <label for="mkRpSpenderPeriod" class="muted-hint" style="margin-right:8px;font-size:12px">Period</label>
                    <select id="mkRpSpenderPeriod" aria-label="Top spenders period reports">
                      <option value="day">Today (UTC)</option>
                      <option value="month">This month (UTC)</option>
                      <option value="year">This year (UTC)</option>
                      <option value="all">All time</option>
                    </select>
                  </div>
                </div>
                <p class="field-hint" style="margin:0 0 8px">Ranked by sum of stored member-app orders in the selected window.</p>
                <div id="mkRpSpenderBars" class="mk-hbar-panel" aria-label="Top spenders chart reports"></div>
                <table class="data mk-mini-table"><thead><tr><th>Member</th><th>Spent</th></tr></thead><tbody id="mkRpSpenderPeriodBody"></tbody></table>
              </div>
              <div>
                <div class="mk-chart-title">Top referrers</div>
                <table class="data mk-mini-table"><thead><tr><th>Member</th><th>Referrals</th></tr></thead><tbody id="mkRpTopReferrersBody"></tbody></table>
              </div>
              <div>
                <div class="mk-chart-title">Top products (30d qty)</div>
                <table class="data mk-mini-table"><thead><tr><th>Product</th><th>Qty</th></tr></thead><tbody id="mkRpTopProductsBody"></tbody></table>
              </div>
            </div>
          </div>
        </section>

        <section id="reports-sales" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-toolbar">
              <div class="sa-toolbar-presets">
                <button type="button" class="btn-outline" id="saPreset7">Last 7 days</button>
                <button type="button" class="btn-outline" id="saPreset30">Last 30 days</button>
                <button type="button" class="btn-outline" id="saPresetMtd">Month to date</button>
              </div>
              <div class="sa-toolbar-group">
                <label for="saFrom">From (UTC)</label>
                <input type="date" id="saFrom" />
              </div>
              <div class="sa-toolbar-group">
                <label for="saTo">To (UTC, inclusive)</label>
                <input type="date" id="saTo" />
              </div>
              <div class="sa-toolbar-group">
                <label for="saCategory">Category</label>
                <select id="saCategory" aria-label="Sales category">
                  <option value="cake" selected>Cake (shop)</option>
                  <option value="bento">Bento (meal plans)</option>
                </select>
              </div>
              <div class="sa-toolbar-group">
                <label for="saBucket">Bucket</label>
                <select id="saBucket" aria-label="Time bucket">
                  <option value="day">Days</option>
                  <option value="week">Weeks</option>
                  <option value="month" selected>Months</option>
                </select>
              </div>
              <div class="sa-toolbar-group">
                <label for="saStoreFilter">Store</label>
                <select id="saStoreFilter" disabled title="Not tracked in this build"><option>All stores</option></select>
              </div>
              <div class="sa-toolbar-group">
                <label for="saStaffFilter">Staff</label>
                <select id="saStaffFilter" disabled title="Not tracked in this build"><option>All staff</option></select>
              </div>
              <div class="sa-toolbar-actions">
                <button type="button" class="btn-primary" id="saRefreshBtn">Apply</button>
                <button type="button" class="btn-outline" id="saExportCsv">Export CSV</button>
                <button type="button" class="btn-outline" id="saExportJson">Export JSON</button>
              </div>
            </div>

            <div class="sa-kpi-strip" id="saKpiStrip">
              <button type="button" class="sa-kpi-card is-active" data-sa-metric="gmv" id="saCardGmv">
                <div class="sa-kpi-card-title" id="saKpiGmvTitle">GMV (paid)</div>
                <div class="sa-kpi-card-value" id="saValGmv">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaGmv">—</div>
              </button>
              <button type="button" class="sa-kpi-card" data-sa-metric="orders" id="saCardOrders">
                <div class="sa-kpi-card-title" id="saKpiOrdersTitle">Paid transactions</div>
                <div class="sa-kpi-card-value" id="saValOrders">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaOrders">—</div>
              </button>
              <button type="button" class="sa-kpi-card" data-sa-metric="aov" id="saCardAov">
                <div class="sa-kpi-card-title" id="saKpiAovTitle">Avg transaction</div>
                <div class="sa-kpi-card-value" id="saValAov">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaAov">—</div>
              </button>
              <button type="button" class="sa-kpi-card sa-kpi-cake-only" data-sa-metric="wallet" id="saCardWallet">
                <div class="sa-kpi-card-title">Wallet spend</div>
                <div class="sa-kpi-card-value" id="saValWallet">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaWallet">—</div>
              </button>
              <button type="button" class="sa-kpi-card sa-kpi-cake-only" data-sa-metric="points" id="saCardPts">
                <div class="sa-kpi-card-title">Points redeemed</div>
                <div class="sa-kpi-card-value" id="saValPts">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaPts">—</div>
              </button>
            </div>

            <p class="sa-substats" id="saSubstats">
              <strong>Scope:</strong> <span id="saScopeText">Cake — paid shop orders by <code>placed_at</code> (UTC). Includes placed and completed; excludes unpaid/cancelled.</span>
              <span id="saSubstatsCake"> · <strong>Open orders (placed in range):</strong> <span id="saOpen">—</span>
              · <strong>Points issued:</strong> <span id="saPtsIn">—</span>
              · <strong>Wallet top-up:</strong> <span id="saWalTop">—</span>
              · <strong>Vouchers issued / redeemed:</strong> <span id="saVIss">—</span> / <span id="saVRed">—</span></span>
            </p>

            <div class="sa-chart-card">
              <div class="sa-chart-head">
                <div class="sa-chart-head-title" id="saChartTitleLabel">Gross merchandise value</div>
                <div class="sa-chart-controls">
                  <label class="muted-hint" style="width:auto;margin:0;font-size:12px">Chart
                    <select id="saChartStyle" aria-label="Chart type" style="margin-left:6px">
                      <option value="area">Area</option>
                      <option value="line">Line</option>
                    </select>
                  </label>
                </div>
              </div>
              <div id="saLineChart" class="sa-line-chart-wrap" aria-label="Sales trend chart"></div>
            </div>

            <div class="sa-split">
              <div class="sa-panel">
                <div class="sa-panel-head">Best seller</div>
                <div class="sa-panel-body"><div class="sa-panel-body-inner" id="saBestSeller">Apply filters to load data.</div></div>
              </div>
              <div class="sa-panel">
                <div class="sa-panel-head" id="saTopPanelHead">Top products (quantity)</div>
                <div class="table-wrap">
                  <table class="data">
                    <thead id="saTopHead"><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Revenue</th><th>Orders</th></tr></thead>
                    <tbody id="saTopBody"></tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="sa-export-block sa-panel">
              <div class="sa-export-head">
                <h3>Export</h3>
                <span class="muted-hint" style="width:auto;margin:0;font-size:12px">Period breakdown</span>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Period start (UTC)</th><th>GMV</th><th>Orders</th><th>Avg basket</th></tr></thead>
                  <tbody id="saSeriesBody"></tbody>
                </table>
              </div>
            </div>

            <div class="sa-export-block sa-panel" id="saDailySalesPanel" style="margin-top:20px">
              <div class="sa-export-head">
                <h3>Daily sales by item (completed orders)</h3>
                <span class="muted-hint" style="width:auto;margin:0;font-size:12px">UTC business day · close books when reconciled</span>
              </div>
              <div style="padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
                <div class="form-section" style="margin:0">
                  <label for="dcDate">Business date (UTC)</label>
                  <input type="date" id="dcDate" />
                </div>
                <button type="button" class="btn-primary" id="dcLoadBtn">Load day</button>
                <span id="dcClosedBadge" class="muted-hint" style="margin:0"></span>
                <button type="button" class="btn-outline" id="dcCloseBtn">Close day</button>
              </div>
              <p class="muted-hint" id="dcSummary" style="margin:0 16px 12px;font-size:13px"></p>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Revenue</th></tr></thead>
                  <tbody id="dcItemsBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="dcResult" style="padding:0 16px 16px;margin:0"></p>
            </div>
            <p class="muted-hint" id="saLoadHint" style="margin:12px 4px 0;font-size:12px"></p>
          </div>
        </section>

        <section id="finance-overview" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-toolbar">
              <div class="sa-toolbar-presets">
                <button type="button" class="btn-outline" id="finPreset7">Last 7 days</button>
                <button type="button" class="btn-outline" id="finPreset30">Last 30 days</button>
                <button type="button" class="btn-outline" id="finPresetMtd">Month to date</button>
              </div>
              <div class="sa-toolbar-group">
                <label for="finFrom">From (UTC)</label>
                <input type="date" id="finFrom" />
              </div>
              <div class="sa-toolbar-group">
                <label for="finTo">To (UTC, inclusive)</label>
                <input type="date" id="finTo" />
              </div>
              <div class="sa-toolbar-group">
                <label for="finBucket">Bucket</label>
                <select id="finBucket" aria-label="Time bucket">
                  <option value="day" selected>Days</option>
                  <option value="week">Weeks</option>
                  <option value="month">Months</option>
                </select>
              </div>
              <div class="sa-toolbar-actions">
                <button type="button" class="btn-primary" id="finRefreshBtn">Apply</button>
              </div>
            </div>

            <div class="sa-kpi-strip" id="finKpiStrip">
              <div class="sa-kpi-card is-active">
                <div class="sa-kpi-card-title">Total revenue (all channels)</div>
                <div class="sa-kpi-card-value" id="finValRevenue">—</div>
                <div class="sa-kpi-card-delta" id="finDeltaRevenue">—</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Transactions</div>
                <div class="sa-kpi-card-value" id="finValOrders">—</div>
                <div class="sa-kpi-card-delta" id="finDeltaOrders">—</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Avg transaction</div>
                <div class="sa-kpi-card-value" id="finValAov">—</div>
                <div class="sa-kpi-card-delta">&nbsp;</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Refunds</div>
                <div class="sa-kpi-card-value" id="finValRefunds">—</div>
                <div class="sa-kpi-card-delta" id="finRefundsDetail">—</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Net revenue</div>
                <div class="sa-kpi-card-value" id="finValNet">—</div>
                <div class="sa-kpi-card-delta">after refunds</div>
              </div>
            </div>

            <p class="sa-substats">
              <strong>Scope:</strong> in-store POS (SalesPlay receipts, MYT business day, online-order settlements excluded),
              online shop (paid orders), and bento (successful payments). One consolidated set of numbers — online orders
              are never double-counted when they settle at the POS.
            </p>

            <div class="sa-chart-card">
              <div class="sa-chart-head">
                <div class="sa-chart-head-title">Revenue by channel</div>
                <div class="sa-chart-controls" id="finChartLegend"></div>
              </div>
              <div id="finChannelChart" class="sa-line-chart-wrap" aria-label="Revenue by channel chart"></div>
            </div>

            <div class="sa-split">
              <div class="sa-panel">
                <div class="sa-panel-head">Channel breakdown</div>
                <div class="table-wrap">
                  <table class="data">
                    <thead><tr><th>Channel</th><th>Revenue</th><th>Txns</th><th>Avg</th><th>Refunds</th></tr></thead>
                    <tbody id="finChannelBody"></tbody>
                  </table>
                </div>
              </div>
              <div class="sa-panel">
                <div class="sa-panel-head">Payment methods</div>
                <div class="table-wrap">
                  <table class="data">
                    <thead><tr><th>Method</th><th>Revenue</th><th>Txns</th></tr></thead>
                    <tbody id="finMethodsBody"></tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="sa-export-block sa-panel">
              <div class="sa-export-head">
                <h3>Top products across channels</h3>
                <span class="muted-hint" style="width:auto;margin:0;font-size:12px">By revenue in range</span>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Channel</th><th>Product</th><th>SKU / code</th><th>Qty</th><th>Revenue</th></tr></thead>
                  <tbody id="finTopBody"></tbody>
                </table>
              </div>
            </div>
            <p class="muted-hint" id="finOverviewHint" style="margin:12px 4px 0;font-size:12px"></p>
          </div>
        </section>

        <section id="finance-transactions" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-toolbar">
              <div class="sa-toolbar-group">
                <label for="ftFrom">From (UTC)</label>
                <input type="date" id="ftFrom" />
              </div>
              <div class="sa-toolbar-group">
                <label for="ftTo">To (UTC, inclusive)</label>
                <input type="date" id="ftTo" />
              </div>
              <div class="sa-toolbar-group">
                <label for="ftChannel">Channel</label>
                <select id="ftChannel" aria-label="Channel filter">
                  <option value="" selected>All channels</option>
                  <option value="pos">In-store POS</option>
                  <option value="online_shop">Online shop</option>
                  <option value="bento">Bento</option>
                </select>
              </div>
              <div class="sa-toolbar-group">
                <label for="ftMinRm">Min amount (RM)</label>
                <input type="number" id="ftMinRm" min="0" step="0.01" placeholder="—" style="width:110px" />
              </div>
              <div class="sa-toolbar-group">
                <label for="ftMaxRm">Max amount (RM)</label>
                <input type="number" id="ftMaxRm" min="0" step="0.01" placeholder="—" style="width:110px" />
              </div>
              <div class="sa-toolbar-actions">
                <button type="button" class="btn-primary" id="ftRefreshBtn">Apply</button>
                <button type="button" class="btn-outline" id="ftExportCsv">Export CSV</button>
              </div>
            </div>

            <p class="sa-substats" id="ftSummary"><strong>Filtered total:</strong> — </p>

            <div class="sa-export-block sa-panel">
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Channel</th><th>Date / time (UTC)</th><th>Amount</th><th>Payment</th><th>Ref</th><th>Customer</th><th>Phone</th></tr></thead>
                  <tbody id="ftBody"></tbody>
                </table>
              </div>
              <div style="display:flex;align-items:center;gap:12px;padding:12px 16px">
                <button type="button" class="btn-outline" id="ftPrevBtn">‹ Prev</button>
                <span class="muted-hint" style="margin:0;width:auto" id="ftPageInfo">—</span>
                <button type="button" class="btn-outline" id="ftNextBtn">Next ›</button>
              </div>
            </div>
          </div>
        </section>

        <section id="finance-daily" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-export-block sa-panel" style="margin-top:0">
              <div class="sa-export-head">
                <h3>Daily close — all channels</h3>
                <span class="muted-hint" style="width:auto;margin:0;font-size:12px">UTC business day · close books when reconciled</span>
              </div>
              <div style="padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
                <div class="form-section" style="margin:0">
                  <label for="fdDate">Business date (UTC)</label>
                  <input type="date" id="fdDate" />
                </div>
                <button type="button" class="btn-primary" id="fdLoadBtn">Load day</button>
                <span id="fdClosedBadge" class="muted-hint" style="margin:0"></span>
                <button type="button" class="btn-outline" id="fdCloseBtn">Close day</button>
              </div>
              <div class="sa-kpi-strip" style="padding:0 16px 12px">
                <div class="sa-kpi-card is-active">
                  <div class="sa-kpi-card-title">All channels</div>
                  <div class="sa-kpi-card-value" id="fdValTotal">—</div>
                  <div class="sa-kpi-card-delta" id="fdCountTotal">—</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">In-store POS</div>
                  <div class="sa-kpi-card-value" id="fdValPos">—</div>
                  <div class="sa-kpi-card-delta" id="fdCountPos">—</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">Online shop</div>
                  <div class="sa-kpi-card-value" id="fdValOnline">—</div>
                  <div class="sa-kpi-card-delta" id="fdCountOnline">—</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">Bento</div>
                  <div class="sa-kpi-card-value" id="fdValBento">—</div>
                  <div class="sa-kpi-card-delta" id="fdCountBento">—</div>
                </div>
              </div>
              <div class="sa-export-head" style="border-top:1px solid rgba(148,163,184,0.15)">
                <h3 style="font-size:14px">Online shop items (completed orders)</h3>
                <span class="muted-hint" style="width:auto;margin:0;font-size:12px">POS item detail lives in SalesPlay receipts</span>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Revenue</th></tr></thead>
                  <tbody id="fdItemsBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="fdResult" style="padding:0 16px 16px;margin:0"></p>
            </div>
          </div>
        </section>

        <section id="finance-sync" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-export-block sa-panel" style="margin-top:0">
              <div class="sa-export-head">
                <h3>SalesPlay POS sync health</h3>
                <div style="display:flex;gap:8px">
                  <button type="button" class="btn-outline" id="fsRefreshBtn">Refresh</button>
                  <button type="button" class="btn-primary" id="fsPullBtn">Pull now (reconcile)</button>
                  <button type="button" class="btn-outline" id="fsBackfillBtn">Backfill history</button>
                </div>
              </div>
              <div class="sa-kpi-strip" style="padding:12px 16px">
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">Connection</div>
                  <div class="sa-kpi-card-value" id="fsValConfigured" style="font-size:18px">—</div>
                  <div class="sa-kpi-card-delta" id="fsFlagsDetail">—</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">Last webhook</div>
                  <div class="sa-kpi-card-value" id="fsValWebhook" style="font-size:18px">—</div>
                  <div class="sa-kpi-card-delta">real-time receipt push</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">Last pull</div>
                  <div class="sa-kpi-card-value" id="fsValPull" style="font-size:18px">—</div>
                  <div class="sa-kpi-card-delta">backfill / reconciliation</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">Receipts today (MYT)</div>
                  <div class="sa-kpi-card-value" id="fsValToday">—</div>
                  <div class="sa-kpi-card-delta" id="fsTodayDetail">—</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">Receipts total</div>
                  <div class="sa-kpi-card-value" id="fsValTotal">—</div>
                  <div class="sa-kpi-card-delta" id="fsCreditsDetail">—</div>
                </div>
              </div>
              <p class="muted-hint" style="margin:0 16px 12px;font-size:13px" id="fsHint">
                Webhooks are the live path; the nightly pull is the integrity net. If "Last webhook" goes stale on a
                trading day, check the SalesPlay Back Office webhook configuration, then run a manual pull.
              </p>
              <p class="field-hint" id="fsResult" style="padding:0 16px 16px;margin:0"></p>
            </div>
          </div>
        </section>

        <section id="settings-system" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Sales reporting start date</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="reportingClearBtn">Clear</button>
                <button type="button" class="btn-primary" id="reportingSaveBtn">Save</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:560px">
              <p class="field-hint" style="margin-top:0">
                Charges dated <strong>before</strong> this date are hidden from all sales reports — Sales &amp; transactions (cake and bento), Bento overview, daily commerce, and dashboard GMV. Set it to your <strong>launch date</strong> to exclude test-phase charges and reset the displayed sales to 0. Leave it empty to show full history.
              </p>
              <div style="padding:10px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:13px;color:#065f46;margin-bottom:12px">
                <strong>Non-destructive.</strong> This only filters what reports show — no payment records are deleted. Clearing the date brings every charge back.
              </div>
              <label for="reportingStartDate">Start date (UTC)</label>
              <input type="date" id="reportingStartDate" style="max-width:200px" />
              <p class="field-hint" id="reportingSaveResult" style="margin-top:10px"></p>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head">
              <h2>Payments test mode</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-primary" id="demoModeSaveBtn">Save</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:560px">
              <p class="field-hint" style="margin-top:0">
                For staff training/rehearsal only. When ON, every shop checkout on this server skips
                Xendit/TNG and completes as a dummy payment instead &mdash; for <strong>all customers</strong>,
                not just staff. The order still gets a pickup QR, staff still scan it to collect, and
                points are still awarded automatically.
              </p>
              <div style="padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#991b1b;margin-bottom:12px">
                <strong>Never enable this in production.</strong> It disables real payment collection for everyone.
              </div>
              <label for="demoModeSelect">Mode</label>
              <select id="demoModeSelect" style="max-width:280px">
                <option value="true">On &mdash; force test mode</option>
                <option value="false">Off &mdash; force real payments</option>
                <option value="null">Use server default (.env)</option>
              </select>
              <p class="field-hint" id="demoModeResult" style="margin-top:10px"></p>
            </div>
          </div>
        </section>

        <section id="settings-shopping-catalog" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Shopping catalog</h2><div class="sheet-actions"><button type="button" class="btn-primary" id="scAddProductBtn">+ New product</button><button type="button" class="btn-outline" id="refreshShopCatalogBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th class="sc-sortable" data-sort="name">Name <span class="sc-sort-ind" data-ind="name"></span></th>
                    <th class="sc-sortable" data-sort="category">Category <span class="sc-sort-ind" data-ind="category"></span></th>
                    <th class="sc-sortable" data-sort="price">Price <span class="sc-sort-ind" data-ind="price"></span></th>
                    <th class="sc-sortable" data-sort="sort">Sort <span class="sc-sort-ind" data-ind="sort"></span></th>
                    <th class="sc-sortable" data-sort="visible">Visible <span class="sc-sort-ind" data-ind="visible"></span></th>
                    <th>Edit</th>
                  </tr>
                  <tr class="sc-filter-row">
                    <th><input type="text" id="scFilterName" placeholder="Filter name…" /></th>
                    <th><select id="scFilterCategory"><option value="">All</option></select></th>
                    <th><input type="text" id="scFilterPrice" placeholder="Filter price…" /></th>
                    <th><input type="text" id="scFilterSort" placeholder="Filter…" /></th>
                    <th><select id="scFilterVisible"><option value="">All</option><option value="yes">Yes</option><option value="no">No</option></select></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="shopCatalogBody"></tbody>
              </table>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head">
              <h2>Sync from moja-sites</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="scSyncPreviewBtn">Preview sync</button>
                <button type="button" class="btn-primary" id="scSyncApplyBtn">Apply sync</button>
              </div>
            </div>
            <div style="padding:16px 20px;max-width:960px">
              <p class="field-hint" style="margin-top:0">
                Pull prices, images, and availability from moja-sites <code>products.catalog.json</code> into the live member catalog (<code>data/shop-catalog.products.json</code>).
                Use this when the shop site and member app show different prices or pictures.
              </p>
              <div style="padding:10px 12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:13px;color:#065f46;margin-bottom:12px">
                <strong>Manual edits win.</strong> Any field you have edited in admin (price, photo, variants, etc.) is locked from sync and will <em>not</em> be reverted.
                To let sync take over a product again, open the product and click <em>Allow sync to overwrite this product</em>.
              </div>
              <div class="form-section" style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
                <label for="scSitesCatalogFile"><strong>Catalog file on server</strong> (required on Render)</label>
                <p class="field-hint" id="scSitesCatalogFileHint" style="margin:6px 0 10px">Checking…</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                  <input type="file" id="scSitesCatalogFile" accept=".json,application/json" />
                  <button type="button" class="btn-outline" id="scSitesCatalogSaveBtn">Save catalog to server</button>
                </div>
                <p class="field-hint" style="margin:8px 0 0">Upload once from your PC — stored at <code>data/products.catalog.json</code> on your persistent disk. Sync always reads this file (no path picker). Or set <code>MOJA_SITES_CATALOG_URL</code> on Render.</p>
                <p class="field-hint" id="scSitesCatalogSaveResult"></p>
              </div>
              <div class="form-section">
                <label for="scSyncMode">Sync mode</label>
                <select id="scSyncMode">
                  <option value="pricing_and_media" selected>Pricing &amp; media only (keep names/descriptions)</option>
                  <option value="full">Full product copy (keep visibility &amp; sort order)</option>
                </select>
              </div>
              <div class="form-section">
                <label><input type="checkbox" id="scSyncCreateMissing" style="width:auto;margin-right:8px" checked /> Add products that exist in moja-sites but not in member catalog</label>
              </div>
              <div class="form-section">
                <label><input type="checkbox" id="scSyncLayout" style="width:auto;margin-right:8px" /> Also sync shop layout (featured + sections)</label>
              </div>
              <div class="form-section">
                <label><input type="checkbox" id="scSyncWriteSeed" style="width:auto;margin-right:8px" /> Also update <code>config/</code> seed files (for git commits)</label>
              </div>
              <p class="field-hint" id="scSyncSourceHint">Source: server default path or <code>MOJA_SITES_CATALOG_URL</code> when set.</p>
              <p class="field-hint" id="scSyncResult"></p>
              <div id="scSyncSummary" style="display:none;margin:12px 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px"></div>
              <div class="table-wrap" id="scSyncPreviewWrap" style="display:none">
                <table class="data">
                  <thead><tr><th style="width:64px">Image</th><th>Product</th><th style="width:110px">Status</th><th>Changes</th></tr></thead>
                  <tbody id="scSyncPreviewBody"></tbody>
                </table>
              </div>
            </div>
          </div>
          <div id="scModalBackdrop" class="modal-backdrop hidden" aria-hidden="true"></div>
          <div id="scModal" class="modal-panel hidden" role="dialog" aria-modal="true" aria-labelledby="scModalTitle" style="width:min(760px, calc(100vw - 24px))">
            <div class="modal-head">
              <h2 id="scModalTitle">Edit product</h2>
              <button type="button" class="icon-btn" id="scModalClose" aria-label="Close" style="margin:0">&times;</button>
            </div>
            <div class="modal-body">
              <input type="hidden" id="scId" />
              <div class="form-row-2">
                <div class="form-section"><label for="scIdVisible">Product ID (slug)</label><input type="text" id="scIdVisible" placeholder="e.g. caramel-espresso-gateau" /></div>
                <div class="form-section"><label for="scCategoryLabel">Storefront category label</label><input type="text" id="scCategoryLabel" placeholder="e.g. Premium Cake" /></div>
              </div>
              <div class="form-row-2">
                <div class="form-section"><label for="scName">Name</label><input type="text" id="scName" /></div>
                <div class="form-section"><label for="scCategory">Category</label>
                  <select id="scCategory">
                    <option value="whole_cakes">whole_cakes</option>
                    <option value="cake_slices">cake_slices</option>
                    <option value="drinks">drinks</option>
                    <option value="specials">specials</option>
                  </select>
                </div>
              </div>
              <div class="form-section"><label for="scShort">Short description</label><input type="text" id="scShort" /></div>
              <div class="form-section"><label for="scDesc">Description</label><textarea id="scDesc"></textarea></div>
              <div class="form-section">
                <label for="scImageFile">Product image</label>
                <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
                  <div id="scImageThumb" style="position:relative;width:160px;height:120px;border-radius:12px;border:1px dashed #cbd5e1;background:#f8fafc center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px;flex-shrink:0;cursor:grab;user-select:none" title="Drag to recenter the focal point">No image</div>
                  <div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:8px">
                    <input type="file" id="scImageFile" accept="image/png,image/jpeg,image/webp,image/gif" />
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                      <button type="button" class="btn-outline" id="scImageUploadBtn">Upload image</button>
                      <button type="button" class="btn-outline" id="scImageClearBtn">Remove image</button>
                    </div>
                    <p class="field-hint">PNG / JPEG / WEBP / GIF, max 5 MB. <strong>Save the product first</strong>, then upload an image.</p>
                    <p class="field-hint" id="scImageResult"></p>
                  </div>
                </div>
                <input type="hidden" id="scImageUrl" />
              </div>

              <div class="form-section" id="scImageFramingSection">
                <label>Image framing</label>
                <p class="field-hint" style="margin-top:0">Drag the preview above, or use the sliders to recenter the photo. Useful when the product isn't centered in the source image.</p>
                <div class="form-row-2" style="gap:16px">
                  <div>
                    <label for="scImageOffsetX" style="font-size:12px;color:#64748b">Horizontal <span id="scImageOffsetXVal">50</span>%</label>
                    <input type="range" id="scImageOffsetX" min="0" max="100" step="1" value="50" style="width:100%" />
                  </div>
                  <div>
                    <label for="scImageOffsetY" style="font-size:12px;color:#64748b">Vertical <span id="scImageOffsetYVal">50</span>%</label>
                    <input type="range" id="scImageOffsetY" min="0" max="100" step="1" value="50" style="width:100%" />
                  </div>
                </div>
                <div class="form-row-2" style="gap:16px;margin-top:8px;align-items:end">
                  <div>
                    <label for="scImageScale" style="font-size:12px;color:#64748b">Zoom <span id="scImageScaleVal">1.00</span>×</label>
                    <input type="range" id="scImageScale" min="1" max="3" step="0.05" value="1" style="width:100%" />
                  </div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;padding-bottom:4px">
                    <button type="button" class="btn-outline" id="scImageRecenterBtn">Reset framing</button>
                  </div>
                </div>
                <p class="field-hint" style="margin-top:6px;color:#92400e">Click <strong>Save product</strong> below to apply.</p>
              </div>
              <div class="form-row-2">
                <div class="form-section"><label for="scPrice">Base price (cents)</label><input type="number" id="scPrice" min="0" step="1" /></div>
                <div class="form-section"><label for="scPriceDisplay">Price label</label><input type="text" id="scPriceDisplay" placeholder="RM168.00" /></div>
              </div>
              <div class="form-section">
                <label>Variants (sizes)</label>
                <div class="table-wrap">
                  <table class="data" style="margin-bottom:8px">
                    <thead><tr><th>Label</th><th style="width:140px">Price (RM)</th><th style="width:150px">SalesPlay code</th><th style="width:100px;text-align:center">Available</th><th style="width:60px">Remove</th></tr></thead>
                    <tbody id="scVariantsBody"></tbody>
                  </table>
                </div>
                <button type="button" class="btn-outline" id="scAddVariantBtn">Add variant</button>
                <p class="field-hint">Add one row per size (e.g. <code>6 inch</code>, <code>8 inch</code>). The storefront shows the lowest available variant price. Leave empty for single-size products and rely on the Base price above.</p>
              </div>
              <div class="form-section">
                <label for="scSalesplayCode">SalesPlay product code (POS)</label>
                <input type="text" id="scSalesplayCode" list="scSalesplayCodesList" placeholder="Code of the matching product in SalesPlay" />
                <datalist id="scSalesplayCodesList"></datalist>
                <p class="field-hint">Links this product to its SalesPlay POS product so online orders pushed to SalesPlay carry the POS product code, and in-store receipts count toward the same product in reports. For sized products, also fill the per-variant <strong>SalesPlay code</strong> column above — a variant code wins over this product-level code. Suggestions are codes seen on synced POS receipts.</p>
              </div>
              <div class="form-row-2">
                <div class="form-section"><label for="scSort">Sort order</label><input type="number" id="scSort" step="1" value="0" /></div>
                <div class="form-section"><label for="scBadge">Badge (optional)</label><input type="text" id="scBadge" placeholder="New, Best seller…" /></div>
              </div>
              <div class="form-section"><label><input type="checkbox" id="scActive" style="width:auto;margin-right:8px" /> Show in shop</label></div>
              <div class="form-section"><label><input type="checkbox" id="scSoldOut" style="width:auto;margin-right:8px" /> Mark sold out</label></div>
              <div class="form-section" id="scOverridesPanel" style="padding:10px 12px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;display:none">
                <strong style="color:#92400e">Manual edits protected from sync</strong>
                <p class="field-hint" id="scOverridesList" style="margin:6px 0 8px">—</p>
                <button type="button" class="btn-outline" id="scResetOverridesBtn">Allow sync to overwrite this product</button>
                <p class="field-hint" id="scResetOverridesResult"></p>
              </div>
              <p class="field-hint" id="scSaveResult"></p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-outline" id="scModalCancel">Cancel</button>
              <button type="button" class="btn-primary" id="scSaveBtn">Save product</button>
            </div>
          </div>
        </section>

        <section id="bento-overview" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-toolbar">
              <div class="sa-toolbar-presets">
                <button type="button" class="btn-outline" id="boPreset7">Last 7 days</button>
                <button type="button" class="btn-outline" id="boPreset30">Last 30 days</button>
                <button type="button" class="btn-outline" id="boPresetMtd">Month to date</button>
              </div>
              <div class="sa-toolbar-group">
                <label for="boFrom">From (UTC)</label>
                <input type="date" id="boFrom" />
              </div>
              <div class="sa-toolbar-group">
                <label for="boTo">To (UTC, inclusive)</label>
                <input type="date" id="boTo" />
              </div>
              <div class="sa-toolbar-group">
                <label for="boBucket">Bucket</label>
                <select id="boBucket" aria-label="Time bucket">
                  <option value="day">Days</option>
                  <option value="week">Weeks</option>
                  <option value="month" selected>Months</option>
                </select>
              </div>
              <div class="sa-toolbar-actions">
                <button type="button" class="btn-primary" id="boRefreshBtn">Apply</button>
              </div>
            </div>

            <p class="field-hint" style="margin:0 0 12px" id="boScopeText">
              Marketing funnel for the Bento member app — every registered member vs how many actually paid for a meal plan. Totals are all-time; the date range below drives the "new in range" figures and the registrations-vs-payments chart.
            </p>

            <div class="sa-kpi-strip" id="boKpiStrip">
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Registered members</div>
                <div class="sa-kpi-card-value" id="boValMembers">—</div>
                <div class="sa-kpi-card-delta"><span id="boNewMembers">—</span> new in range</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Paid members</div>
                <div class="sa-kpi-card-value" id="boValPaid">—</div>
                <div class="sa-kpi-card-delta"><span id="boNewPaid">—</span> first paid in range</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Conversion rate</div>
                <div class="sa-kpi-card-value" id="boValConv">—</div>
                <div class="sa-kpi-card-delta">paid ÷ registered</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Bento revenue (paid)</div>
                <div class="sa-kpi-card-value" id="boValGmv">—</div>
                <div class="sa-kpi-card-delta"><span id="boPayTxns">—</span> payments total</div>
              </div>
            </div>

            <div class="sheet" style="margin-top:16px">
              <div class="sheet-head">
                <h2>Registered vs paid</h2>
              </div>
              <div style="padding:16px 20px">
                <div id="boFunnelBar" style="max-width:680px"></div>
                <p class="field-hint" id="boFunnelHint" style="margin-top:10px">Apply a date range to load the funnel.</p>
              </div>
            </div>

            <div class="sheet" style="margin-top:16px">
              <div class="sheet-head">
                <h2>Registrations vs payments by period</h2>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr><th>Period</th><th>New registrations</th><th>Bento payments</th><th>Revenue (RM)</th></tr>
                  </thead>
                  <tbody id="boSeriesBody">
                    <tr><td colspan="4" class="muted-hint">Apply a date range to load.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="bento-sales" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-toolbar">
              <div class="sa-toolbar-presets">
                <button type="button" class="btn-outline" id="bsPreset7">Last 7 days</button>
                <button type="button" class="btn-outline" id="bsPreset30">Last 30 days</button>
                <button type="button" class="btn-outline" id="bsPresetMtd">Month to date</button>
              </div>
              <div class="sa-toolbar-group">
                <label for="bsFrom">From (UTC)</label>
                <input type="date" id="bsFrom" />
              </div>
              <div class="sa-toolbar-group">
                <label for="bsTo">To (UTC, inclusive)</label>
                <input type="date" id="bsTo" />
              </div>
              <div class="sa-toolbar-group">
                <label for="bsBucket">Bucket</label>
                <select id="bsBucket" aria-label="Time bucket">
                  <option value="day">Days</option>
                  <option value="week">Weeks</option>
                  <option value="month" selected>Months</option>
                </select>
              </div>
              <div class="sa-toolbar-actions">
                <button type="button" class="btn-primary" id="bsRefreshBtn">Apply</button>
              </div>
            </div>

            <p class="field-hint" style="margin:0 0 12px">
              Bento-only sales — successful subscription payments by payment date (UTC). Fully separate from cake-shop sales.
            </p>

            <div class="sa-kpi-strip">
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Bento revenue (paid)</div>
                <div class="sa-kpi-card-value" id="bsValGmv">—</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Paid plans</div>
                <div class="sa-kpi-card-value" id="bsValOrders">—</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Avg plan value</div>
                <div class="sa-kpi-card-value" id="bsValAov">—</div>
              </div>
            </div>

            <div class="sheet" style="margin-top:16px">
              <div class="sheet-head"><h2>Sales by period</h2></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Period</th><th>Payments</th><th>Revenue (RM)</th></tr></thead>
                  <tbody id="bsSeriesBody"><tr><td colspan="3" class="muted-hint">Apply a date range to load.</td></tr></tbody>
                </table>
              </div>
            </div>

            <div class="sheet" style="margin-top:16px">
              <div class="sheet-head"><h2>Top packages (sales)</h2></div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Package</th><th>Code</th><th>Sales</th><th>Revenue (RM)</th><th>Payments</th></tr></thead>
                  <tbody id="bsTopBody"><tr><td colspan="5" class="muted-hint">Apply a date range to load.</td></tr></tbody>
                </table>
              </div>
            </div>

            <div class="sheet" style="margin-top:16px">
              <div class="sheet-head">
                <h2>Recent transactions</h2>
                <div class="sheet-actions"><span class="field-hint" id="bsTxnHint"></span></div>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Paid at (UTC)</th><th>Member</th><th>Phone</th><th>Package</th><th>Meal</th><th>Voucher</th><th>Amount (RM)</th></tr></thead>
                  <tbody id="bsTxnBody"><tr><td colspan="7" class="muted-hint">Apply a date range to load.</td></tr></tbody>
                </table>
              </div>
            </div>

            <div class="sheet" style="margin-top:16px">
              <div class="sheet-head">
                <h2>Pickup progress by customer</h2>
                <div class="sheet-actions">
                  <label class="field-hint" style="display:flex;align-items:center;gap:6px;margin:0;cursor:pointer">
                    <input type="checkbox" id="bsProgressShowArchived" />
                    Show archived
                  </label>
                  <input type="search" id="bsProgressSearch" placeholder="Filter by name / phone" style="max-width:220px" />
                  <span class="field-hint" id="bsProgressHint"></span>
                </div>
              </div>
              <p class="field-hint" style="margin:0 20px 8px">
                All paid plans (active + completed), independent of the date range above. Collected = boxes handed over at the kitchen; Left = meals the customer can still pick up. Plans with the most meals owed are listed first. Days left counts down the package validity window (e.g. 90 days on the 30-meal plan) from the day of purchase — nudge customers with few days and many meals left to book their pickups. Archiving only hides a row from this report — the plan and its pickup history are untouched.
              </p>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Member</th><th>Phone</th><th>Package</th><th>Plan status</th><th>Total meals</th><th>Collected</th><th>Booked upcoming</th><th>Not yet booked</th><th>Left to collect</th><th>Days left</th><th></th></tr></thead>
                  <tbody id="bsProgressBody"><tr><td colspan="11" class="muted-hint">Loading…</td></tr></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="bento-operations" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Bento operations</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-primary" id="bentoSettingsSaveBtn">Save capacity</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:520px">
              <p class="field-hint" style="margin-top:0">
                Limit how many <strong>packs</strong> (each lunch or dinner counts as one pack) can be scheduled on the same calendar day across all customers. Scheduling is rejected when a day would exceed this limit.
              </p>
              <label for="bentoDailyCapacity">Daily capacity (packs)</label>
              <input type="number" id="bentoDailyCapacity" min="1" max="10000" step="1" value="50" style="max-width:160px" />
              <label for="bentoEarliestPickupDate" style="margin-top:14px">Earliest pickup date (service launch)</label>
              <input type="date" id="bentoEarliestPickupDate" style="max-width:200px" />
              <p class="field-hint" style="margin-top:4px">
                Optional. Members cannot schedule pickups before this date (combined with lead days below). Leave empty for no launch date.
              </p>
              <label for="bentoMinScheduleLeadDays" style="margin-top:14px">Min schedule lead (days)</label>
              <input type="number" id="bentoMinScheduleLeadDays" min="0" max="30" step="1" value="1" style="max-width:120px" />
              <p class="field-hint" style="margin-top:4px">
                Pickup must be at least this many days after today (e.g. 1 = tomorrow at earliest, 2 = day after tomorrow).
              </p>
              <label for="bentoScheduleCutoffHour" style="margin-top:14px">Daily order cutoff (hour, 0–23)</label>
              <input type="number" id="bentoScheduleCutoffHour" min="0" max="23" step="1" value="18" style="max-width:120px" />
              <p class="field-hint" style="margin-top:4px">
                Malaysia time. After this hour the nearest lead day closes. With lead = 1 and cutoff = 18, members can book tomorrow only before 6pm today; after 6pm the earliest becomes the day after.
              </p>
              <label for="bentoClosedDates" style="margin-top:14px">Extra closed dates</label>
              <textarea id="bentoClosedDates" rows="3" placeholder="2026-12-25&#10;2026-01-01" style="max-width:320px;font-family:inherit"></textarea>
              <p class="field-hint" style="margin-top:4px">
                One-off closures (public holidays). One <code>YYYY-MM-DD</code> per line.
              </p>
              <label class="field-hint" style="display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer">
                <input type="checkbox" id="bentoBlockNewOrders" />
                Pause all new meal plan orders (manual override)
              </label>
              <p class="field-hint" style="margin-top:4px">
                When paused, customers cannot checkout even if individual days have slots. Automatic capacity checks still apply when this is off.
              </p>
              <p class="field-hint" id="bentoSettingsSaveResult"></p>
              <p class="field-hint" id="bentoSettingsEnvHint" style="display:none;color:#b45309"></p>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head">
              <h2>Member booking fix</h2>
            </div>
            <div style="padding:12px 20px;max-width:820px">
              <p class="field-hint" style="margin-top:0">
                Customer paid but <strong>can't schedule</strong>? Look them up by phone to check their plan status. A plan stuck on <strong>PENDING_PAYMENT</strong> is what blocks scheduling — click <strong>Activate</strong> to unblock it (this re-checks Xendit first, then lets you force it with a reason). For any <strong>ACTIVE</strong> plan, click <strong>Schedule</strong> to pick meal pickup days on the member's behalf.
              </p>
              <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
                <div style="display:flex;flex-direction:column;gap:4px">
                  <label for="bentoFixPhone">Customer phone</label>
                  <input type="tel" id="bentoFixPhone" placeholder="012-345 6789 or +60123456789" style="min-width:260px" />
                </div>
                <button type="button" class="btn-primary" id="bentoFixSearchBtn">Look up</button>
              </div>
              <p class="field-hint" id="bentoFixMsg" style="margin-top:8px"></p>
              <div id="bentoFixResult" style="margin-top:12px"></div>
            </div>
          </div>
        </section>

        <section id="bento-pricing" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Bento package pricing</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshBentoPackagesBtn">Refresh</button>
                <button type="button" class="btn-primary" id="bentoPackagesSaveBtn">Save pricing</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1100px">
              <p class="field-hint" style="margin-top:0">
                Prices shown in the Bento client app at checkout. Amounts are in <strong>RM</strong> (stored as cents in the database). The trial pack can use a <strong>fixed checkout</strong> total instead of per-meal pricing. Inactive packages are hidden from customers.
              </p>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Label</th>
                      <th>Meals</th>
                      <th>Valid (days)</th>
                      <th>Price / meal (RM)</th>
                      <th>Fixed checkout (RM)</th>
                      <th style="text-align:center">Active</th>
                    </tr>
                  </thead>
                  <tbody id="bentoPackagesBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="bentoPackagesSaveResult"></p>
            </div>
          </div>
        </section>

        <section id="bento-menu" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Bento weekly menu</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="bentoMenuTemplateBtn">Download template</button>
                <button type="button" class="btn-outline" id="bentoMenuImportBtn">Import file</button>
                <input type="file" id="bentoMenuImportFile" accept=".xlsx,.csv" style="display:none" />
                <button type="button" class="btn-outline" id="refreshBentoMenuBtn">Refresh</button>
                <button type="button" class="btn-primary" id="bentoMenuSaveBtn">Save menu</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1040px">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
                <div class="seg" style="display:inline-flex;gap:4px;background:#f1f5f9;padding:4px;border-radius:10px">
                  <button type="button" class="btn-outline bentoMenuWeekBtn" data-week="0" style="border:none">Week 1</button>
                  <button type="button" class="btn-outline bentoMenuWeekBtn" data-week="1" style="border:none">Week 2</button>
                  <button type="button" class="btn-outline bentoMenuWeekBtn" data-week="2" style="border:none">Week 3</button>
                  <button type="button" class="btn-outline bentoMenuWeekBtn" data-week="3" style="border:none">Week 4</button>
                </div>
                <span class="field-hint" id="bentoMenuWeekLabel" style="margin:0;font-weight:600"></span>
              </div>
              <p class="field-hint" style="margin-top:0">
                Week 1 is the current calendar week; Week 2–4 are the following weeks. Pick a week above to edit it in the table, or use the 4-sheet Excel template (<strong>Week 1</strong> … <strong>Week 4</strong> tabs) for bulk edit. Enter English dish names first, then Chinese (中文) below each field. Tick <strong>Closed</strong> to block scheduling on that weekday — closed days are shared across all weeks. Separate from the cake-sales catalog.
              </p>
              <p class="field-hint" style="margin-top:0;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px">
                <strong>Bulk edit:</strong> <strong>Download template</strong> gets one Excel file with four sheets (Week 1–4). Edit each sheet, then <strong>Import file</strong> — all sheets load into the matching week tabs for review. Click <strong>Save menu</strong> on each week tab to publish (or switch tabs after import to check Week 2–4 before saving).
              </p>
              <p class="field-hint" id="bentoMenuImportResult" style="margin-top:0"></p>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Lunch &mdash; Vegetarian</th>
                      <th>Lunch &mdash; Regular</th>
                      <th>Dinner &mdash; Vegetarian</th>
                      <th>Dinner &mdash; Regular</th>
                      <th style="text-align:center">Closed</th>
                    </tr>
                  </thead>
                  <tbody id="bentoMenuBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="bentoMenuSaveResult"></p>
            </div>
          </div>
        </section>

        <section id="bento-vouchers" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Bento discount vouchers</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshBentoVouchersBtn">Refresh</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1040px">
              <p class="field-hint" style="margin-top:0">
                Create a shared promo code to email to customers. Each code gives a <strong>fixed RM amount off</strong> the Bento checkout total, is valid within a date window, and can be used up to its <strong>redemption capacity</strong>. Once the capacity is reached the code stops working automatically.
              </p>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:16px">
                <h3 style="margin:0 0 10px;font-size:14px">New voucher</h3>
                <div class="form-row-2" style="gap:12px;max-width:680px">
                  <div>
                    <label for="bvCode">Code</label>
                    <input type="text" id="bvCode" placeholder="e.g. MOJA5" style="text-transform:uppercase" />
                  </div>
                  <div>
                    <label for="bvAmount">Amount off (RM)</label>
                    <input type="text" id="bvAmount" inputmode="decimal" placeholder="5.00" />
                  </div>
                </div>
                <div class="form-row-2" style="gap:12px;max-width:680px;margin-top:8px">
                  <div>
                    <label for="bvStart">Valid from</label>
                    <input type="datetime-local" id="bvStart" />
                  </div>
                  <div>
                    <label for="bvEnd">Valid until</label>
                    <input type="datetime-local" id="bvEnd" />
                  </div>
                </div>
                <div class="form-row-2" style="gap:12px;max-width:680px;margin-top:8px">
                  <div>
                    <label for="bvCap">Redemption capacity</label>
                    <input type="text" id="bvCap" inputmode="numeric" placeholder="100" />
                  </div>
                  <div>
                    <label for="bvMinSpend">Min spend (RM, optional)</label>
                    <input type="text" id="bvMinSpend" inputmode="decimal" placeholder="—" />
                  </div>
                </div>
                <div style="margin-top:8px;max-width:680px">
                  <label for="bvDesc">Description (optional)</label>
                  <input type="text" id="bvDesc" placeholder="Internal note shown in this list" />
                </div>
                <div style="margin-top:12px;display:flex;align-items:center;gap:12px">
                  <button type="button" class="btn-primary" id="bentoVoucherCreateBtn">Create voucher</button>
                  <span class="field-hint" id="bentoVoucherCreateResult" style="margin:0"></span>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Amount off</th>
                      <th>Window</th>
                      <th>Redeemed / Cap</th>
                      <th>Min spend</th>
                      <th style="text-align:center">Active</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="bentoVouchersBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="bentoVouchersListResult"></p>
            </div>
          </div>
        </section>

        <section id="bento-orders" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Bento kitchen orders</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="bentoOrdersPreviewBtn">Load orders</button>
                <button type="button" class="btn-primary" id="bentoOrdersExportBtn">Export Excel</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1100px">
              <p class="field-hint" style="margin-top:0">
                See who ordered, their pickup day and meals, grouped by date for kitchen prep. The <strong>Awaiting scheduling</strong> panel lists members who paid but haven't booked a pickup yet — select them and copy WhatsApp links to remind them. Excel export adds <strong>Daily</strong>, <strong>Weekly</strong>, <strong>Kitchen pack list</strong> and <strong>Awaiting scheduling</strong> sheets.
              </p>
              <div class="form-row-2" style="gap:12px;max-width:520px;margin-bottom:8px">
                <div>
                  <label for="bentoOrdersFrom">From</label>
                  <input type="date" id="bentoOrdersFrom" />
                </div>
                <div>
                  <label for="bentoOrdersTo">To</label>
                  <input type="date" id="bentoOrdersTo" />
                </div>
              </div>
              <p class="field-hint" id="bentoOrdersExportResult"></p>

              <div id="bentoOrdersSummary" class="bento-orders-summary" style="display:none"></div>

              <h3 style="margin:18px 0 6px">Scheduled pickups</h3>
              <p class="field-hint" style="margin-top:0">Grouped by pickup date. Each row is one member's meal for that day.</p>
              <div id="bentoOrdersScheduled">
                <p class="muted-hint" style="padding:8px 0">Click <strong>Load orders</strong> to see scheduled pickups.</p>
              </div>

              <div class="bento-await-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:26px 0 6px">
                <div>
                  <h3 style="margin:0">Awaiting scheduling <span id="bentoAwaitCount" class="bento-await-badge">0</span></h3>
                  <p class="field-hint" style="margin:2px 0 0">Paid members who haven't booked a pickup day. Use <strong>Schedule</strong> to book pickups on their behalf, or select people to chase and copy WhatsApp links / phone numbers.</p>
                </div>
                <div class="sheet-actions" style="flex-wrap:wrap">
                  <button type="button" class="btn-outline" id="bentoAwaitCopyWa" disabled>Copy WhatsApp links</button>
                  <button type="button" class="btn-outline" id="bentoAwaitCopyPhones" disabled>Copy phone numbers</button>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th style="width:34px"><input type="checkbox" id="bentoAwaitSelectAll" aria-label="Select all awaiting members" /></th>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Pickup ID</th>
                      <th>Package</th>
                      <th>Meals</th>
                      <th>Credits</th>
                      <th>Purchased</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="bentoAwaitBody">
                    <tr><td colspan="9" class="muted-hint">Click Load orders to see who's awaiting scheduling.</td></tr>
                  </tbody>
                </table>
              </div>
              <p class="field-hint" id="bentoAwaitCopyResult"></p>
            </div>
          </div>
        </section>

        <section id="settings-shop-layout" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Shop layout (moja-sites)</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshShopLayoutBtn">Refresh</button>
                <button type="button" class="btn-primary" id="saveShopLayoutBtn">Save layout</button>
              </div>
            </div>
            <div style="padding:12px 20px 4px 20px;color:#64748b;font-size:13px">
              Controls the public shop site home featured products and <code>/shop</code> section groupings. Product data comes from Shopping catalog.
            </div>
            <p class="field-hint" id="shopLayoutSaveResult" style="padding:0 20px"></p>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Home featured products</h2></div>
            <div style="padding:12px 20px 4px 20px;color:#64748b;font-size:13px">
              Shown on the moja-sites home page “Best sellers” grid. Drag order with arrows.
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:72px">Order</th><th style="width:64px">Image</th><th>Name</th><th>Category</th><th style="width:140px">Move</th><th style="width:90px">Remove</th></tr></thead>
                <tbody id="slFeaturedSelectedBody"></tbody>
              </table>
            </div>
            <div style="padding:10px 20px">
              <input type="text" id="slFeaturedFilter" placeholder="Search catalog to add…" style="width:100%" />
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:64px">Image</th><th>Name</th><th>Category</th><th style="width:110px">Add</th></tr></thead>
                <tbody id="slFeaturedAvailableBody"></tbody>
              </table>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head">
              <h2>Shop page sections</h2>
              <div class="sheet-actions"><button type="button" class="btn-outline" id="slAddSectionBtn">Add section</button></div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Section ID</th><th>Title</th><th>Products</th><th style="width:160px">Actions</th></tr></thead>
                <tbody id="slSectionsBody"></tbody>
              </table>
            </div>
          </div>

          <div id="slSectionPanel" class="sheet hidden" style="margin-top:16px">
            <div class="sheet-head"><h2>Edit section</h2></div>
            <div style="padding:16px 20px;max-width:720px">
              <div class="form-row-2">
                <div class="form-section"><label for="slSectionId">Section ID (URL anchor)</label><input type="text" id="slSectionId" placeholder="premium-cake" /></div>
                <div class="form-section"><label for="slSectionTitle">Title</label><input type="text" id="slSectionTitle" /></div>
              </div>
              <div class="form-section"><label for="slSectionDesc">Description</label><textarea id="slSectionDesc"></textarea></div>
              <p class="field-hint">Changes apply when you click <strong>Save layout</strong> above.</p>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:72px">Order</th><th style="width:64px">Image</th><th>Name</th><th style="width:140px">Move</th><th style="width:90px">Remove</th></tr></thead>
                <tbody id="slSectionSelectedBody"></tbody>
              </table>
            </div>
            <div style="padding:10px 20px">
              <input type="text" id="slSectionFilter" placeholder="Search catalog to add to this section…" style="width:100%" />
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:64px">Image</th><th>Name</th><th style="width:110px">Add</th></tr></thead>
                <tbody id="slSectionAvailableBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="settings-popular-items" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Popular items</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshPopularBtn">Refresh</button>
                <button type="button" class="btn-primary" id="savePopularBtn">Save</button>
              </div>
            </div>
            <div style="padding:12px 20px 4px 20px;color:#64748b;font-size:13px">
              Pick up to <strong id="popularMaxHint">5</strong> shop catalog items to feature on the member home screen. Drag the numbered order or use the arrows to reorder.
            </div>
            <div style="padding:12px 20px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">
              <div class="form-section" style="margin:0">
                <label for="popularMax">Maximum items shown</label>
                <input type="number" id="popularMax" min="1" max="5" step="1" value="5" style="width:120px" />
              </div>
              <p class="field-hint" id="popularSaveResult" style="margin:0"></p>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Selected items</h2></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:72px">Order</th><th style="width:64px">Image</th><th>Name</th><th>Category</th><th>Price</th><th style="width:140px">Move</th><th style="width:90px">Remove</th></tr></thead>
                <tbody id="popularSelectedBody"></tbody>
              </table>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Available catalog items</h2></div>
            <div style="padding:10px 20px">
              <input type="text" id="popularFilter" placeholder="Search by name or category…" style="width:100%" />
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:64px">Image</th><th>Name</th><th>Category</th><th>Price</th><th style="width:110px">Add</th></tr></thead>
                <tbody id="popularAvailableBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="settings-home-ads" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Home ad carousel</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshHomeAdsBtn">Refresh</button></div></div>
            <div style="padding:12px 20px 4px 20px;color:#64748b;font-size:13px">
              Slides shown on the client home screen between the points card and the rewards tiles. Active slides are rotated automatically.
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Preview</th><th>Image</th><th>Title</th><th>Body</th><th>Sort</th><th>Visible</th><th>Edit</th><th>Delete</th></tr></thead>
                <tbody id="homeAdsBody"></tbody>
              </table>
            </div>
          </div>
          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Edit slide</h2></div>
            <div style="padding:16px 20px;max-width:720px">
              <input type="hidden" id="haId" />
              <div class="form-section"><label for="haTitle">Title</label><input type="text" id="haTitle" maxlength="120" placeholder="e.g. Double Points" /></div>
              <div class="form-section"><label for="haBody">Body</label><input type="text" id="haBody" maxlength="500" placeholder="e.g. Coffee + Pastry before 11 AM" /></div>
              <div class="form-section">
                <label for="haImageFile">Image (optional)</label>
                <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
                  <div id="haImageThumb" style="width:160px;height:96px;border-radius:12px;border:1px dashed #cbd5e1;background:#f8fafc center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px">No image</div>
                  <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px">
                    <input type="file" id="haImageFile" accept="image/png,image/jpeg,image/webp,image/gif" />
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                      <button type="button" class="btn-outline" id="haImageUploadBtn">Upload image</button>
                      <button type="button" class="btn-outline" id="haImageClearBtn">Remove image</button>
                    </div>
                    <p class="field-hint">PNG / JPEG / WEBP / GIF, max 3 MB. Save the slide first, then upload.</p>
                    <p class="field-hint" id="haImageResult"></p>
                  </div>
                </div>
              </div>
              <div class="form-section">
                <label for="haBg">Fallback background (used when no image is set)</label>
                <input type="text" id="haBg" maxlength="300" placeholder="linear-gradient(135deg, #fef3c7, #fde68a)" />
                <p class="field-hint">Any valid CSS <code>background</code> value. Examples: <code>#fde68a</code>, <code>linear-gradient(135deg,#fef3c7,#fde68a)</code>.</p>
                <div id="haPreview" style="margin-top:10px;height:96px;border-radius:12px;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;color:#334155;font-weight:600;background-size:cover;background-position:center"></div>
              </div>
              <div class="form-row-2">
                <div class="form-section"><label for="haSort">Sort order</label><input type="number" id="haSort" step="1" value="0" /></div>
                <div class="form-section"><label><input type="checkbox" id="haActive" style="width:auto;margin-right:8px" /> Show in client app</label></div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn-primary" id="haSaveBtn">Save slide</button>
                <button type="button" class="btn-outline" id="haNewBtn">New slide</button>
              </div>
              <p class="field-hint" id="haSaveResult"></p>
            </div>
          </div>
        </section>

        <section id="audit" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Audit activity</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshAuditBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
                <tbody id="auditBody"></tbody>
              </table>
            </div>
          </div>
        </section>
        <section id="audit-logins" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Admin login logs</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshLoginAuditBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Entity</th></tr></thead>
                <tbody id="loginAuditBody"></tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
  </div>

  <div id="editMemberBackdrop" class="modal-backdrop hidden" aria-hidden="true"></div>
  <div id="editMemberModal" class="modal-panel hidden" role="dialog" aria-modal="true" aria-labelledby="editMemberTitle">
    <div class="modal-head">
      <h2 id="editMemberTitle">Edit member</h2>
      <button type="button" class="icon-btn" id="editMemberClose" aria-label="Close" style="margin:0">&times;</button>
    </div>
    <div class="modal-body">
      <form id="editMemberForm">
        <div class="form-row-2">
          <div class="form-section">
            <label for="emId">Member ID</label>
            <input type="text" id="emId" readonly />
            <p class="field-hint">Read-only. You can copy this value.</p>
          </div>
          <div class="form-section">
            <label for="emUpdatedAt">Record updated</label>
            <input type="text" id="emUpdatedAt" readonly />
            <p class="field-hint">Server <code>updatedAt</code> (profile edits). Use <strong>Last visit</strong> for engagement.</p>
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-section">
            <label for="emLastVisit">Last visit</label>
            <input type="text" id="emLastVisit" readonly />
            <p class="field-hint">Last successful member login.</p>
          </div>
          <div class="form-section">
            <label for="emReferralCode">Referral code</label>
            <input type="text" id="emReferralCode" readonly />
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-section">
            <label for="emReferralsMade">Referrals (signed up)</label>
            <input type="text" id="emReferralsMade" readonly />
          </div>
          <div class="form-section">
            <label for="emLifetimeSpent">Lifetime spent (cents)</label>
            <input type="text" id="emLifetimeSpent" readonly />
          </div>
        </div>
        <div class="form-section" style="margin-top:8px">
          <label>Recent orders (stored)</label>
          <div id="emOrdersWrap" class="muted-box" style="max-height:200px;overflow:auto;margin-top:6px">—</div>
        </div>
        <div class="form-section">
          <label for="emPhone">Phone (E.164)</label>
          <input type="text" id="emPhone" autocomplete="off" placeholder="+6591234567" />
          <p class="field-hint">Changing phone requires <code>ADMIN_ALLOW_PHONE_CHANGE=true</code> on the server and the <code>customer:phone_change</code> permission.</p>
        </div>
        <div class="form-row-2">
          <div class="form-section">
            <label for="emDisplayName">Display name</label>
            <input type="text" id="emDisplayName" maxlength="120" />
          </div>
          <div class="form-section">
            <label for="emEmail">Email</label>
            <input type="email" id="emEmail" maxlength="254" />
            <p class="field-hint" id="emEmailVerified">—</p>
          </div>
        </div>

        <div class="form-section" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:14px">
          <label style="display:block;margin-bottom:6px"><strong>Account login help</strong></label>
          <p class="field-hint" style="margin-top:0">
            If a member can't receive their OTP, set a login PIN here. They sign in by entering their phone number, then this PIN — no OTP needed.
          </p>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px">
            <span class="field-hint" id="emPinStatus" style="margin:0">—</span>
            <button type="button" class="btn-outline" id="emSetPinBtn">Set login PIN</button>
          </div>
          <p class="field-hint" id="emSetPinResult" style="margin-top:8px;display:none"></p>
        </div>
        <div class="form-row-2">
          <div class="form-section">
            <label for="emStatus">Account status</label>
            <select id="emStatus">
              <option value="DRAFT">DRAFT</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>
          <div class="form-section">
            <label for="emBirthday">Birthday</label>
            <input type="date" id="emBirthday" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-section">
            <label for="emMemberTier">Member tier</label>
            <input type="text" id="emMemberTier" maxlength="64" />
          </div>
          <div class="form-section">
            <label for="emSignupSource">Signup source</label>
            <input type="text" id="emSignupSource" maxlength="64" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-section">
            <label for="emGender">Gender</label>
            <input type="text" id="emGender" maxlength="32" />
          </div>
          <div class="form-section">
            <label for="emPreferredStore">Preferred store</label>
            <input type="text" id="emPreferredStore" maxlength="120" />
          </div>
        </div>
        <div class="form-section">
          <label><input type="checkbox" id="emMarketingConsent" style="width:auto;margin-right:8px" /> Marketing consent</label>
        </div>
        <div class="form-section">
          <label for="emTags">Tags</label>
          <input type="text" id="emTags" placeholder="vip, returning (comma-separated)" />
        </div>
        <div class="form-section">
          <label for="emNotes">Notes</label>
          <textarea id="emNotes" maxlength="8000"></textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn-outline" id="editMemberCancel">Cancel</button>
      <button type="button" class="btn-primary" id="editMemberSave">Save changes</button>
    </div>
  </div>

  <div id="bentoSchedBackdrop" class="modal-backdrop hidden" aria-hidden="true"></div>
  <div id="bentoSchedModal" class="modal-panel hidden" role="dialog" aria-modal="true" aria-labelledby="bentoSchedTitle" style="width:min(620px, calc(100vw - 24px))">
    <div class="modal-head">
      <h2 id="bentoSchedTitle">Schedule pickup</h2>
      <button type="button" class="icon-btn" id="bentoSchedClose" aria-label="Close" style="margin:0">&times;</button>
    </div>
    <div class="modal-body">
      <p class="field-hint" style="margin-top:0" id="bentoSchedSubInfo">—</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:13px">
        <strong>Admin override.</strong> Booking here ignores the daily cutoff, lead time, closed days and the daily capacity cap — use it to fix missed-cutoff complaints, but make sure the kitchen can handle these days.
      </div>
      <label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:14px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="bentoSchedOverrideLock" style="margin-top:2px" />
        <span><strong>Also edit locked days 🔒.</strong> Days lock at 5:00 PM the evening before pickup. Tick this to change or remove a locked day — e.g. switch tomorrow from lunch + dinner to dinner only. Check with the kitchen first; delivered days can never be changed.</span>
      </label>
      <div id="bentoSchedRows"></div>
      <button type="button" class="btn-outline" id="bentoSchedAddDay" style="margin-top:4px">+ Add pickup day</button>
      <p class="field-hint" id="bentoSchedTotals" style="margin-top:12px;font-weight:600">—</p>
      <p class="field-hint" id="bentoSchedResult" style="margin-top:6px"></p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn-outline" id="bentoSchedCancel">Cancel</button>
      <button type="button" class="btn-primary" id="bentoSchedSave">Save schedule</button>
    </div>
  </div>

  <script>
    const SHOP_WEB_ORIGIN = '${shopWebOrigin}';
    const navButtons = () => document.querySelectorAll('.nav-btn');
    const views = [
      'dashboard-overview', 'dashboard-activity', 'dashboard-employees',
      'customers-list', 'customer-orders', 'customers-segments', 'customers-merge',
      'bento-overview', 'bento-sales', 'bento-menu', 'bento-pricing', 'bento-operations', 'bento-orders', 'bento-vouchers',
      'wallet-balances', 'wallet-transactions', 'wallet-adjustment', 'wallet-rules',
      'loyalty-balances', 'loyalty-transactions', 'loyalty-rules', 'loyalty-campaigns',
      'voucher-campaigns', 'voucher-redeem', 'gift-rewards',
      'campaigns-segments', 'campaigns-push-voucher', 'campaigns-push-points', 'campaigns-push-wallet', 'campaigns-history',
      'mailer-campaigns',
      'data-import', 'data-export', 'data-templates', 'data-import-history',
      'reports-customers', 'reports-sales',
      'finance-overview', 'finance-transactions', 'finance-daily', 'finance-sync',
      'settings-system', 'settings-shopping-catalog', 'settings-shop-layout', 'settings-popular-items', 'settings-home-ads',
      'audit', 'audit-logins',
    ];
    let hiddenViews = new Set();
    const title = document.getElementById('title');
    const titleIcon = document.getElementById('titleIcon');
    const statusPanel = document.getElementById('statusPanel');
    const apiKeyInput = document.getElementById('apiKey');
    const refreshDataBtn = document.getElementById('refreshDataBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const connectionDot = document.getElementById('connectionDot');
    const connectionStateText = document.getElementById('connectionStateText');
    const connectionMeta = document.getElementById('connectionMeta');
    const loginScreen = document.getElementById('loginScreen');
    const dashboardApp = document.getElementById('dashboardApp');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const loginStatus = document.getElementById('loginStatus');
    const authTabKey = document.getElementById('authTabKey');
    const authTabJwt = document.getElementById('authTabJwt');
    const authKeyPanel = document.getElementById('authKeyPanel');
    const authJwtPanel = document.getElementById('authJwtPanel');
    const authHelpText = document.getElementById('authHelpText');
    const adminEmail = document.getElementById('adminEmail');
    const adminPassword = document.getElementById('adminPassword');

    const iconHome = '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>';
    const iconUsers = '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>';
    const iconWallet = '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>';
    const iconLoyalty = '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>';
    const iconVoucher = '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V21"/><path d="M7 12h.01M17 12h.01M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/>';
    const iconAudit = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';
    const icons = {
      'dashboard-overview': iconHome,
      'dashboard-activity': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
      'dashboard-employees': iconUsers,
      'customers-list': iconUsers,
      'customer-orders':
        '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
      'customers-segments': iconUsers,
      'customers-merge': iconUsers,
      'wallet-balances': iconWallet,
      'wallet-transactions': iconWallet,
      'wallet-adjustment': iconWallet,
      'wallet-rules': iconWallet,
      'loyalty-balances': iconLoyalty,
      'loyalty-transactions': iconLoyalty,
      'loyalty-rules': iconLoyalty,
      'loyalty-campaigns': iconLoyalty,
      'voucher-campaigns': iconVoucher,
      'voucher-redeem': iconVoucher,
      'gift-rewards': iconLoyalty,
      'campaigns-segments': iconUsers,
      'campaigns-push-voucher': iconVoucher,
      'campaigns-push-points': iconLoyalty,
      'campaigns-push-wallet': iconWallet,
      'campaigns-history': '<path d="M3 3v5h5"/><path d="M3.05 13a9 9 0 1 0 .5-4"/><polyline points="12 7 12 12 15 15"/>',
      'mailer-campaigns': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
      'data-import': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
      'data-export': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
      'data-templates': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><line x1="7" y1="10" x2="17" y2="10"/>',
      'data-import-history': iconAudit,
      'reports-customers': iconUsers,
      'reports-sales': '<path d="M3 3v18h18"/><path d="M7 16l4-6 3 4 5-8"/>',
      'finance-overview': iconLoyalty,
      'finance-transactions': '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
      'finance-daily': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
      'finance-sync': '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/>',
      'settings-system': iconAudit,
      'settings-shopping-catalog': iconVoucher,
      'bento-overview': '<path d="M3 3v18h18"/><path d="M18.7 8a6 6 0 0 1-6 6H3"/><circle cx="7" cy="17" r="1"/>',
      'bento-sales': '<path d="M3 3v18h18"/><path d="M7 16l4-6 3 4 5-8"/>',
      'bento-menu': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 4v6"/>',
      'bento-pricing': iconLoyalty,
      'bento-operations': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      'bento-orders': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
      'bento-vouchers': iconVoucher,
      'settings-shop-layout': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
      'settings-popular-items': '<polygon points="12 2 15 9 22 9.3 17 14 19 21 12 17 5 21 7 14 2 9.3 9 9 12 2"/>',
      'settings-home-ads': '<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>',
      audit: iconAudit,
      'audit-logins': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
    };
    const viewTitles = {
      'dashboard-overview': 'Dashboard · Overview',
      'dashboard-activity': 'Dashboard · Activity feed',
      'dashboard-employees': 'Settings · Employees & payroll',
      'customers-list': 'Customers · List',
      'customer-orders': 'Customers · Customer orders',
      'customers-segments': 'Customers · Tags / segments',
      'customers-merge': 'Customers · Merge duplicates',
      'wallet-balances': 'Wallet · Balances',
      'wallet-transactions': 'Wallet · Transactions',
      'wallet-adjustment': 'Wallet · Manual adjustment',
      'wallet-rules': 'Wallet · Top-up bonus rules',
      'loyalty-balances': 'Loyalty · Points balances',
      'loyalty-transactions': 'Loyalty · Transactions',
      'loyalty-rules': 'Loyalty · Points rules',
      'loyalty-campaigns': 'Loyalty · Bonus campaigns',
      'voucher-campaigns': 'Loyalty · Vouchers',
      'voucher-redeem': 'Loyalty · Redeem voucher (in-store)',
      'gift-rewards': 'Loyalty · Gift rewards',
      'campaigns-segments': 'Campaigns · Customer segments',
      'campaigns-push-voucher': 'Campaigns · Push voucher',
      'campaigns-push-points': 'Campaigns · Push points',
      'campaigns-push-wallet': 'Campaigns · Push wallet bonus',
      'campaigns-history': 'Campaigns · History',
      'mailer-campaigns': 'Email marketing · Campaigns',
      'data-import': 'Data Tools · Import data',
      'data-export': 'Data Tools · Export data',
      'data-templates': 'Data Tools · Template downloads',
      'data-import-history': 'Data Tools · Import history',
      'reports-customers': 'Sales & reports · Customer reports',
      'reports-sales': 'Sales & reports · Sales & transactions',
      'finance-overview': 'Finance · Revenue overview',
      'finance-transactions': 'Finance · All transactions',
      'finance-daily': 'Finance · Daily close',
      'finance-sync': 'Finance · POS sync health',
      'settings-system': 'Settings · System config',
      'settings-shopping-catalog': 'Settings · Shopping catalog',
      'bento-overview': 'Bento · Overview & members',
      'bento-sales': 'Bento · Sales & transactions',
      'bento-menu': 'Bento · Weekly menu',
      'bento-pricing': 'Bento · Packages & pricing',
      'bento-operations': 'Bento · Capacity & schedule',
      'bento-orders': 'Bento · Kitchen orders export',
      'bento-vouchers': 'Bento · Discount vouchers',
      'settings-shop-layout': 'Settings · Shop layout',
      'settings-popular-items': 'Settings · Popular items',
      'settings-home-ads': 'Settings · Home ad carousel',
      audit: 'Audit · Audit logs',
      'audit-logins': 'Audit · Admin login logs',
    };

    let lastVoucherDefinitions = [];
    let lastPerksCampaignRules = [];
    let lastShopCatalogProducts = [];
    let lastHomeAdSlides = [];
    let popularSelectedIds = [];
    let popularMaxLimit = 5;
    let shopLayoutFeaturedIds = [];
    let shopLayoutSections = [];
    let shopLayoutEditingSectionIdx = -1;
    let lastSalesAnalytics = null;
    let saChartMetric = 'gmv';

    const fmt = (value) => value === null || value === undefined || value === '' ? '-' : value;
    const moneyFromCents = (cents) => {
      const n = Number(cents);
      if (!Number.isFinite(n)) return '-';
      return (n / 100).toFixed(2);
    };
    const birthdayCountLabel = (d) => {
      if (d === null || d === undefined) return '-';
      if (d === 0) return 'Today';
      if (d === 1) return '1d';
      return String(d) + 'd';
    };
    let lastDashMarketing = null;
    let lastRpMarketing = null;

    function saIsoDateUtc(d) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const da = String(d.getUTCDate()).padStart(2, '0');
      return y + '-' + m + '-' + da;
    }

    function saInitDefaultDates() {
      const fromEl = document.getElementById('saFrom');
      const toEl = document.getElementById('saTo');
      if (!fromEl || !toEl) return;
      const t = new Date();
      const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 29);
      fromEl.value = saIsoDateUtc(start);
      toEl.value = saIsoDateUtc(end);
    }

    function buildSalesAnalyticsQuery() {
      const fromStr = document.getElementById('saFrom').value;
      const toStr = document.getElementById('saTo').value;
      if (!fromStr || !toStr) return null;
      const fromIso = fromStr + 'T00:00:00.000Z';
      const toEnd = new Date(toStr + 'T00:00:00.000Z');
      toEnd.setUTCDate(toEnd.getUTCDate() + 1);
      const toIso = toEnd.toISOString();
      const bucket = document.getElementById('saBucket').value;
      const category = document.getElementById('saCategory').value || 'cake';
      return (
        'from=' +
        encodeURIComponent(fromIso) +
        '&to=' +
        encodeURIComponent(toIso) +
        '&bucket=' +
        encodeURIComponent(bucket) +
        '&category=' +
        encodeURIComponent(category)
      );
    }

    function saCategoryLabel(cat) {
      return cat === 'bento' ? 'Bento (meal plans)' : 'Cake (shop)';
    }

    function applySalesCategoryUi(category) {
      const isCake = category !== 'bento';
      document.querySelectorAll('.sa-kpi-cake-only').forEach(function (el) {
        el.style.display = isCake ? '' : 'none';
      });
      const cakeSub = document.getElementById('saSubstatsCake');
      if (cakeSub) cakeSub.style.display = isCake ? '' : 'none';
      const scope = document.getElementById('saScopeText');
      if (scope) {
        scope.textContent = isCake
          ? 'Cake — paid shop orders by placed_at (UTC). Includes placed and completed; excludes unpaid/cancelled.'
          : 'Bento — successful subscription payments by payment_intents.updated_at (UTC). Counts paid plans regardless of meals scheduled or consumed.';
      }
      const daily = document.getElementById('saDailySalesPanel');
      if (daily) daily.style.display = isCake ? '' : 'none';
      const topHead = document.getElementById('saTopHead');
      if (topHead) {
        topHead.innerHTML = isCake
          ? '<tr><th>Product</th><th>SKU</th><th>Qty</th><th>Revenue</th><th>Orders</th></tr>'
          : '<tr><th>Package</th><th>Code</th><th>Sales</th><th>Revenue</th><th>Payments</th></tr>';
      }
      const topPanel = document.getElementById('saTopPanelHead');
      if (topPanel) {
        topPanel.textContent = isCake ? 'Top products (quantity)' : 'Top packages (sales)';
      }
      const bestHead = document.querySelector('#reports-sales .sa-split .sa-panel:first-child .sa-panel-head');
      if (bestHead) bestHead.textContent = isCake ? 'Best seller' : 'Best-selling package';
      if (!isCake && (saChartMetric === 'wallet' || saChartMetric === 'points')) {
        saChartMetric = 'gmv';
      }
    }

    function saSetKpiActive(metric) {
      document.querySelectorAll('#saKpiStrip .sa-kpi-card').forEach(function (el) {
        el.classList.toggle('is-active', el.getAttribute('data-sa-metric') === metric);
      });
    }

    function saChartMetricLabel(metric) {
      const map = {
        gmv: 'Gross merchandise value',
        orders: 'Completed orders by period',
        aov: 'Average basket by period',
        wallet: 'Stored wallet spend (range total)',
        points: 'Loyalty points redeemed (range total)',
      };
      return map[metric] || map.gmv;
    }

    function paintSalesSeriesTable(series) {
      const tb = document.getElementById('saSeriesBody');
      if (!tb) return;
      const arr = series || [];
      tb.innerHTML = arr.length
        ? arr
            .map(function (s) {
              const g = Number(s.gmvCents) || 0;
              const n = Number(s.orderCount) || 0;
              const aov = n ? Math.round(g / n) : 0;
              const d = String(s.periodStart || '').slice(0, 10);
              return (
                '<tr><td>' +
                fmt(d) +
                '</td><td>' +
                moneyFromCents(g) +
                '</td><td>' +
                fmt(n) +
                '</td><td>' +
                moneyFromCents(aov) +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="4">No rows in this range.</td></tr>';
    }

    function paintSalesChart() {
      const wrap = document.getElementById('saLineChart');
      const titleEl = document.getElementById('saChartTitleLabel');
      if (!wrap) return;
      const styleEl = document.getElementById('saChartStyle');
      const chartStyle = styleEl && styleEl.value === 'line' ? 'line' : 'area';
      const arr = (lastSalesAnalytics && lastSalesAnalytics.series) || [];
      if (titleEl) titleEl.textContent = saChartMetricLabel(saChartMetric);

      if (saChartMetric === 'wallet' || saChartMetric === 'points') {
        wrap.innerHTML =
          '<div class="muted-hint" style="margin:0;padding:72px 20px;text-align:center;line-height:1.55;max-width:420px;margin-left:auto;margin-right:auto">' +
          'This metric is only available as a <strong>range total</strong> on the card above. The chart shows order trends; pick <strong>GMV</strong>, <strong>Orders</strong>, or <strong>Avg order value</strong> to plot by period.</div>';
        return;
      }

      const valueAt = function (s) {
        const g = Number(s.gmvCents) || 0;
        const n = Number(s.orderCount) || 0;
        if (saChartMetric === 'orders') return n;
        if (saChartMetric === 'aov') return n ? g / n : 0;
        return g;
      };
      const fmtY = function (v) {
        if (saChartMetric === 'orders') return String(Math.round(v));
        return moneyFromCents(Math.round(v));
      };

      if (!arr.length) {
        wrap.innerHTML =
          '<p class="muted-hint" style="margin:0;padding:48px 16px;text-align:center">No paid transactions in this range.</p>';
        return;
      }

      const W = 880;
      const H = 260;
      const padL = 58;
      const padR = 20;
      const padT = 16;
      const padB = 44;
      const iw = W - padL - padR;
      const ih = H - padT - padB;
      const vals = arr.map(valueAt);
      const maxV = Math.max(1, ...vals) * 1.06;
      const n = arr.length;
      const xAt = function (i) {
        return padL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
      };
      const yAt = function (v) {
        return padT + ih * (1 - v / maxV);
      };

      let pathD = '';
      arr.forEach(function (s, i) {
        const vx = valueAt(s);
        const x = xAt(i);
        const y = yAt(vx);
        pathD += (i === 0 ? 'M ' : ' L ') + x.toFixed(1) + ' ' + y.toFixed(1);
      });

      let areaD = '';
      if (chartStyle === 'area' && n > 0) {
        const yb = padT + ih;
        areaD = 'M ' + xAt(0).toFixed(1) + ' ' + yb.toFixed(1);
        arr.forEach(function (s, i) {
          areaD += ' L ' + xAt(i).toFixed(1) + ' ' + yAt(valueAt(s)).toFixed(1);
        });
        areaD += ' L ' + xAt(n - 1).toFixed(1) + ' ' + yb.toFixed(1) + ' Z';
      }

      const yTicks = 5;
      let gridAndLabels = '';
      for (let t = 0; t <= yTicks; t += 1) {
        const frac = t / yTicks;
        const val = maxV * (1 - frac);
        const y = padT + ih * frac;
        gridAndLabels +=
          '<line class="sa-chart-grid" x1="' +
          padL +
          '" y1="' +
          y.toFixed(1) +
          '" x2="' +
          (W - padR) +
          '" y2="' +
          y.toFixed(1) +
          '" />';
        gridAndLabels +=
          '<text class="sa-chart-axis" x="' +
          (padL - 8) +
          '" y="' +
          (y + 4).toFixed(1) +
          '" text-anchor="end">' +
          fmtY(val) +
          '</text>';
      }

      let xLabels = '';
      const step = n <= 8 ? 1 : Math.ceil(n / 8);
      arr.forEach(function (s, i) {
        if (i % step !== 0 && i !== n - 1) return;
        const x = xAt(i);
        const lab = String(s.periodStart || '').slice(5, 10);
        xLabels +=
          '<text class="sa-chart-axis" x="' +
          x.toFixed(1) +
          '" y="' +
          (H - 12) +
          '" text-anchor="middle">' +
          lab +
          '</text>';
      });

      let dots = '';
      arr.forEach(function (s, i) {
        const x = xAt(i);
        const y = yAt(valueAt(s));
        const tip =
          (String(s.periodStart || '').slice(0, 10) +
            ': ' +
            (saChartMetric === 'orders'
              ? fmt(valueAt(s)) + ' orders'
              : saChartMetric === 'aov'
                ? 'Avg ' + moneyFromCents(Math.round(valueAt(s)))
                : moneyFromCents(Math.round(valueAt(s))) + ' GMV')) +
          ' · ' +
          fmt(s.orderCount) +
          ' orders';
        dots +=
          '<circle class="sa-chart-dot" cx="' +
          x.toFixed(1) +
          '" cy="' +
          y.toFixed(1) +
          '" r="4"><title>' +
          tip.replace(/</g, '&lt;') +
          '</title></circle>';
      });

      const pathEsc = pathD.replace(/"/g, '&quot;');
      const areaEsc = areaD.replace(/"/g, '&quot;');

      wrap.innerHTML =
        '<svg viewBox="0 0 ' +
        W +
        ' ' +
        H +
        '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Trend chart">' +
        gridAndLabels +
        (chartStyle === 'area' && areaD ? '<path class="sa-chart-area" d="' + areaEsc + '" />' : '') +
        '<path class="sa-chart-line" d="' +
        pathEsc +
        '" />' +
        dots +
        xLabels +
        '</svg>';
    }

    function refreshSalesViz() {
      saSetKpiActive(saChartMetric);
      paintSalesChart();
    }

    async function loadSalesAnalytics() {
      const q = buildSalesAnalyticsQuery();
      const hint = document.getElementById('saLoadHint');
      if (!q) {
        if (hint) hint.textContent = 'Set from and to dates, then Apply.';
        statusPanel.textContent = 'Set from and to dates for sales analytics.';
        return;
      }
      if (hint) hint.textContent = 'Loading…';
      try {
        const data = await api('/admin/reports/sales-analytics?' + q);
        lastSalesAnalytics = data;
        const cat = (data.meta && data.meta.category) || 'cake';
        applySalesCategoryUi(cat);
        const sum = data.summary || {};
        const noCmp = '—';
        document.getElementById('saValGmv').textContent = moneyFromCents(sum.totalGmvCents);
        document.getElementById('saValOrders').textContent = fmt(sum.completedOrders);
        document.getElementById('saValAov').textContent = moneyFromCents(sum.averageOrderValueCents);
        document.getElementById('saValWallet').textContent = moneyFromCents(sum.storedWalletSpendCentsInRange);
        document.getElementById('saValPts').textContent = fmt(sum.loyaltyPointsRedeemedInRange);
        document.getElementById('saDeltaGmv').textContent = noCmp;
        document.getElementById('saDeltaOrders').textContent = noCmp;
        document.getElementById('saDeltaAov').textContent = noCmp;
        document.getElementById('saDeltaWallet').textContent = noCmp;
        document.getElementById('saDeltaPts').textContent = noCmp;
        document.getElementById('saOpen').textContent = fmt(sum.openOrdersPlacedInRange);
        document.getElementById('saPtsIn').textContent = fmt(sum.loyaltyPointsIssuedInRange);
        document.getElementById('saWalTop').textContent = moneyFromCents(sum.storedWalletTopUpCentsInRange);
        document.getElementById('saVIss').textContent = fmt(sum.vouchersIssuedInRange);
        document.getElementById('saVRed').textContent = fmt(sum.vouchersRedeemedInRange);
        paintSalesSeriesTable(data.series);
        refreshSalesViz();
        const tb = document.getElementById('saTopBody');
        const rows = (data.topProducts || []).map(function (p) {
          return (
            '<tr><td>' +
            fmt(p.name) +
            '</td><td><code style="font-size:11px">' +
            fmt(p.productId) +
            '</code></td><td>' +
            fmt(p.qtySold) +
            '</td><td>' +
            moneyFromCents(p.revenueCents) +
            '</td><td>' +
            fmt(p.orders) +
            '</td></tr>'
          );
        });
        tb.innerHTML =
          rows.join('') ||
          '<tr><td colspan="5">' +
            (cat === 'bento' ? 'No package sales' : 'No products') +
            '</td></tr>';
        const best = document.getElementById('saBestSeller');
        if (data.bestSeller) {
          const b = data.bestSeller;
          const qtyLabel = cat === 'bento' ? 'Sales' : 'Qty sold';
          const ordLabel = cat === 'bento' ? 'Payments' : 'Orders';
          best.innerHTML =
            '<strong>' +
            fmt(b.name) +
            '</strong> <span class="muted-hint">(' +
            fmt(b.productId) +
            ')</span><br/>' +
            qtyLabel +
            ': ' +
            fmt(b.qtySold) +
            ' · Revenue: ' +
            moneyFromCents(b.revenueCents) +
            ' · ' +
            ordLabel +
            ': ' +
            fmt(b.orders);
        } else {
          best.innerHTML =
            '<span class="muted-hint">' +
            (cat === 'bento'
              ? 'No successful bento payments in this range.'
              : 'No paid order lines in this range.') +
            '</span>';
        }
        if (hint) {
          hint.textContent =
            'Loaded · ' +
            saCategoryLabel(cat) +
            ' · ' +
            fmt(data.meta?.bucket) +
            ' bucket · window ' +
            fmt(data.meta?.from) +
            ' → ' +
            fmt(data.meta?.to);
        }
        statusPanel.textContent = 'Sales analytics updated.';
      } catch (e) {
        if (hint) hint.textContent = e.message || String(e);
        statusPanel.textContent = e.message || String(e);
      }
    }

    function paintSpenderPeriod(scope, m, period) {
      const map = {
        all: 'topSpenders',
        day: 'topSpendersToday',
        month: 'topSpendersThisMonth',
        year: 'topSpendersThisYear',
      };
      const key = map[period] || 'topSpenders';
      const list = (m && m[key]) || [];
      const wrap = document.getElementById(scope + 'SpenderBars');
      const tb = document.getElementById(scope + 'SpenderPeriodBody');
      if (!wrap || !tb) return;
      const max = Math.max(1, ...list.map((x) => Number(x.lifetimeSpentCents) || 0));
      wrap.innerHTML = list.length
        ? list
            .map((r) => {
              const v = Number(r.lifetimeSpentCents) || 0;
              const w = Math.max(2, Math.round((v / max) * 100));
              return (
                '<div class="mk-hbar-row" title="' +
                moneyFromCents(v) +
                '">' +
                '<span class="mk-hbar-name">' +
                fmt(r.displayName || r.phoneE164) +
                '</span>' +
                '<div class="mk-hbar-track"><div class="mk-hbar-fill" style="width:' +
                w +
                '%"></div></div>' +
                '<span class="mk-hbar-val">' +
                moneyFromCents(v) +
                '</span></div>'
              );
            })
            .join('')
        : '<p class="muted-hint" style="margin:0">No orders in this window.</p>';
      tb.innerHTML = list.length
        ? list
            .map(
              (r) =>
                '<tr><td>' +
                fmt(r.displayName || r.phoneE164) +
                '</td><td>' +
                moneyFromCents(r.lifetimeSpentCents) +
                '</td></tr>',
            )
            .join('')
        : '<tr><td colspan="2">—</td></tr>';
    }

    function paintMarketing(m, scope) {
      const chart = document.getElementById(scope + 'SignupBars');
      const tbR = document.getElementById(scope + 'TopReferrersBody');
      const tbP = document.getElementById(scope + 'TopProductsBody');
      if (!chart || !tbR || !tbP) return;
      const series = (m && m.signupsByDay) || [];
      const max = Math.max(
        1,
        ...series.map((s) => {
          const ref = Number(s.referredSignups) || 0;
          let org = Number(s.organicSignups);
          if (!Number.isFinite(org)) org = Math.max(0, (Number(s.newMembers) || 0) - ref);
          return ref + org || Number(s.newMembers) || 0;
        }),
      );
      chart.innerHTML = series.length
        ? series
            .map((s) => {
              const ref = Number(s.referredSignups) || 0;
              let org = Number(s.organicSignups);
              if (!Number.isFinite(org)) org = Math.max(0, (Number(s.newMembers) || 0) - ref);
              const total = ref + org || Number(s.newMembers) || 0;
              const colH = total ? Math.max(6, Math.round((total / max) * 100)) : 0;
              const oFlex = total ? Math.max(org, 0.0001) : 0.0001;
              const rFlex = total ? Math.max(ref, 0.0001) : 0.0001;
              const lbl = String(s.date || '').slice(5);
              const tip =
                fmt(s.date) +
                ': ' +
                total +
                ' (referral ' +
                ref +
                ', direct ' +
                org +
                ')';
              return (
                '<div class="mk-bar-col" title="' +
                tip +
                '">' +
                '<div class="mk-stack-tower" style="height:' +
                colH +
                '%">' +
                '<div class="mk-stack-seg org" style="flex:' +
                oFlex +
                '"></div>' +
                '<div class="mk-stack-seg ref" style="flex:' +
                rFlex +
                '"></div>' +
                '</div>' +
                '<span class="mk-bar-lbl">' +
                lbl +
                '</span></div>'
              );
            })
            .join('')
        : '<span class="muted-hint">No signups in range</span>';
      const refs = (m && m.topReferrers) || [];
      tbR.innerHTML = refs.length
        ? refs
            .map(
              (r) =>
                '<tr><td>' +
                fmt(r.displayName || r.phoneE164) +
                '<br/><code style="font-size:11px">' +
                fmt(r.referralCode) +
                '</code></td><td>' +
                fmt(r.referralsSignedUp) +
                '</td></tr>',
            )
            .join('')
        : '<tr><td colspan="2">No referrals yet</td></tr>';
      const prods = (m && m.topProducts) || [];
      tbP.innerHTML = prods.length
        ? prods
            .map(
              (p) =>
                '<tr><td>' + fmt(p.name) + '</td><td>' + fmt(p.qtySold) + '</td></tr>',
            )
            .join('')
        : '<tr><td colspan="2">No orders in range</td></tr>';
    }
    const dateFmt = (iso) => {
      if (!iso) return '-';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleString();
    };
    const statusPill = (status) => {
      const s = String(status || '');
      const ok = s === 'ACTIVE' || s === 'ISSUED' || s === 'REDEEMED';
      const cls = ok ? 'ok' : (s === 'INACTIVE' || s === 'VOID' || s === 'EXPIRED' ? 'warn' : 'neutral');
      return '<span class="pill ' + cls + '">' + s + '</span>';
    };

    function normalizeKey(input) {
      const cleaned = String(input || '').trim().replace(/^['"]|['"]$/g, '');
      if (!cleaned) return '';
      if (cleaned.includes(',')) {
        return cleaned.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      }
      return cleaned;
    }

    const savedKey = localStorage.getItem('moja_admin_api_key');
    if (savedKey) apiKeyInput.value = savedKey;
    let currentAuthMode = localStorage.getItem('moja_admin_auth_mode') || (localStorage.getItem('moja_admin_jwt') ? 'jwt' : 'key');
    let isConnected = false;

    function setLoginStatus(message, ok) {
      if (!loginStatus) return;
      loginStatus.textContent = message || '';
      loginStatus.classList.toggle('ok', !!ok);
    }

    function showDashboard(on) {
      loginScreen.classList.toggle('hidden', on);
      dashboardApp.classList.toggle('hidden', !on);
      document.body.classList.toggle('login-locked', !on);
      if (!on) {
        isConnected = false;
        updateConnectionUi();
      }
    }

    function setAuthTab(mode) {
      currentAuthMode = mode === 'jwt' ? 'jwt' : 'key';
      localStorage.setItem('moja_admin_auth_mode', currentAuthMode);
      const jwt = currentAuthMode === 'jwt';
      authKeyPanel.classList.toggle('hidden', jwt);
      authJwtPanel.classList.toggle('hidden', !jwt);
      authTabKey.classList.toggle('active', !jwt);
      authTabJwt.classList.toggle('active', jwt);
      authHelpText.textContent = jwt
        ? 'Sign in with admin credentials to issue a JWT token.'
        : 'Use an API key for service-to-service access.';
      if (loginSubmitBtn) loginSubmitBtn.textContent = jwt ? 'Sign in' : 'Sign in with API key';
    }
    setAuthTab(currentAuthMode);

    function updateConnectionUi() {
      connectionDot.classList.toggle('connected', isConnected);
      if (isConnected) {
        connectionStateText.textContent = 'Connected';
        connectionMeta.textContent = currentAuthMode === 'jwt'
          ? 'Authenticated with email/password (JWT).'
          : 'Authenticated with API key.';
      } else {
        connectionStateText.textContent = 'Not connected';
        connectionMeta.textContent = 'Sign in to load dashboard data.';
      }
    }

    async function submitLogin() {
      setLoginStatus('');
      loginSubmitBtn.disabled = true;
      if (currentAuthMode === 'jwt') {
        const email = adminEmail.value.trim();
        const password = adminPassword.value;
        if (!email || !password) {
          setLoginStatus('Enter email and password.');
          loginSubmitBtn.disabled = false;
          return;
        }
        setLoginStatus('Signing in…', true);
        try {
          const res = await fetch('/admin/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          let data = {};
          try { data = await res.json(); } catch (_) {}
          if (!res.ok) {
            const msg = data.message || data.error || res.statusText;
            throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
          }
          if (!data.accessToken) throw new Error('Login response missing accessToken');
          localStorage.setItem('moja_admin_jwt', data.accessToken);
          adminPassword.value = '';
          await loadAll();
          showDashboard(true);
          setLoginStatus('');
        } catch (err) {
          isConnected = false;
          updateConnectionUi();
          setLoginStatus(err.message || String(err));
        } finally {
          loginSubmitBtn.disabled = false;
        }
        return;
      }
      const key = normalizeKey(apiKeyInput.value);
      if (!key) {
        setLoginStatus('Please enter your admin API key.');
        loginSubmitBtn.disabled = false;
        return;
      }
      apiKeyInput.value = key;
      localStorage.setItem('moja_admin_api_key', key);
      setLoginStatus('Verifying API key…', true);
      try {
        await loadAll();
        showDashboard(true);
        setLoginStatus('');
      } catch (err) {
        isConnected = false;
        updateConnectionUi();
        setLoginStatus(err.message || String(err));
      } finally {
        loginSubmitBtn.disabled = false;
      }
    }

    async function initSession() {
      const hasJwt = !!localStorage.getItem('moja_admin_jwt');
      const hasKey = !!normalizeKey(localStorage.getItem('moja_admin_api_key') || apiKeyInput.value);
      if (!hasJwt && !hasKey) {
        showDashboard(false);
        return;
      }
      setLoginStatus('Verifying saved session…', true);
      loginSubmitBtn.disabled = true;
      try {
        await loadAll();
        showDashboard(true);
        setLoginStatus('');
      } catch (_) {
        showDashboard(false);
        setLoginStatus('Session expired or invalid. Sign in again.');
      } finally {
        loginSubmitBtn.disabled = false;
      }
    }
    updateConnectionUi();

    function getAuthHeaders() {
      if (currentAuthMode === 'jwt') {
        const t = localStorage.getItem('moja_admin_jwt');
        if (!t) throw new Error('No JWT found. Please sign in in the connection window.');
        return { Authorization: 'Bearer ' + t };
      }
      const key = normalizeKey(apiKeyInput.value);
      if (!key) throw new Error('Please enter your admin API key in the connection window.');
      return { 'x-admin-api-key': key };
    }

    async function api(path) {
      const headers = getAuthHeaders();
      if (currentAuthMode === 'key') {
        localStorage.setItem('moja_admin_api_key', normalizeKey(apiKeyInput.value));
      }
      const res = await fetch(path, { headers });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Request failed (' + res.status + '): ' + txt);
      }
      return res.json();
    }

    async function apiPatch(path, body) {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      if (currentAuthMode === 'key') {
        localStorage.setItem('moja_admin_api_key', normalizeKey(apiKeyInput.value));
      }
      const res = await fetch(path, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Request failed (' + res.status + '): ' + txt);
      }
      return res.json();
    }

    async function apiPost(path, body) {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      if (currentAuthMode === 'key') {
        localStorage.setItem('moja_admin_api_key', normalizeKey(apiKeyInput.value));
      }
      const res = await fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Request failed (' + res.status + '): ' + txt);
      }
      return res.json();
    }

    async function apiPut(path, body) {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      if (currentAuthMode === 'key') {
        localStorage.setItem('moja_admin_api_key', normalizeKey(apiKeyInput.value));
      }
      const res = await fetch(path, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Request failed (' + res.status + '): ' + txt);
      }
      return res.json();
    }

    async function apiDelete(path) {
      const headers = { ...getAuthHeaders() };
      if (currentAuthMode === 'key') {
        localStorage.setItem('moja_admin_api_key', normalizeKey(apiKeyInput.value));
      }
      const res = await fetch(path, { method: 'DELETE', headers });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Request failed (' + res.status + '): ' + txt);
      }
      try { return await res.json(); } catch { return {}; }
    }

    async function apiDownload(path, filenameHint) {
      const headers = getAuthHeaders();
      const res = await fetch(path, { headers });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Download failed (' + res.status + '): ' + txt);
      }
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = filenameHint || 'download.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);
    }

    let editMemberInitial = null;

    function closeEditMemberModal() {
      document.getElementById('editMemberBackdrop').classList.add('hidden');
      document.getElementById('editMemberModal').classList.add('hidden');
      editMemberInitial = null;
    }

    function openEditMemberModal(id) {
      if (!id) return;
      document.getElementById('emId').value = id;
      statusPanel.textContent = 'Loading member…';
      Promise.all([
        api('/admin/customers/' + encodeURIComponent(id)),
        api('/admin/customers/' + encodeURIComponent(id) + '/orders').catch(function () {
          return [];
        }),
      ])
        .then(function (pair) {
          const c = pair[0];
          const orders = pair[1];
          editMemberInitial = c;
          document.getElementById('emId').value = c.id || id;
          document.getElementById('emUpdatedAt').value = dateFmt(c.updatedAt);
          document.getElementById('emLastVisit').value = dateFmt(c.lastLoginAt);
          document.getElementById('emReferralCode').value = fmt(c.referralCode);
          document.getElementById('emReferralsMade').value = fmt(
            c._count != null ? c._count.referredMembers : '—',
          );
          document.getElementById('emLifetimeSpent').value = fmt(
            c.storedWallet != null ? c.storedWallet.lifetimeSpentCents : '—',
          );
          document.getElementById('emPhone').value = c.phoneE164 || '';
          document.getElementById('emDisplayName').value = c.displayName || '';
          document.getElementById('emEmail').value = c.email || '';
          document.getElementById('emStatus').value = c.status || 'DRAFT';
          var emVerifiedEl = document.getElementById('emEmailVerified');
          if (emVerifiedEl) {
            if (!c.email) {
              emVerifiedEl.textContent = 'No email on file. Add one above, then Save.';
              emVerifiedEl.style.color = '#b45309';
            } else if (c.emailVerified) {
              emVerifiedEl.textContent = 'Email verified ✓' + (c.emailVerifiedAt ? (' (' + dateFmt(c.emailVerifiedAt) + ')') : '');
              emVerifiedEl.style.color = '#047857';
            } else {
              emVerifiedEl.textContent = 'Email not verified yet (member has not completed an email code for this address).';
              emVerifiedEl.style.color = '#b45309';
            }
          }
          var emPinStatusEl = document.getElementById('emPinStatus');
          if (emPinStatusEl) {
            emPinStatusEl.textContent = c.hasLoginPin ? 'A login PIN is set.' : 'No login PIN set.';
          }
          var emSetPinResultEl = document.getElementById('emSetPinResult');
          if (emSetPinResultEl) { emSetPinResultEl.style.display = 'none'; emSetPinResultEl.textContent = ''; }
          if (c.birthday) {
            const d = new Date(c.birthday);
            document.getElementById('emBirthday').value =
              Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
          } else {
            document.getElementById('emBirthday').value = '';
          }
          document.getElementById('emMemberTier').value = c.memberTier || '';
          document.getElementById('emSignupSource').value = c.signupSource || '';
          document.getElementById('emGender').value = c.gender || '';
          document.getElementById('emPreferredStore').value = c.preferredStore || '';
          document.getElementById('emMarketingConsent').checked = !!c.marketingConsent;
          document.getElementById('emTags').value = Array.isArray(c.tags) ? c.tags.join(', ') : '';
          document.getElementById('emNotes').value = c.notes || '';
          const ow = document.getElementById('emOrdersWrap');
          if (ow) {
            if (!Array.isArray(orders) || !orders.length) {
              ow.textContent = 'No stored orders yet.';
            } else {
              ow.innerHTML =
                '<table class="data mk-mini-table" style="width:100%"><thead><tr><th>Order #</th><th>When</th><th>Status</th><th>Total</th><th>Lines</th></tr></thead><tbody>' +
                orders
                  .map(function (o) {
                    const linePreview = (o.lines || [])
                      .map(function (l) {
                        return l.name + ' ×' + l.qty;
                      })
                      .slice(0, 4)
                      .join(', ');
                    var rawSt = (o.status || '').toString().toLowerCase();
                    var statusLabel =
                      rawSt === 'completed' ? 'Collected' : rawSt === 'placed' ? 'Open' : fmt(o.status);
                    return (
                      '<tr><td>' +
                      fmt(o.orderNumber) +
                      '</td><td>' +
                      dateFmt(o.placedAt) +
                      '</td><td>' +
                      statusLabel +
                      '</td><td>' +
                      moneyFromCents(o.totalCents) +
                      '</td><td>' +
                      fmt(linePreview) +
                      '</td></tr>'
                    );
                  })
                  .join('') +
                '</tbody></table>';
            }
          }
          document.getElementById('editMemberBackdrop').classList.remove('hidden');
          document.getElementById('editMemberModal').classList.remove('hidden');
          statusPanel.textContent =
            'Editing member — save changes or cancel. Requires profile/identity permissions for your admin role.';
        })
        .catch(function (e) {
          statusPanel.textContent = e.message || String(e);
        });
    }

    async function saveEditMember() {
      const id = document.getElementById('emId').value;
      if (!id || !editMemberInitial) return;
      const tagStr = document.getElementById('emTags').value.trim();
      const tags = tagStr.length
        ? tagStr.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
        : [];
      const b = document.getElementById('emBirthday').value;
      const body = {
        displayName: document.getElementById('emDisplayName').value.trim(),
        status: document.getElementById('emStatus').value,
        birthday: b ? b : null,
        gender: document.getElementById('emGender').value.trim(),
        preferredStore: document.getElementById('emPreferredStore').value.trim(),
        signupSource: document.getElementById('emSignupSource').value.trim(),
        memberTier: document.getElementById('emMemberTier').value.trim(),
        marketingConsent: document.getElementById('emMarketingConsent').checked,
        notes: document.getElementById('emNotes').value,
        tags,
      };
      const em = document.getElementById('emEmail').value.trim();
      if (em) body.email = em;
      const phone = document.getElementById('emPhone').value.trim();
      if (phone !== (editMemberInitial.phoneE164 || '') && phone.length) {
        body.phoneE164 = phone;
      }
      const saveBtn = document.getElementById('editMemberSave');
      try {
        saveBtn.disabled = true;
        await apiPatch('/admin/customers/' + encodeURIComponent(id), body);
        closeEditMemberModal();
        await loadCustomers();
        statusPanel.textContent = 'Member saved successfully.';
      } catch (e) {
        statusPanel.textContent = e.message || String(e);
      } finally {
        saveBtn.disabled = false;
      }
    }

    async function loadOverview() {
      const data = await api('/admin/overview');
      let rep = {};
      try {
        rep = await api('/admin/reports/dashboard');
      } catch (_) {
        /* optional: reporting endpoint may be forbidden on some roles */
      }
      document.getElementById('ovMembers').textContent = fmt(data.members);
      document.getElementById('ovActive').textContent = fmt(data.activeMembers);
      document.getElementById('ovNewToday').textContent = fmt(data.newMembers?.today);
      document.getElementById('ovNewWeek').textContent = fmt(data.newMembers?.thisWeek);
      document.getElementById('ovNewMonth').textContent = fmt(data.newMembers?.thisMonth);
      document.getElementById('ovPtsIssued').textContent = fmt(data.loyalty?.pointsIssued);
      document.getElementById('ovPtsRedeemed').textContent = fmt(data.loyalty?.pointsRedeemed);
      document.getElementById('ovTopUp').textContent = fmt(data.loyalty?.walletTopUpTotal);
      document.getElementById('ovOtp').textContent = fmt(data.otpVerifiedCount);
      document.getElementById('ovVIssued').textContent = fmt(data.vouchers?.issued);
      document.getElementById('ovVRedeemed').textContent = fmt(data.vouchers?.redeemed);
      document.getElementById('ovVExpired').textContent = fmt(data.vouchers?.expired);
      document.getElementById('ovVVoid').textContent = fmt(data.vouchers?.void);
      const rate = data.vouchers?.redemptionRate;
      document.getElementById('ovVRate').textContent = rate != null ? (Math.round(rate * 10000) / 100) + '%' : '-';
      document.getElementById('ovBirthdays').textContent = fmt(data.birthdayMembersThisMonth);
      const o30 = document.getElementById('ovOrders30');
      if (o30) o30.textContent = fmt(data.commerce?.ordersLast30Days);
      const g30 = document.getElementById('ovGmv30');
      if (g30) g30.textContent = moneyFromCents(data.commerce?.gmvLast30DaysCents);
      lastDashMarketing = rep.marketing || null;
      paintMarketing(lastDashMarketing, 'mkDash');
      const dashSp = document.getElementById('mkDashSpenderPeriod');
      paintSpenderPeriod('mkDash', lastDashMarketing, dashSp ? dashSp.value : 'all');

      const regRows = (data.recentRegistrations || []).map((r) =>
        '<tr><td>' + fmt(r.phoneE164) + '</td><td>' + fmt(r.displayName) + '</td><td>' + statusPill(fmt(r.status)) + '</td><td>' + dateFmt(r.createdAt) + '</td></tr>'
      );
      document.getElementById('recentRegBody').innerHTML = regRows.join('') || '<tr><td colspan="4">No data</td></tr>';

      const vRows = (data.recentVoucherActivity || []).map((v) =>
        '<tr><td>' + fmt(v.memberPhone) + '</td><td>' + fmt(v.code) + '</td><td>' + statusPill(fmt(v.status)) + '</td><td>' + dateFmt(v.updatedAt) + '</td></tr>'
      );
      document.getElementById('recentVoucherBody').innerHTML = vRows.join('') || '<tr><td colspan="4">No data</td></tr>';

      const wRows = (data.recentWalletActivity || []).map((w) =>
        '<tr><td>' + fmt(w.memberPhone) + '</td><td>' + fmt(w.deltaPoints) + '</td><td>' + fmt(w.balanceAfter) + '</td><td>' + fmt(w.reason) + '</td><td>' + dateFmt(w.createdAt) + '</td></tr>'
      );
      document.getElementById('recentWalletBody').innerHTML = wRows.join('') || '<tr><td colspan="5">No data</td></tr>';

      const wbM = document.getElementById('wbMembers');
      if (wbM) wbM.textContent = fmt(data.members);
      const wbT = document.getElementById('wbTopUp');
      if (wbT) wbT.textContent = fmt(data.loyalty?.walletTopUpTotal);
      const lbI = document.getElementById('lbPtsIssued');
      if (lbI) lbI.textContent = fmt(data.loyalty?.pointsIssued);
      const lbR = document.getElementById('lbPtsRedeemed');
      if (lbR) lbR.textContent = fmt(data.loyalty?.pointsRedeemed);
      const vrI = document.getElementById('vrIssued');
      if (vrI) vrI.textContent = fmt(data.vouchers?.issued);
      const vrR = document.getElementById('vrRedeemed');
      if (vrR) vrR.textContent = fmt(data.vouchers?.redeemed);
      const vrE = document.getElementById('vrExpired');
      if (vrE) vrE.textContent = fmt(data.vouchers?.expired);
      const vrV = document.getElementById('vrVoid');
      if (vrV) vrV.textContent = fmt(data.vouchers?.void);
      const vrRt = document.getElementById('vrRate');
      if (vrRt) {
        const r = data.vouchers?.redemptionRate;
        vrRt.textContent = r != null ? (Math.round(r * 10000) / 100) + '%' : '-';
      }
      const vAss = document.getElementById('voucherAssignedBody');
      if (vAss) vAss.innerHTML = (data.recentVoucherActivity || []).map((v) =>
        '<tr><td>' + fmt(v.memberPhone) + '</td><td>' + fmt(v.code) + '</td><td>' + statusPill(fmt(v.status)) + '</td><td>' + dateFmt(v.updatedAt) + '</td></tr>'
      ).join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    let customerSortBy = 'createdAt';
    let customerSortDir = 'desc';
    let customerPage = 1;
    // Filter/sort params shared by the customer list and the CSV export.
    function buildCustomerFilterParams() {
      const val = (id) => {
        const el = document.getElementById(id);
        return el ? String(el.value).trim() : '';
      };
      const sortBy = val('customerSortBy') || customerSortBy;
      const sortDir = val('customerSortDir') || customerSortDir;
      customerSortBy = sortBy;
      customerSortDir = sortDir;
      const params = [
        'sortBy=' + encodeURIComponent(sortBy),
        'sortDir=' + encodeURIComponent(sortDir),
      ];
      const search = val('customerSearch');
      if (search) params.push('search=' + encodeURIComponent(search));
      const status = val('customerStatusFilter');
      if (status) params.push('status=' + encodeURIComponent(status));
      const tier = val('customerTierFilter');
      if (tier) params.push('memberTier=' + encodeURIComponent(tier));
      const source = val('customerSourceFilter');
      if (source) params.push('signupSource=' + encodeURIComponent(source));
      const tag = val('customerTagFilter');
      if (tag) params.push('tag=' + encodeURIComponent(tag));
      const hasVoucherEl = document.getElementById('customerHasVoucher');
      if (hasVoucherEl && hasVoucherEl.checked) params.push('hasActiveVoucher=true');
      return params;
    }
    function customerPageSize() {
      const el = document.getElementById('customerPageSize');
      const n = el ? parseInt(el.value, 10) : 20;
      return Number.isFinite(n) && n > 0 ? n : 20;
    }
    function renderCustomerPager(page, pageSize, total) {
      const info = document.getElementById('customersPageInfo');
      const prev = document.getElementById('customersPrevBtn');
      const next = document.getElementById('customersNextBtn');
      const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
      const to = Math.min(page * pageSize, total);
      if (info) info.textContent = total === 0
        ? 'No members match.'
        : ('Showing ' + from + '–' + to + ' of ' + total);
      if (prev) prev.disabled = page <= 1;
      if (next) next.disabled = to >= total;
    }

    async function loadCustomers() {
      const pageSize = customerPageSize();
      const params = buildCustomerFilterParams();
      const q =
        '/admin/customers?page=' + customerPage + '&pageSize=' + pageSize + '&' + params.join('&');
      const data = await api(q);
      const editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      const rows = (data.items || []).map((c) =>
        '<tr><td>' +
        fmt(c.phoneE164) +
        '</td><td>' +
        fmt(c.displayName) +
        '</td><td>' +
        fmt(c.email) +
        '</td><td>' +
        fmt(c.memberTier) +
        '</td><td>' +
        fmt(c.signupSource) +
        '</td><td>' +
        birthdayCountLabel(c.birthdayDaysUntil) +
        '</td><td>' +
        fmt(c.activeVoucherCount) +
        '</td><td>' +
        statusPill(fmt(c.status)) +
        '</td><td>' +
        fmt(c.pointsBalance) +
        '</td><td>' +
        moneyFromCents(c.lifetimeSpentCents) +
        '</td><td>' +
        fmt(c.referralsMade) +
        '</td><td>' +
        dateFmt(c.lastVisitAt) +
        '</td><td class="td-actions"><button type="button" class="icon-btn edit-member-btn" data-id="' +
        c.id +
        '" title="Edit member">' +
        editSvg +
        '</button></td></tr>'
      );
      document.getElementById('customersBody').innerHTML = rows.join('') || '<tr><td colspan="13">No data</td></tr>';
      renderCustomerPager(data.page || customerPage, data.pageSize || pageSize, data.total || 0);
    }

    async function loadLoyalty() {
      const data = await api('/admin/loyalty-ledger?limit=50');
      const rows = (data || []).map((r) =>
        '<tr><td>' + fmt(r.customerPhone) + '</td><td>' + fmt(r.deltaPoints) + '</td><td>' + fmt(r.balanceAfter) + '</td><td>' + fmt(r.referenceType || r.reason) + '</td></tr>'
      );
      document.getElementById('loyaltyBody').innerHTML = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    function formatRewardWindow(v) {
      var f = v.rewardValidFrom ? String(v.rewardValidFrom).slice(0, 10) : '—';
      var u = v.rewardValidUntil ? String(v.rewardValidUntil).slice(0, 10) : '—';
      return f + ' → ' + u;
    }

    async function loadVouchers() {
      const data = await api('/admin/voucher-definitions');
      lastVoucherDefinitions = data || [];
      const rows = (data || []).map((v) =>
        '<tr><td>' + fmt(v.code) + '</td><td>' + fmt(v.title) + '</td><td>' + fmt(v.pointsCost) + '</td><td>' + statusPill(v.isActive ? 'ACTIVE' : 'INACTIVE') + '</td></tr>'
      );
      const html = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
      const vb = document.getElementById('voucherBody');
      if (vb) vb.innerHTML = html;
      const vt = document.getElementById('voucherTemplateBody');
      if (vt) vt.innerHTML = html;
      const lr = document.getElementById('vrHubSeriesBody');
      if (lr) {
        const editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        const copySvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        const viewSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
        lr.innerHTML = (data || []).map((v) =>
          '<tr><td>' + fmt(v.code) + '</td><td>' + fmt(v.title) + '</td><td class="td-actions">' +
          '<button type="button" class="icon-btn reward-def-copy-id-btn" data-id="' + fmt(v.id) + '" title="Copy voucher ID">' + copySvg + '</button></td><td class="td-actions">' +
          (v.imageUrl
            ? '<button type="button" class="icon-btn reward-def-view-image-btn" data-image-url="' + fmt(v.imageUrl) + '" title="View image">' + viewSvg + '</button>'
            : '<span class="muted-hint">—</span>') +
          '</td><td>' + fmt(v.pointsCost) + (v.rebateValueSen ? ' <span class="muted-hint">· RM' + (v.rebateValueSen / 100).toFixed(2) + ' off</span>' : '') + '</td><td>' + fmt(v.rewardCategory) + '</td><td>' +
          (v.showInRewardsCatalog ? statusPill('YES') : statusPill('NO')) + '</td><td>' + formatRewardWindow(v) + '</td><td>' + fmt(v.rewardSortOrder) + '</td><td>' +
          fmt(v.maxTotalIssued) + '</td><td>' + statusPill(v.isActive ? 'ACTIVE' : 'INACTIVE') + '</td><td class="td-actions">' +
          '<button type="button" class="icon-btn reward-def-edit-btn" data-id="' + v.id + '" title="Edit">' + editSvg + '</button></td></tr>'
        ).join('') || '<tr><td colspan="12">No data</td></tr>';
      }
      await loadRewardsWorkflowV2();
    }

    async function loadRewardsWorkflowV2() {
      const [catalog, campaigns, redemptions, analytics] = await Promise.all([
        api('/admin/rewards-workflow/reward-catalog'),
        api('/admin/rewards-workflow/voucher-campaigns'),
        api('/admin/rewards-workflow/redemption-reports'),
        api('/admin/rewards-workflow/campaign-analytics'),
      ]);
      var cc = document.getElementById('rwfCatalogCount');
      if (cc) cc.textContent = fmt((catalog || []).length);
      var cp = document.getElementById('rwfCampaignCount');
      if (cp) cp.textContent = fmt((campaigns || []).length);
      var rt = document.getElementById('rwfRedemptionTotal');
      if (rt) rt.textContent = fmt(redemptions && redemptions.total);
      var rc = document.getElementById('rwfRedemptionConfirmed');
      if (rc) rc.textContent = fmt(redemptions && redemptions.confirmed);
      var rr = document.getElementById('rwfRedemptionReleased');
      if (rr) rr.textContent = fmt(redemptions && redemptions.released);
      var body = document.getElementById('rwfCampaignBody');
      if (body) {
        body.innerHTML = ((analytics && analytics.campaigns) || [])
          .map(function (c) {
            return '<tr><td>' + fmt(c.code) + '</td><td>' + fmt(c.name) + '</td><td>' + fmt(c.vouchersIssued) + '</td><td>' + fmt(c.rewardsLinked) + '</td></tr>';
          })
          .join('') || '<tr><td colspan="4">No campaign analytics yet</td></tr>';
      }
    }

    var vrhWizardStep = 1;
    function vrhSlugFromTitle(title) {
      var base = String(title || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 44);
      if (!base) base = 'SERIES';
      return base + '_' + Math.random().toString(36).slice(2, 6).toUpperCase();
    }
    function vrhSyncOfferTypeCards() {
      var promo = document.getElementById('vrhOfferPromo');
      var points = document.getElementById('vrhOfferPoints');
      var lp = document.getElementById('vrhOfferPromoLabel');
      var lq = document.getElementById('vrhOfferPointsLabel');
      var isPoints = points && points.checked;
      if (lp) lp.classList.toggle('is-selected', !isPoints);
      if (lq) lq.classList.toggle('is-selected', !!isPoints);
      var wrap = document.getElementById('vrhPointsCostWrap');
      if (wrap) wrap.style.display = isPoints ? '' : 'none';
    }
    function vrhSetWizardStep(step) {
      vrhWizardStep = step;
      var s1 = document.getElementById('vrhWizStep1');
      var s2 = document.getElementById('vrhWizStep2');
      var s3 = document.getElementById('vrhWizStep3');
      if (s1) s1.classList.toggle('hidden', step !== 1);
      if (s2) s2.classList.toggle('hidden', step !== 2);
      if (s3) s3.classList.toggle('hidden', step !== 3);
      var i1 = document.getElementById('vrhStepInd1');
      var i2 = document.getElementById('vrhStepInd2');
      var i3 = document.getElementById('vrhStepInd3');
      if (i1) {
        i1.classList.toggle('is-current', step === 1);
        i1.classList.toggle('is-done', step > 1);
      }
      if (i2) {
        i2.classList.toggle('is-current', step === 2);
        i2.classList.toggle('is-done', step > 2);
      }
      if (i3) {
        i3.classList.toggle('is-current', step === 3);
        i3.classList.remove('is-done');
      }
    }
    function vrhShowPane(name) {
      ['overview', 'wizard', 'series', 'automation', 'issued', 'workflow2'].forEach(function (pane) {
        var el = document.getElementById('vrh-pane-' + pane);
        if (el) el.classList.toggle('hidden', pane !== name);
      });
      document.querySelectorAll('.vrh-tab').forEach(function (btn) {
        var on = btn.getAttribute('data-vrh-pane') === name;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (name === 'wizard') {
        vrhSetWizardStep(1);
        var out = document.getElementById('vrhCreateSeriesResult');
        if (out) out.textContent = '';
      }
    }
    function vrhEsc(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function vrhWizardBuildSummary() {
      var title = document.getElementById('vrhSeriesTitle').value.trim();
      var code = document.getElementById('vrhSeriesCode').value.trim();
      var desc = document.getElementById('vrhSeriesDescription').value.trim();
      var points = document.getElementById('vrhOfferPoints').checked;
      var vf = document.getElementById('vrhSeriesValidFrom').value;
      var vu = document.getElementById('vrhSeriesValidUntil').value;
      var cat = document.getElementById('vrhSeriesCategory').value.trim();
      var img = document.getElementById('vrhSeriesImageUrl').value.trim();
      var mx = document.getElementById('vrhSeriesMaxIssued').value.trim();
      var pc = document.getElementById('vrhSeriesPoints').value.trim();
      var lines = [
        '<strong>Series:</strong> ' + vrhEsc(title || '—'),
        '<strong>Code:</strong> <code>' + vrhEsc(code || '—') + '</code>',
        '<strong>Channel:</strong> ' + (points ? 'Points catalog (Perks → Rewards)' : 'Promo / wallet (not in points catalog)'),
      ];
      if (desc) lines.push('<strong>Description:</strong> ' + vrhEsc(desc));
      if (vf || vu) lines.push('<strong>Validity:</strong> ' + vrhEsc((vf || '…') + ' → ' + (vu || '…')));
      if (cat) lines.push('<strong>Category:</strong> ' + vrhEsc(cat));
      if (img) lines.push('<strong>Image:</strong> ' + vrhEsc(img));
      if (mx) lines.push('<strong>Max issued:</strong> ' + vrhEsc(mx));
      if (points && pc) lines.push('<strong>Points price:</strong> ' + vrhEsc(pc));
      var sumEl = document.getElementById('vrhWizardSummary');
      if (sumEl) sumEl.innerHTML = lines.join('<br/>');
    }

    async function loadCommerceOrders() {
      const hint = document.getElementById('oqHint');
      const tbody = document.getElementById('oqBody');
      if (!tbody) return;
      if (hint) hint.textContent = 'Loading…';
      const params = new URLSearchParams();
      params.set('status', document.getElementById('oqStatus').value);
      params.set('dateField', document.getElementById('oqDateField').value);
      const from = document.getElementById('oqFrom').value;
      const to = document.getElementById('oqTo').value;
      const pc = document.getElementById('oqProductContains').value.trim();
      const pid = document.getElementById('oqProductId').value.trim();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (pc) params.set('productContains', pc);
      if (pid) params.set('productId', pid);
      params.set('sort', document.getElementById('oqSort').value);
      params.set('limit', document.getElementById('oqLimit').value);
      try {
        const data = await api('/admin/commerce/orders?' + params.toString());
        const orders = data.orders || [];
        tbody.innerHTML =
          orders
            .map(function (o) {
              var lines = (o.lines || [])
                .map(function (l) {
                  return fmt(l.name) + ' ×' + fmt(l.qty);
                })
                .slice(0, 3)
                .join(', ');
              if ((o.lines || []).length > 3) lines += '…';
              var st = (o.status || '').toLowerCase();
              var stLabel =
                st === 'completed' ? 'Completed' : st === 'placed' ? 'Open' : fmt(o.status);
              return (
                '<tr><td>' +
                fmt(o.orderNumber) +
                '</td><td>' +
                stLabel +
                '</td><td>' +
                dateFmt(o.placedAt) +
                '</td><td>' +
                (o.completedAt ? dateFmt(o.completedAt) : '—') +
                '</td><td>' +
                fmt(o.customerDisplayName) +
                '</td><td>' +
                fmt(o.customerPhoneMasked) +
                '</td><td>' +
                moneyFromCents(o.totalCents) +
                '</td><td style="max-width:280px;font-size:12px">' +
                (lines || '—') +
                '</td></tr>'
              );
            })
            .join('') || '<tr><td colspan="8">No orders match filters.</td></tr>';
        if (hint) hint.textContent = orders.length + ' row(s).';
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8">Could not load orders.</td></tr>';
        if (hint) hint.textContent = e.message || String(e);
        throw e;
      }
    }

    async function loadDailyCommerceReport() {
      const dce = document.getElementById('dcDate');
      const tbody = document.getElementById('dcItemsBody');
      const summary = document.getElementById('dcSummary');
      const badge = document.getElementById('dcClosedBadge');
      const closeBtn = document.getElementById('dcCloseBtn');
      const resEl = document.getElementById('dcResult');
      if (!dce || !tbody) return;
      var t0 = new Date();
      var dateStr =
        dce.value ||
        saIsoDateUtc(new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate())));
      dce.value = dateStr;
      if (resEl) resEl.textContent = '';
      tbody.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
      try {
        const data = await api(
          '/admin/reports/daily-commerce?date=' + encodeURIComponent(dateStr),
        );
        const items = data.items || [];
        tbody.innerHTML =
          items
            .map(function (it) {
              return (
                '<tr><td>' +
                fmt(it.name) +
                '</td><td><code style="font-size:11px">' +
                fmt(it.productId) +
                '</code></td><td>' +
                fmt(it.qtySold) +
                '</td><td>' +
                moneyFromCents(it.revenueCents) +
                '</td></tr>'
              );
            })
            .join('') || '<tr><td colspan="4">No completed sales for this day.</td></tr>';
        if (summary) {
          summary.textContent =
            'Completed orders: ' +
            fmt(data.completedOrders) +
            ' · GMV: ' +
            moneyFromCents(data.totalGmvCents);
        }
        if (data.closed) {
          if (badge)
            badge.textContent =
              'Day closed' + (data.closedAt ? ' · ' + dateFmt(data.closedAt) : '') + '.';
          if (closeBtn) closeBtn.disabled = true;
        } else {
          if (badge) badge.textContent = 'Open — not closed for this date.';
          if (closeBtn) closeBtn.disabled = false;
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4">Could not load daily report.</td></tr>';
        if (summary) summary.textContent = '';
        if (badge) badge.textContent = '';
        if (closeBtn) closeBtn.disabled = true;
        if (resEl) resEl.textContent = e.message || String(e);
        throw e;
      }
    }

    function pcrSenToRm(sen) {
      if (sen == null || sen === '') return '—';
      var n = Number(sen);
      if (!Number.isFinite(n)) return '—';
      return 'RM ' + (n / 100).toFixed(2);
    }

    function pcrParseRmToSen(input) {
      var s = String(input || '').trim().replace(',', '.');
      if (!s) return undefined;
      var n = parseFloat(s);
      if (!Number.isFinite(n) || n < 0) return undefined;
      return Math.round(n * 100);
    }

    function pcrOptionalInt(el) {
      var s = String(el && el.value != null ? el.value : '').trim();
      if (!s) return undefined;
      var n = parseInt(s, 10);
      return Number.isFinite(n) ? n : undefined;
    }

    function pcrCriteriaHintText(criteriaKind) {
      var m = {
        CAMPAIGN_WINDOW_ONLY: 'No extra thresholds — only campaign dates apply.',
        NEW_MEMBER_WITHIN_DAYS: 'Fill “Within days of signup”.',
        SINGLE_PURCHASE_MIN_RM: 'Fill “Min single purchase (RM)” for one qualifying order.',
        TIER_AND_PURCHASE_MIN_RM: 'Fill minimum tier and “Min single purchase (RM)”.',
        BIRTHDAY_DURING_CAMPAIGN: 'Member birthday must fall between campaign dates.',
        WALLET_TOPUP_MIN_RM: 'Fill “Min wallet top-up (RM)” for one top-up event.',
        REFERRALS_MIN_COUNT: 'Fill “Min referrals”.',
        REENGAGEMENT_INACTIVE_DAYS: 'Fill “Inactive days” since last activity.',
      };
      return m[criteriaKind] || '';
    }

    function pcrRefreshCriteriaHint(isEdit) {
      var ck = document.getElementById(isEdit ? 'pcrEditCriteriaKind' : 'pcrCriteriaKind');
      var hint = document.getElementById(isEdit ? 'pcrEditCriteriaHint' : 'pcrCriteriaHint');
      if (hint && ck) hint.textContent = pcrCriteriaHintText(ck.value);
    }

    function pcrIsoDate(d) {
      if (!d) return '—';
      return String(d).slice(0, 10);
    }

    function pcrConditionsLine(r) {
      var parts = [];
      if (r.minPurchaseAmountSen != null) parts.push('Min purchase ' + pcrSenToRm(r.minPurchaseAmountSen));
      if (r.rebateValueSen != null) parts.push('Rebate ' + pcrSenToRm(r.rebateValueSen));
      if (r.minWalletTopupSen != null) parts.push('Min top-up ' + pcrSenToRm(r.minWalletTopupSen));
      if (r.withinDaysOfSignup != null) parts.push('Signup ≤ ' + r.withinDaysOfSignup + 'd');
      if (r.minReferralCount != null) parts.push('Referrals ≥ ' + r.minReferralCount);
      if (r.inactiveDays != null) parts.push('Inactive ≥ ' + r.inactiveDays + 'd');
      if (r.minMemberTier) parts.push('Tier ≥ ' + r.minMemberTier);
      return parts.length ? parts.join(' · ') : '—';
    }

    function filterPerksCampaignRules(rows, filterVal) {
      var list = Array.isArray(rows) ? rows : [];
      if (!filterVal || filterVal === 'all') return list;
      if (filterVal === 'VOUCHER_REBATE') {
        return list.filter(function (r) {
          return r.programKind === 'VOUCHER_REBATE';
        });
      }
      return list.filter(function (r) {
        return r.programKind === 'REWARD_FREE_ITEM' || r.programKind === 'REWARD_POINTS_REDEEM';
      });
    }

    function paintPerksCampaignRulesTable() {
      var sel = document.getElementById('pcrProgramFilter');
      var fv = sel && sel.value ? sel.value : 'all';
      var filtered = filterPerksCampaignRules(lastPerksCampaignRules, fv);
      const editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      const body = document.getElementById('pcrRulesBody');
      if (!body) return;
      body.innerHTML = filtered
        .map(function (r) {
          var vd = r.voucherDefinition || {};
          var camp = pcrIsoDate(r.campaignStartDate) + ' → ' + pcrIsoDate(r.campaignEndDate);
          var maxG = r.maxGrantsPerCustomer != null ? String(r.maxGrantsPerCustomer) : '—';
          return (
            '<tr><td>' +
            fmt(r.name) +
            '</td><td>' +
            fmt(r.programKind) +
            '</td><td>' +
            fmt(r.criteriaKind) +
            '</td><td>' +
            fmt(camp) +
            '</td><td style="font-size:12px;max-width:220px">' +
            fmt(pcrConditionsLine(r)) +
            '</td><td>' +
            fmt(vd.code) +
            '</td><td>' +
            (r.isActive ? statusPill('ACTIVE') : statusPill('OFF')) +
            '</td><td>' +
            fmt(maxG) +
            '</td><td class="td-actions">' +
            '<button type="button" class="icon-btn pcr-edit-btn" data-id="' +
            r.id +
            '" title="Edit">' +
            editSvg +
            '</button></td></tr>'
          );
        })
        .join('') || '<tr><td colspan="9">No campaigns match this filter.</td></tr>';
    }

    async function loadPerksCampaignRules() {
      const data = await api('/admin/perks-campaign-rules');
      lastPerksCampaignRules = data || [];
      paintPerksCampaignRulesTable();
    }

    async function loadWalletLedger() {
      const data = await api('/admin/wallet-ledger?limit=100');
      const rows = (data || []).map((r) =>
        '<tr><td>' + dateFmt(r.createdAt) + '</td><td>' + fmt(r.customerPhone) + '</td><td>' + fmt(r.type) + '</td><td>' + fmt(r.amountCents) + '</td><td>' + fmt(r.balanceAfter) + '</td><td>' + fmt(r.reason) + '</td></tr>'
      );
      const el = document.getElementById('walletLedgerBody');
      if (el) el.innerHTML = rows.join('') || '<tr><td colspan="6">No data</td></tr>';
    }

    async function loadAudit() {
      const data = await api('/admin/audit-logs?limit=50');
      const rows = (data || []).map((a) =>
        '<tr><td>' + dateFmt(a.createdAt) + '</td><td>' + fmt(a.actorType + (a.actorId ? ':' + a.actorId : '')) + '</td><td>' + fmt(a.action) + '</td><td>' + fmt(a.entityType) + '</td></tr>'
      );
      document.getElementById('auditBody').innerHTML = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    async function loadLoginAudit() {
      const data = await api('/admin/audit-logs?limit=200');
      const rows = (data || []).filter((a) => String(a.action || '').includes('admin.login')).map((a) =>
        '<tr><td>' + dateFmt(a.createdAt) + '</td><td>' + fmt(a.actorLabel || a.actorId || a.actorType) + '</td><td>' + fmt(a.action) + '</td><td>' + fmt(a.entityType) + '</td></tr>'
      );
      document.getElementById('loginAuditBody').innerHTML = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    async function loadCampaignSegments() {
      const data = await api('/admin/segments/audiences');
      const rows = (data || []).map((s) =>
        '<tr><td>' + fmt(s.name) + '</td><td>' + fmt(s.description) + '</td><td>' + dateFmt(s.updatedAt) + '</td></tr>'
      );
      document.getElementById('campaignSegmentsBody').innerHTML = rows.join('') || '<tr><td colspan="3">No data</td></tr>';
    }

    async function loadCampaignHistory() {
      const data = await api('/admin/audit-logs?limit=200');
      const rows = (data || []).filter((a) => String(a.action || '').includes('campaign')).map((a) =>
        '<tr><td>' + dateFmt(a.createdAt) + '</td><td>' + fmt(a.actorLabel || a.actorId || a.actorType) + '</td><td>' + fmt(a.action) + '</td><td>' + fmt(a.entityType) + '</td></tr>'
      );
      document.getElementById('campaignHistoryBody').innerHTML = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    function buildCampaignVoucherFilters() {
      const includeBirthday = document.getElementById('cpvUseBirthdayToday').checked;
      const includeNotReturning = document.getElementById('cpvUseNotReturning').checked;
      const inactiveDaysRaw = parseInt(document.getElementById('cpvInactiveDays').value, 10);
      const phone = document.getElementById('cpvPhoneSearch').value.trim();
      const strategy = document.getElementById('cpvStrategy').value;
      const isAll = strategy === 'all';
      if (!isAll && !includeBirthday && !includeNotReturning && !phone) {
        throw new Error('Select at least one target condition or provide phone search.');
      }
      const filters = {};
      if (phone) filters.search = phone;
      if (includeBirthday && !isAll) {
        const d = new Date();
        filters.birthdayMonth = d.getMonth() + 1;
        filters.birthdayDay = d.getDate();
      }
      if (includeNotReturning && !isAll) {
        filters.inactiveDays = Number.isFinite(inactiveDaysRaw) && inactiveDaysRaw > 0 ? inactiveDaysRaw : 60;
      }
      return {
        filters,
        inactiveDays: Number.isFinite(inactiveDaysRaw) && inactiveDaysRaw > 0 ? inactiveDaysRaw : 60,
        phone,
      };
    }

    async function loadCampaignVoucherInsights() {
      const cfg = buildCampaignVoucherFilters();
      const q = '/admin/segments/campaigns/insights?inactiveDays=' + encodeURIComponent(String(cfg.inactiveDays)) +
        '&limit=200' + (cfg.phone ? '&phone=' + encodeURIComponent(cfg.phone) : '');
      const data = await api(q);
      document.getElementById('cpvBirthdayCount').textContent = fmt(data.summary?.birthdayToday);
      document.getElementById('cpvNotReturningCount').textContent = fmt(data.summary?.notReturning);
      document.getElementById('cpvOverlapCount').textContent = fmt(data.summary?.overlapBirthdayAndNotReturning);
      document.getElementById('cpvTotalCount').textContent = fmt(data.summary?.uniquePriorityAudience);

      const rows = (data.guests || []).map((g) =>
        '<tr><td>' + fmt(g.phoneE164) + '</td><td>' + fmt(g.displayName) + '</td><td>' + fmt(g.memberTier) + '</td><td>' +
        (g.isBirthdayToday ? statusPill('YES') : statusPill('NO')) + '</td><td>' +
        (g.isNotReturning ? statusPill('YES') : statusPill('NO')) + '</td><td>' + fmt(g.daysSinceLastSeen) + '</td><td>' +
        dateFmt(g.lastLoginAt) + '</td></tr>'
      );
      document.getElementById('cpvGuestBody').innerHTML = rows.join('') || '<tr><td colspan="7">No matching members</td></tr>';
    }

    async function runCampaignPushVoucher() {
      const code = document.getElementById('cpvVoucherCode').value.trim();
      if (!code) throw new Error('Voucher code is required.');
      const strategy = document.getElementById('cpvStrategy').value;
      const cfg = buildCampaignVoucherFilters();
      const payload = {
        voucherCode: code,
        campaignType: strategy === 'reengagement'
          ? 'reengagement_voucher'
          : strategy === 'birthday'
            ? 'birthday_voucher'
            : strategy === 'all'
              ? 'all_customers_voucher'
              : 'mixed_voucher',
      };
      return apiPost('/admin/segments/campaigns/run', {
        action: 'push_voucher',
        filters: cfg.filters,
        payload,
      });
    }

    function pollCampaignRunStatus(runId) {
      return new Promise(function (resolve, reject) {
        var tries = 0;
        function tick() {
          tries += 1;
          api('/admin/segments/campaigns/run/' + encodeURIComponent(runId) + '/status')
            .then(function (s) {
              if (s.status === 'COMPLETED' || s.status === 'FAILED') {
                resolve(s);
              } else if (tries > 900) {
                reject(new Error('Campaign status poll timed out'));
              } else {
                setTimeout(tick, 1000);
              }
            })
            .catch(reject);
        }
        tick();
      });
    }

    async function loadImportHistory() {
      const data = await api('/admin/import/batches');
      const rows = (data || []).map((b) =>
        '<tr><td>' + dateFmt(b.uploadedAt) + '</td><td>' + fmt(b.kind) + '</td><td>' + statusPill(fmt(b.status)) + '</td><td>' + fmt(b.totalRows) + '</td><td>' + fmt(b.summary) + '</td></tr>'
      );
      document.getElementById('importHistoryBody').innerHTML = rows.join('') || '<tr><td colspan="5">No data</td></tr>';
    }

    async function loadExportJobs() {
      const data = await api('/admin/export/jobs');
      const rows = (data || []).map((j) =>
        '<tr><td>' + dateFmt(j.createdAt) + '</td><td>' + fmt(j.kind) + '</td><td>' + fmt(j.format) + '</td><td>' + statusPill(fmt(j.status)) + '</td><td>' + fmt(j.fileName || '-') + '</td></tr>'
      );
      document.getElementById('exportJobsBody').innerHTML = rows.join('') || '<tr><td colspan="5">No data</td></tr>';
    }

    async function loadReporting() {
      const data = await api('/admin/reports/dashboard');
      document.getElementById('rpMembers').textContent = fmt(data.overview?.members);
      document.getElementById('rpInactive').textContent = fmt(data.inactiveMembers);
      const srcRows = (data.acquisitionBySource || []).map((r) =>
        '<tr><td>' + fmt(r.signupSource) + '</td><td>' + fmt(r.count) + '</td></tr>'
      );
      document.getElementById('reportSourceBody').innerHTML = srcRows.join('') || '<tr><td colspan="2">No data</td></tr>';
      lastRpMarketing = data.marketing || null;
      paintMarketing(lastRpMarketing, 'mkRp');
      const rpSp = document.getElementById('mkRpSpenderPeriod');
      paintSpenderPeriod('mkRp', lastRpMarketing, rpSp ? rpSp.value : 'all');
    }

    var lastBentoMenu = [];
    var bentoMenuWeek = 0;
    var bentoMenuWeekRange = { 0: null, 1: null, 2: null, 3: null };
    var bentoMenuImportCache = null;
    var lastBentoPackages = [];
    function bpAttr(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
    }
    function bpRmToCents(raw) {
      var s = String(raw == null ? '' : raw).trim().replace(',', '.');
      if (!s) return null;
      var n = parseFloat(s);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.round(n * 100);
    }
    function bpCentsToRmInput(cents) {
      if (cents == null || cents === '') return '';
      var n = Number(cents);
      if (!Number.isFinite(n)) return '';
      return (n / 100).toFixed(2);
    }
    var lastBentoVouchers = [];
    function bvRm(cents) {
      var n = Number(cents);
      if (!Number.isFinite(n)) return '—';
      return 'RM' + (n / 100).toFixed(2);
    }
    function bvDate(iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    function renderBentoVouchers() {
      var body = document.getElementById('bentoVouchersBody');
      if (!body) return;
      body.innerHTML = (lastBentoVouchers || []).map(function (v) {
        var full = v.redeemedCount >= v.redemptionCap;
        var countStyle = full ? ' style="color:#b91c1c;font-weight:600"' : '';
        return '<tr data-voucher-id="' + bmAttr(v.id) + '">' +
          '<td><code style="font-size:11px">' + bmAttr(v.code) + '</code>' +
            (v.description ? '<br><span class="field-hint" style="margin:0">' + bmAttr(v.description) + '</span>' : '') + '</td>' +
          '<td>' + bvRm(v.amountOffCents) + '</td>' +
          '<td><span class="field-hint" style="margin:0">' + bvDate(v.startsAt) + '<br>→ ' + bvDate(v.endsAt) + '</span></td>' +
          '<td' + countStyle + '>' + fmt(v.redeemedCount) + ' / ' + fmt(v.redemptionCap) + '</td>' +
          '<td>' + (v.minSpendCents != null ? bvRm(v.minSpendCents) : '—') + '</td>' +
          '<td style="text-align:center"><input type="checkbox" class="bv-active"' + (v.isActive ? ' checked' : '') + ' /></td>' +
          '<td style="text-align:center"><button type="button" class="btn-outline bv-delete" data-code="' + bmAttr(v.code) + '" style="padding:4px 10px;color:#b91c1c">Delete</button></td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="7">No vouchers yet</td></tr>';
    }
    async function loadBentoVouchers() {
      var data = await api('/admin/bento-vouchers');
      lastBentoVouchers = Array.isArray(data) ? data : [];
      renderBentoVouchers();
    }
    async function createBentoVoucher() {
      var out = document.getElementById('bentoVoucherCreateResult');
      if (out) out.textContent = 'Saving…';
      try {
        var code = String((document.getElementById('bvCode') || {}).value || '').trim().toUpperCase();
        var amountCents = bpRmToCents((document.getElementById('bvAmount') || {}).value);
        var startRaw = String((document.getElementById('bvStart') || {}).value || '').trim();
        var endRaw = String((document.getElementById('bvEnd') || {}).value || '').trim();
        var capRaw = String((document.getElementById('bvCap') || {}).value || '').trim();
        var minSpendRaw = String((document.getElementById('bvMinSpend') || {}).value || '').trim();
        var desc = String((document.getElementById('bvDesc') || {}).value || '').trim();
        if (!code) throw new Error('Enter a voucher code.');
        if (!amountCents || amountCents < 1) throw new Error('Enter a valid amount off (≥ RM0.01).');
        if (!startRaw || !endRaw) throw new Error('Enter both a start and end date.');
        var startsAt = new Date(startRaw);
        var endsAt = new Date(endRaw);
        if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) throw new Error('Enter valid dates.');
        if (endsAt <= startsAt) throw new Error('End date must be after the start date.');
        var cap = parseInt(capRaw, 10);
        if (!Number.isFinite(cap) || cap < 1) throw new Error('Enter a redemption capacity (≥ 1).');
        var minSpendCents = minSpendRaw ? bpRmToCents(minSpendRaw) : null;
        var payload = {
          code: code,
          amountOffCents: amountCents,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          redemptionCap: cap,
        };
        if (minSpendCents != null) payload.minSpendCents = minSpendCents;
        if (desc) payload.description = desc;
        await apiPost('/admin/bento-vouchers', payload);
        ['bvCode', 'bvAmount', 'bvStart', 'bvEnd', 'bvCap', 'bvMinSpend', 'bvDesc'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.value = '';
        });
        if (out) out.textContent = 'Created.';
        await loadBentoVouchers();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function toggleBentoVoucherActive(id, isActive) {
      var out = document.getElementById('bentoVouchersListResult');
      try {
        await apiPatch('/admin/bento-vouchers/' + encodeURIComponent(id), { isActive: isActive });
        if (out) out.textContent = 'Updated.';
        await loadBentoVouchers();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
        await loadBentoVouchers();
      }
    }
    async function deleteBentoVoucher(id, code) {
      if (!window.confirm('Delete voucher ' + code + '? This cannot be undone. Codes that were already used cannot be deleted — deactivate those instead.')) return;
      var out = document.getElementById('bentoVouchersListResult');
      try {
        await apiDelete('/admin/bento-vouchers/' + encodeURIComponent(id));
        if (out) out.textContent = 'Deleted ' + code + '.';
        await loadBentoVouchers();
      } catch (e) {
        if (out) out.textContent = bentoSchedFriendlyError(e);
      }
    }
    function renderBentoPackages() {
      var body = document.getElementById('bentoPackagesBody');
      if (!body) return;
      body.innerHTML = (lastBentoPackages || []).map(function (p) {
        var fixedHint = p.code === 'NEWCOMER_3'
          ? ' placeholder="39.00"'
          : ' placeholder="—"';
        return '<tr data-package-code="' + bpAttr(p.code) + '">' +
          '<td><code style="font-size:11px">' + bpAttr(p.code) + '</code></td>' +
          '<td><input type="text" class="bp-label" value="' + bpAttr(p.label) + '" style="width:100%;min-width:160px" /></td>' +
          '<td>' + fmt(p.mealCredits) + '</td>' +
          '<td>' + fmt(p.durationDays) + '</td>' +
          '<td><input type="text" class="bp-price" inputmode="decimal" value="' + bpAttr(bpCentsToRmInput(p.pricePerMealCents)) + '" style="width:96px" /></td>' +
          '<td><input type="text" class="bp-fixed" inputmode="decimal" value="' + bpAttr(bpCentsToRmInput(p.fixedCheckoutCents)) + '"' + fixedHint + ' style="width:96px" /></td>' +
          '<td style="text-align:center"><input type="checkbox" class="bp-active"' + (p.isActive ? ' checked' : '') + ' /></td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="7">No packages</td></tr>';
    }
    async function loadBentoPackages() {
      var data = await api('/admin/bento-packages');
      lastBentoPackages = (data && Array.isArray(data.packages)) ? data.packages : [];
      renderBentoPackages();
    }
    function collectBentoPackages() {
      var rows = Array.prototype.slice.call(document.querySelectorAll('#bentoPackagesBody tr[data-package-code]'));
      return rows.map(function (tr) {
        var code = tr.getAttribute('data-package-code');
        var labelEl = tr.querySelector('.bp-label');
        var priceEl = tr.querySelector('.bp-price');
        var fixedEl = tr.querySelector('.bp-fixed');
        var activeEl = tr.querySelector('.bp-active');
        var priceCents = bpRmToCents(priceEl ? priceEl.value : '');
        var fixedRaw = fixedEl ? String(fixedEl.value || '').trim() : '';
        var fixedCents = fixedRaw ? bpRmToCents(fixedRaw) : null;
        return {
          code: code,
          label: labelEl ? labelEl.value.trim() : '',
          pricePerMealCents: priceCents,
          fixedCheckoutCents: fixedRaw ? fixedCents : null,
          isActive: activeEl ? activeEl.checked : true,
        };
      });
    }
    async function saveBentoPackages() {
      var out = document.getElementById('bentoPackagesSaveResult');
      if (out) out.textContent = 'Saving…';
      try {
        var items = collectBentoPackages();
        for (var i = 0; i < items.length; i += 1) {
          var it = items[i];
          if (!it.label) throw new Error('Label is required for ' + it.code + '.');
          if (!it.pricePerMealCents || it.pricePerMealCents < 100) {
            throw new Error('Enter a valid price per meal (≥ RM1.00) for ' + it.code + '.');
          }
          if (it.fixedCheckoutCents != null && it.fixedCheckoutCents < 100) {
            throw new Error('Fixed checkout for ' + it.code + ' must be ≥ RM1.00 or left empty.');
          }
        }
        var saved = await apiPut('/admin/bento-packages', { packages: items });
        lastBentoPackages = (saved && Array.isArray(saved.packages)) ? saved.packages : [];
        renderBentoPackages();
        if (out) out.textContent = 'Saved. Live in the Bento app on next packages load.';
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    function bmAttr(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
    }
    function bentoMenuWeekName(idx) {
      return 'Week ' + (Number(idx) + 1);
    }
    function renderBentoMenu() {
      var body = document.getElementById('bentoMenuBody');
      if (!body) return;
      var rows = (bentoMenuImportCache && bentoMenuImportCache[bentoMenuWeek])
        ? bentoMenuImportCache[bentoMenuWeek]
        : (lastBentoMenu || []);
      body.innerHTML = rows.map(function (d) {
        var lunch = d.lunch || {};
        var dinner = d.dinner || {};
        var dis = d.closed ? ' disabled' : '';
        function mealCol(prefix, meal, dishField, descField, zhDishPh, zhDescPh, enDishPh) {
          var dishBase = prefix + '.' + dishField;
          var descBase = prefix + '.' + descField;
          return '<div class="bm-cell">' +
            '<span class="bm-lbl">Main dish</span>' +
            '<input type="text" class="bm-input" data-field="' + dishBase + '" value="' + bmAttr(meal[dishField]) + '"' + dis + ' placeholder="' + bmAttr(d.closed ? 'Closed' : (enDishPh || 'English')) + '" />' +
            '<input type="text" class="bm-input" data-field="' + dishBase + 'Zh" value="' + bmAttr(meal[dishField + 'Zh']) + '"' + dis + ' placeholder="' + bmAttr(zhDishPh || '中文') + '" />' +
            '<span class="bm-lbl">Description</span>' +
            '<textarea class="bm-input" data-field="' + descBase + '" rows="2"' + dis + ' placeholder="English description">' + bmAttr(meal[descField]) + '</textarea>' +
            '<textarea class="bm-input" data-field="' + descBase + 'Zh" rows="2"' + dis + ' placeholder="' + bmAttr(zhDescPh || '中文描述') + '">' + bmAttr(meal[descField + 'Zh']) + '</textarea>' +
            '</div>';
        }
        return '<tr data-weekday="' + bmAttr(d.weekday) + '">' +
          '<td><strong>' + bmAttr(d.weekday) + '</strong></td>' +
          '<td>' + mealCol('lunch', lunch, 'veg', 'vegDesc', '素食', '素食描述', 'Vegetarian') + '</td>' +
          '<td>' + mealCol('lunch', lunch, 'regular', 'regularDesc', '荤菜', '荤菜描述', 'Regular') + '</td>' +
          '<td>' + mealCol('dinner', dinner, 'veg', 'vegDesc', '素食', '素食描述', 'Vegetarian') + '</td>' +
          '<td>' + mealCol('dinner', dinner, 'regular', 'regularDesc', '荤菜', '荤菜描述', 'Regular') + '</td>' +
          '<td style="text-align:center"><input type="checkbox" class="bm-closed"' + (d.closed ? ' checked' : '') + ' /></td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="6">No data</td></tr>';
    }
    function bentoMenuFmtRange(startIso, endIso) {
      if (!startIso || !endIso) return '';
      function fmt(iso) {
        var p = String(iso).split('-');
        if (p.length !== 3) return iso;
        var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
        return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      }
      return fmt(startIso) + ' — ' + fmt(endIso);
    }
    function renderBentoMenuWeekTabs() {
      var btns = document.querySelectorAll('.bentoMenuWeekBtn');
      Array.prototype.forEach.call(btns, function (b) {
        var active = String(b.getAttribute('data-week')) === String(bentoMenuWeek);
        b.classList.toggle('btn-primary', active);
        b.classList.toggle('btn-outline', !active);
      });
      var label = document.getElementById('bentoMenuWeekLabel');
      if (label) {
        var range = bentoMenuWeekRange[bentoMenuWeek];
        label.textContent = range ? (bentoMenuWeekName(bentoMenuWeek) + ': ' + range) : '';
      }
    }
    async function loadBentoMenu() {
      try {
        const cfg = await api('/admin/bento-menu?week=' + bentoMenuWeek);
        lastBentoMenu = (cfg && Array.isArray(cfg.weekdays)) ? cfg.weekdays : [];
        if (cfg && cfg.weekStart && cfg.weekEnd) {
          bentoMenuWeekRange[bentoMenuWeek] = bentoMenuFmtRange(cfg.weekStart, cfg.weekEnd);
        }
        renderBentoMenu();
        renderBentoMenuWeekTabs();
        await loadBentoSettings();
        await loadBentoPackages();
      } catch (e) {
        var msg = e && e.message ? String(e.message) : String(e);
        if (msg.indexOf('401') !== -1 || msg.indexOf('ADMIN_UNAUTHORIZED') !== -1) {
          throw new Error(
            'Authentication failed. Sign out and sign in again with a valid ADMIN_API_KEYS value or admin email/password.',
          );
        }
        throw e;
      }
    }
    function collectBentoMenu() {
      var rows = Array.prototype.slice.call(document.querySelectorAll('#bentoMenuBody tr[data-weekday]'));
      return {
        weekdays: rows.map(function (tr) {
          var closedEl = tr.querySelector('.bm-closed');
          var closed = closedEl ? closedEl.checked : false;
          function val(field) {
            var el = tr.querySelector('[data-field="' + field + '"]');
            return el ? el.value.trim() : '';
          }
          return {
            weekday: tr.getAttribute('data-weekday'),
            closed: closed,
            lunch: {
              regular: val('lunch.regular'),
              veg: val('lunch.veg'),
              regularZh: val('lunch.regularZh'),
              vegZh: val('lunch.vegZh'),
              regularDesc: val('lunch.regularDesc'),
              regularDescZh: val('lunch.regularDescZh'),
              vegDesc: val('lunch.vegDesc'),
              vegDescZh: val('lunch.vegDescZh'),
              // image omitted on purpose: the backend keeps the stored photo
              // when the field is absent (photo upload was removed from this UI).
            },
            dinner: {
              regular: val('dinner.regular'),
              veg: val('dinner.veg'),
              regularZh: val('dinner.regularZh'),
              vegZh: val('dinner.vegZh'),
              regularDesc: val('dinner.regularDesc'),
              regularDescZh: val('dinner.regularDescZh'),
              vegDesc: val('dinner.vegDesc'),
              vegDescZh: val('dinner.vegDescZh'),
            },
          };
        }),
      };
    }

    async function loadBentoSettings() {
      var capEl = document.getElementById('bentoDailyCapacity');
      var blockEl = document.getElementById('bentoBlockNewOrders');
      var launchEl = document.getElementById('bentoEarliestPickupDate');
      var leadEl = document.getElementById('bentoMinScheduleLeadDays');
      var cutoffEl = document.getElementById('bentoScheduleCutoffHour');
      var closedEl = document.getElementById('bentoClosedDates');
      var envHint = document.getElementById('bentoSettingsEnvHint');
      if (!capEl) return;
      try {
        var cfg = await api('/admin/bento-settings');
        if (cfg && typeof cfg.dailyCapacityPacks === 'number') {
          capEl.value = String(cfg.dailyCapacityPacks);
        }
        if (blockEl) {
          blockEl.checked = Boolean(cfg && cfg.blockNewOrders);
        }
        if (launchEl) {
          launchEl.value = (cfg && cfg.earliestPickupDate) ? String(cfg.earliestPickupDate) : '';
        }
        if (leadEl && cfg && typeof cfg.minScheduleLeadDays === 'number') {
          leadEl.value = String(cfg.minScheduleLeadDays);
        }
        if (cutoffEl && cfg && typeof cfg.scheduleCutoffHour === 'number') {
          cutoffEl.value = String(cfg.scheduleCutoffHour);
        }
        if (closedEl && cfg && Array.isArray(cfg.closedDates)) {
          closedEl.value = cfg.closedDates.join('\\n');
        }
        if (envHint) {
          if (cfg && cfg.envOverride) {
            envHint.style.display = 'block';
            envHint.textContent = 'Note: BENTO_DAILY_CAPACITY_PACKS in the API environment overrides this file (' + cfg.effectiveDailyCapacityPacks + ' packs effective).';
          } else {
            envHint.style.display = 'none';
            envHint.textContent = '';
          }
        }
      } catch (e) {
        /* non-fatal */
      }
    }
    async function saveBentoSettings() {
      var out = document.getElementById('bentoSettingsSaveResult');
      var capEl = document.getElementById('bentoDailyCapacity');
      var blockEl = document.getElementById('bentoBlockNewOrders');
      var launchEl = document.getElementById('bentoEarliestPickupDate');
      var leadEl = document.getElementById('bentoMinScheduleLeadDays');
      var cutoffEl = document.getElementById('bentoScheduleCutoffHour');
      var closedEl = document.getElementById('bentoClosedDates');
      if (!capEl) return;
      if (out) out.textContent = 'Saving…';
      try {
        var n = parseInt(String(capEl.value), 10);
        if (!n || n < 1) throw new Error('Enter a capacity of at least 1 pack.');
        var leadDays = leadEl ? parseInt(String(leadEl.value), 10) : 1;
        if (!Number.isFinite(leadDays) || leadDays < 0) leadDays = 1;
        var cutoffHour = cutoffEl ? parseInt(String(cutoffEl.value), 10) : 18;
        if (!Number.isFinite(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) cutoffHour = 18;
        var closedDates = [];
        if (closedEl && closedEl.value) {
          closedDates = closedEl.value.split(/\\r?\\n/).map(function (line) {
            return line.trim();
          }).filter(Boolean);
        }
        var saved = await apiPut('/admin/bento-settings', {
          dailyCapacityPacks: n,
          blockNewOrders: blockEl ? blockEl.checked : false,
          earliestPickupDate: launchEl && launchEl.value.trim() ? launchEl.value.trim() : null,
          minScheduleLeadDays: leadDays,
          scheduleCutoffHour: cutoffHour,
          closedDates: closedDates,
        });
        if (out) out.textContent = 'Saved. Daily limit is ' + (saved.effectiveDailyCapacityPacks || n) + ' packs.' +
          (saved.blockNewOrders ? ' New orders are paused.' : '') +
          (saved.earliestPickupDate ? ' Earliest pickup: ' + saved.earliestPickupDate + '.' : '');
        await loadBentoSettings();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }

    // --- Member booking fix (phone lookup + activate stuck plans) ----------
    var bentoFixData = null; // last lookup payload, for the activate/schedule buttons
    function bentoFixDate(iso) {
      if (!iso) return '-';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleDateString();
    }
    function renderBentoFixResult(data) {
      var box = document.getElementById('bentoFixResult');
      if (!box) return;
      if (!data || !data.customer) { box.innerHTML = ''; return; }
      var c = data.customer;
      var subs = data.subscriptions || [];
      var head = '<div style="margin-bottom:10px">'
        + '<strong>' + bentoEsc(c.displayName || '(no name)') + '</strong> · ' + bentoEsc(c.phoneE164)
        + ' · member ' + statusPill(c.status)
        + (c.kitchenPickupCode ? ' · pickup code ' + bentoEsc(c.kitchenPickupCode) : '')
        + '</div>';
      if (!subs.length) {
        box.innerHTML = head + '<p class="field-hint">No bento plans found for this member.</p>';
        return;
      }
      var rows = subs.map(function (s) {
        var note = s.blockedByPayment
          ? '<span class="pill warn">Blocks scheduling</span>'
          : (s.needsScheduling ? '<span class="pill neutral">Awaiting pickup days</span>' : '');
        var action;
        if (s.status === 'PENDING_PAYMENT') {
          action = '<button type="button" class="btn-primary bento-fix-activate" data-id="' + bentoEsc(s.id) + '">Activate</button> '
            + '<button type="button" class="btn-outline bento-fix-cancel" data-id="' + bentoEsc(s.id) + '">Cancel</button>';
        } else if (s.status === 'ACTIVE') {
          action = '<button type="button" class="btn-primary bento-fix-schedule" data-id="' + bentoEsc(s.id) + '">'
            + (s.scheduledCount > 0 ? 'Edit schedule' : 'Schedule') + '</button>';
        } else {
          action = '<span class="muted-hint">—</span>';
        }
        return '<tr>'
          + '<td>' + bentoEsc((s.package && s.package.label) || '-') + '</td>'
          + '<td>' + statusPill(s.status) + ' ' + note + '</td>'
          + '<td>' + bentoEsc(s.mealOption) + '</td>'
          + '<td>' + bentoEsc(s.mealCreditsTotal) + '</td>'
          + '<td>' + bentoEsc(s.scheduledCount) + '</td>'
          + '<td>RM' + ((s.totalCents || 0) / 100).toFixed(2) + '</td>'
          + '<td>' + bentoFixDate(s.createdAt) + '</td>'
          + '<td style="white-space:nowrap">' + action + '</td>'
          + '</tr>';
      }).join('');
      box.innerHTML = head
        + '<div class="table-wrap"><table class="data"><thead><tr>'
        + '<th>Plan</th><th>Status</th><th>Meals</th><th>Credits</th><th>Scheduled</th><th>Paid</th><th>Created</th><th>Action</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    async function bentoFixSearch() {
      var input = document.getElementById('bentoFixPhone');
      var msg = document.getElementById('bentoFixMsg');
      var phone = input ? input.value.trim() : '';
      if (!phone) { if (msg) msg.textContent = 'Enter a phone number.'; return; }
      if (msg) msg.textContent = 'Searching…';
      try {
        var data = await api('/admin/reports/bento/customer-lookup?phone=' + encodeURIComponent(phone));
        bentoFixData = data;
        if (msg) msg.textContent = '';
        renderBentoFixResult(data);
      } catch (e) {
        bentoFixData = null;
        renderBentoFixResult(null);
        if (msg) msg.textContent = (e && e.message) ? e.message : String(e);
      }
    }
    function bentoFixOpenSchedule(id) {
      if (!bentoFixData || !bentoFixData.customer) return;
      var s = (bentoFixData.subscriptions || []).filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      var c = bentoFixData.customer;
      var name = (c.displayName && c.displayName.trim()) || c.phoneE164 || 'this member';
      bentoOpenSchedModal({
        subscriptionId: s.id,
        customerName: name,
        mealOption: s.mealOption,
        mealOptionCode: s.mealOption,
        packageLabel: (s.package && s.package.label) || '-',
        mealCredits: s.mealCreditsTotal,
        lunchCredits: s.lunchCredits,
        dinnerCredits: s.dinnerCredits,
        deliveries: s.deliveries,
        onScheduled: function (count) {
          var msg = document.getElementById('bentoFixMsg');
          if (msg) msg.textContent = 'Scheduled ' + count + ' pickup day(s) for ' + name + '.';
          bentoFixSearch();
        },
      });
    }
    function activateBentoSub(id, reason) {
      var body = {};
      if (reason) body.reason = reason;
      return apiPost('/admin/reports/bento-subscriptions/' + encodeURIComponent(id) + '/activate', body);
    }
    async function bentoFixActivate(btn) {
      var id = btn.getAttribute('data-id');
      if (!id) return;
      var msg = document.getElementById('bentoFixMsg');
      var orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Activating…';
      try {
        await activateBentoSub(id, undefined);
        if (msg) msg.textContent = 'Payment confirmed with Xendit — plan activated. The member can now schedule.';
        await bentoFixSearch();
      } catch (e) {
        var m = (e && e.message) ? e.message : String(e);
        // Xendit couldn't confirm the payment → offer a manual force with a reason.
        if (m.indexOf('BENTO_ACTIVATION_REASON_REQUIRED') !== -1 || m.indexOf('did not confirm') !== -1) {
          var reason = window.prompt('Xendit could not confirm this payment. Enter a reason to force-activate (recorded in the audit log):', '');
          if (reason === null || !String(reason).trim()) {
            btn.disabled = false; btn.textContent = orig;
            if (msg) msg.textContent = 'Activation cancelled.';
            return;
          }
          try {
            await activateBentoSub(id, String(reason).trim());
            if (msg) msg.textContent = 'Plan force-activated. The member can now schedule.';
            await bentoFixSearch();
          } catch (e2) {
            btn.disabled = false; btn.textContent = orig;
            if (msg) msg.textContent = (e2 && e2.message) ? e2.message : String(e2);
          }
          return;
        }
        btn.disabled = false; btn.textContent = orig;
        if (msg) msg.textContent = m;
      }
    }
    async function bentoFixCancel(btn) {
      var id = btn.getAttribute('data-id');
      if (!id) return;
      if (!window.confirm('Cancel this unpaid plan? Use this only for abandoned/duplicate checkout attempts — it does not refund a paid plan.')) return;
      var msg = document.getElementById('bentoFixMsg');
      var orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Cancelling…';
      try {
        await apiPost('/admin/reports/bento-subscriptions/' + encodeURIComponent(id) + '/cancel', {});
        if (msg) msg.textContent = 'Cancelled the unpaid plan.';
        await bentoFixSearch();
      } catch (e) {
        btn.disabled = false; btn.textContent = orig;
        if (msg) msg.textContent = (e && e.message) ? e.message : String(e);
      }
    }

    async function saveBentoMenu() {
      var out = document.getElementById('bentoMenuSaveResult');
      if (out) out.textContent = 'Saving…';
      try {
        var saved = await apiPut('/admin/bento-menu?week=' + bentoMenuWeek, collectBentoMenu());
        lastBentoMenu = (saved && Array.isArray(saved.weekdays)) ? saved.weekdays : [];
        if (bentoMenuImportCache) delete bentoMenuImportCache[bentoMenuWeek];
        renderBentoMenu();
        if (out) {
          out.textContent = 'Saved ' + bentoMenuWeekName(bentoMenuWeek) +
            '. Live in the Bento app menu' + (bentoMenuWeek === 0 ? ' and schedule calendar.' : '.');
        }
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }

    function bentoOrdersIsoDateUtc(d) {
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }
    function bentoOrdersInitDates() {
      var fromEl = document.getElementById('bentoOrdersFrom');
      var toEl = document.getElementById('bentoOrdersTo');
      if (!fromEl || !toEl || (fromEl.value && toEl.value)) return;
      var now = new Date();
      var day = now.getUTCDay();
      var diff = day === 0 ? -6 : 1 - day;
      var mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
      var end = new Date(mon.getTime() + (8 * 7 - 1) * 86400000);
      fromEl.value = bentoOrdersIsoDateUtc(mon);
      toEl.value = bentoOrdersIsoDateUtc(end);
    }
    function bentoOrdersQueryString(extra) {
      var fromEl = document.getElementById('bentoOrdersFrom');
      var toEl = document.getElementById('bentoOrdersTo');
      var parts = [];
      if (fromEl && fromEl.value) parts.push('from=' + encodeURIComponent(fromEl.value));
      if (toEl && toEl.value) parts.push('to=' + encodeURIComponent(toEl.value));
      if (extra) parts.push(extra);
      return parts.length ? '?' + parts.join('&') : '';
    }
    function bentoEsc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function bentoWaDigits(phone) {
      return String(phone || '').replace(/[^0-9]/g, '');
    }
    function bentoWaMessage(name) {
      var who = (name && name !== '—') ? (' ' + name) : '';
      return 'Hi' + who + ', this is Moja Maison. Thanks for your bento order! '
        + 'We noticed you haven\\u2019t picked your pickup day(s) yet. '
        + 'Please log in to the member app and schedule your meals so we can prepare them for you. Thank you!';
    }
    // Holds the latest awaiting-schedule list for selection + copy.
    var bentoAwaitRows = [];

    function renderBentoScheduled(kitchen, daily) {
      var host = document.getElementById('bentoOrdersScheduled');
      if (!host) return;
      var list = Array.isArray(kitchen) ? kitchen : [];
      if (!list.length) {
        host.innerHTML = '<p class="muted-hint" style="padding:8px 0">No scheduled pickups in this range.</p>';
        return;
      }
      // Group rows by date (kitchen array is already ordered by date).
      var groups = [];
      var byDate = {};
      list.forEach(function (r) {
        if (!byDate[r.date]) {
          byDate[r.date] = { date: r.date, weekday: r.weekday, rows: [] };
          groups.push(byDate[r.date]);
        }
        byDate[r.date].rows.push(r);
      });
      var dailyByDate = {};
      (Array.isArray(daily) ? daily : []).forEach(function (d) { dailyByDate[d.date] = d; });

      host.innerHTML = groups.map(function (g) {
        var d = dailyByDate[g.date] || {};
        var counts = 'Lunch ' + (d.lunchSets || 0) + ' · Dinner ' + (d.dinnerSets || 0) + ' · Total ' + (d.totalSets || g.rows.length);
        var rowsHtml = g.rows.map(function (r) {
          var dietCls = r.diet === 'Vegetarian' ? ' style="color:#15803d;font-weight:600"' : '';
          var qtyTxt = (r.qty && r.qty > 1) ? ('×' + r.qty) : '1';
          return '<tr>'
            + '<td><strong>' + bentoEsc(r.customerName) + '</strong></td>'
            + '<td>' + bentoEsc(r.phoneE164) + '</td>'
            + '<td>' + bentoEsc(r.pickupId) + '</td>'
            + '<td>' + bentoEsc(r.meal) + '</td>'
            + '<td style="text-align:center;font-weight:600">' + bentoEsc(qtyTxt) + '</td>'
            + '<td' + dietCls + '>' + bentoEsc(r.diet) + '</td>'
            + '<td>' + bentoEsc(r.riceType) + '</td>'
            + '<td>' + bentoEsc(r.packageLabel) + '</td>'
            + '</tr>';
        }).join('');
        return '<div class="bento-date-group">'
          + '<div class="bento-date-group-head"><span class="bento-date-group-title">' + bentoEsc(g.weekday) + ' · ' + bentoEsc(g.date) + '</span>'
          + '<span class="bento-date-group-counts">' + counts + '</span></div>'
          + '<div class="table-wrap"><table class="data"><thead><tr>'
          + '<th>Customer</th><th>Phone</th><th>Pickup ID</th><th>Meal</th><th>Qty</th><th>Diet</th><th>Rice</th><th>Package</th>'
          + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div></div>';
      }).join('');
    }

    function bentoAwaitSelectedRows() {
      var boxes = document.querySelectorAll('#bentoAwaitBody input.bento-await-cb:checked');
      var out = [];
      boxes.forEach(function (b) {
        var i = parseInt(b.getAttribute('data-i'), 10);
        if (!isNaN(i) && bentoAwaitRows[i]) out.push(bentoAwaitRows[i]);
      });
      return out;
    }
    function bentoAwaitSyncButtons() {
      var n = bentoAwaitSelectedRows().length;
      var wa = document.getElementById('bentoAwaitCopyWa');
      var ph = document.getElementById('bentoAwaitCopyPhones');
      if (wa) wa.disabled = n === 0;
      if (ph) ph.disabled = n === 0;
    }
    function renderBentoAwaiting(rows) {
      bentoAwaitRows = Array.isArray(rows) ? rows : [];
      var body = document.getElementById('bentoAwaitBody');
      var count = document.getElementById('bentoAwaitCount');
      var selAll = document.getElementById('bentoAwaitSelectAll');
      if (count) count.textContent = String(bentoAwaitRows.length);
      if (selAll) selAll.checked = false;
      if (!body) return;
      if (!bentoAwaitRows.length) {
        body.innerHTML = '<tr><td colspan="9" class="muted-hint">🎉 Everyone with an active plan has scheduled their pickup.</td></tr>';
        bentoAwaitSyncButtons();
        return;
      }
      body.innerHTML = bentoAwaitRows.map(function (r, i) {
        return '<tr>'
          + '<td><input type="checkbox" class="bento-await-cb" data-i="' + i + '" aria-label="Select ' + bentoEsc(r.customerName) + '" /></td>'
          + '<td><strong>' + bentoEsc(r.customerName) + '</strong></td>'
          + '<td>' + bentoEsc(r.phoneE164) + '</td>'
          + '<td>' + bentoEsc(r.pickupId) + '</td>'
          + '<td>' + bentoEsc(r.packageLabel) + '</td>'
          + '<td>' + bentoEsc(r.mealOption) + '</td>'
          + '<td>' + bentoEsc(r.mealCredits) + '</td>'
          + '<td>' + bentoEsc(r.purchasedAt) + '</td>'
          + '<td style="white-space:nowrap">'
          + '<button type="button" class="btn-primary bento-await-schedule" data-i="' + i + '">Schedule</button> '
          + '<button type="button" class="btn-outline bento-await-refund" data-id="' + bentoEsc(r.subscriptionId) + '" data-name="' + bentoEsc(r.customerName) + '">Mark refunded</button></td>'
          + '</tr>';
      }).join('');
      bentoAwaitSyncButtons();
    }
    async function bentoMarkRefunded(btn) {
      var id = btn.getAttribute('data-id');
      var name = btn.getAttribute('data-name') || 'this member';
      if (!id) return;
      if (!window.confirm('Mark ' + name + ' as refunded? This removes them from scheduling and the kitchen reports.')) return;
      var out = document.getElementById('bentoAwaitCopyResult');
      btn.disabled = true;
      btn.textContent = 'Refunding…';
      try {
        await apiPost('/admin/reports/bento-subscriptions/' + encodeURIComponent(id) + '/refund', {});
        // Drop the refunded member from the in-memory list and re-render.
        bentoAwaitRows = bentoAwaitRows.filter(function (r) { return r.subscriptionId !== id; });
        renderBentoAwaiting(bentoAwaitRows);
        if (out) out.textContent = 'Marked ' + name + ' as refunded and removed from scheduling.';
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Mark refunded';
        if (out) out.textContent = (e && e.message) ? e.message : String(e);
      }
    }

    // --- Schedule-for-customer modal -------------------------------------
    var bentoSchedSub = null; // the awaiting row currently being scheduled

    function bentoSchedTomorrowIso() {
      var d = new Date();
      d.setDate(d.getDate() + 1);
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    // Meal credits are a flexible pool — every plan can book lunch or dinner.
    function bentoSchedHasLunch() {
      return !!bentoSchedSub;
    }
    function bentoSchedHasDinner() {
      return !!bentoSchedSub;
    }
    // Mirrors the backend rule: a pickup day locks at 17:00 MYT (09:00 UTC)
    // the day before.
    function bentoSchedIsLocked(dateIso) {
      var m = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(dateIso || '');
      if (!m) return false;
      var deadline = Date.UTC(+m[1], +m[2] - 1, +m[3] - 1, 9, 0, 0);
      return Date.now() >= deadline;
    }
    // state: '' (editable), 'locked' (editable only with the override tick),
    // 'delivered' (never editable — shown so credit totals stay honest).
    function bentoSchedAddRow(dateIso, lunchQty, dinnerQty, state) {
      var host = document.getElementById('bentoSchedRows');
      if (!host) return;
      if (lunchQty === undefined) lunchQty = 1;
      if (dinnerQty === undefined) dinnerQty = 1;
      state = state || '';
      var qtyStyle = 'width:64px;text-align:center';
      var lunch = bentoSchedHasLunch()
        ? '<label style="display:flex;flex-direction:column;font-size:12px;color:#475569">Lunch'
          + '<input type="number" min="0" max="50" value="' + lunchQty + '" class="bento-sched-lunch" style="' + qtyStyle + '" /></label>'
        : '';
      var dinner = bentoSchedHasDinner()
        ? '<label style="display:flex;flex-direction:column;font-size:12px;color:#475569">Dinner'
          + '<input type="number" min="0" max="50" value="' + dinnerQty + '" class="bento-sched-dinner" style="' + qtyStyle + '" /></label>'
        : '';
      var tag = '';
      if (state === 'locked') tag = '<span class="bento-sched-tag" style="font-size:11px;color:#b45309;align-self:center;white-space:nowrap">🔒 Locked</span>';
      if (state === 'delivered') tag = '<span class="bento-sched-tag" style="font-size:11px;color:#64748b;align-self:center;white-space:nowrap">✓ Delivered</span>';
      if (state === 'skipped') tag = '<span class="bento-sched-tag" style="font-size:11px;color:#64748b;align-self:center;white-space:nowrap">Skipped</span>';
      var div = document.createElement('div');
      div.className = 'bento-sched-row';
      div.setAttribute('data-state', state);
      div.style.cssText = 'display:flex;gap:10px;align-items:flex-end;margin-bottom:8px';
      div.innerHTML = '<label style="flex:1;display:flex;flex-direction:column;font-size:12px;color:#475569">Pickup date'
        + '<input type="date" value="' + (dateIso || '') + '" class="bento-sched-date" /></label>'
        + lunch + dinner + tag
        + '<button type="button" class="btn-outline bento-sched-remove" aria-label="Remove day" style="padding:8px 12px">&times;</button>';
      host.appendChild(div);
      bentoSchedSyncLockedRows();
      bentoSchedUpdateTotals();
    }
    // Locked rows follow the override tick; delivered rows are always frozen.
    function bentoSchedSyncLockedRows() {
      var override = document.getElementById('bentoSchedOverrideLock');
      var unlocked = !!(override && override.checked);
      document.querySelectorAll('#bentoSchedRows .bento-sched-row').forEach(function (row) {
        var state = row.getAttribute('data-state');
        if (!state) return;
        var frozen = state !== 'locked' || !unlocked;
        row.querySelectorAll('input, button.bento-sched-remove').forEach(function (el) {
          el.disabled = frozen;
        });
        row.style.opacity = frozen ? '0.6' : '';
      });
    }
    function bentoSchedUpdateTotals() {
      var totals = document.getElementById('bentoSchedTotals');
      if (!totals || !bentoSchedSub) return;
      var lunch = 0, dinner = 0;
      document.querySelectorAll('#bentoSchedRows .bento-sched-row').forEach(function (row) {
        var l = row.querySelector('.bento-sched-lunch');
        var d = row.querySelector('.bento-sched-dinner');
        lunch += l ? Math.max(0, parseInt(l.value, 10) || 0) : 0;
        dinner += d ? Math.max(0, parseInt(d.value, 10) || 0) : 0;
      });
      // Credits are pooled: lunch + dinner combined against the plan total.
      var totalCredits = (bentoSchedSub.lunchCredits || 0) + (bentoSchedSub.dinnerCredits || 0);
      var used = lunch + dinner;
      var parts = ['Meals ' + used + ' / ' + totalCredits];
      if (used > 0) parts.push('(' + lunch + ' lunch · ' + dinner + ' dinner)');
      var over = used > totalCredits;
      totals.textContent = 'Allocated — ' + parts.join(' ') + (over ? '  (over plan credits)' : '');
      totals.style.color = over ? '#b91c1c' : '#475569';
    }
    function bentoOpenSchedModal(row) {
      bentoSchedSub = row;
      var info = document.getElementById('bentoSchedSubInfo');
      if (info) {
        info.textContent = row.customerName + ' · ' + row.packageLabel
          + ' · ' + row.mealCredits + ' meal credit(s) — lunch or dinner';
      }
      var result = document.getElementById('bentoSchedResult');
      if (result) { result.textContent = ''; }
      var override = document.getElementById('bentoSchedOverrideLock');
      if (override) { override.checked = false; }
      var host = document.getElementById('bentoSchedRows');
      if (host) { host.innerHTML = ''; }
      // Pre-fill the plan's existing pickup days so saving edits the schedule
      // instead of silently replacing it. Delivered days are shown frozen so
      // the credit totals stay honest; locked days need the override tick.
      var existing = Array.isArray(row.deliveries) ? row.deliveries : [];
      existing.forEach(function (d) {
        var iso = String(d.deliveryDate || '').slice(0, 10);
        if (!iso) return;
        var state = d.status === 'SCHEDULED'
          ? (bentoSchedIsLocked(iso) ? 'locked' : '')
          : (d.status === 'DELIVERED' ? 'delivered' : 'skipped');
        bentoSchedAddRow(iso, d.lunchQty || 0, d.dinnerQty || 0, state);
      });
      if (!existing.length) bentoSchedAddRow(bentoSchedTomorrowIso());
      document.getElementById('bentoSchedBackdrop').classList.remove('hidden');
      document.getElementById('bentoSchedModal').classList.remove('hidden');
    }
    function bentoCloseSchedModal() {
      document.getElementById('bentoSchedBackdrop').classList.add('hidden');
      document.getElementById('bentoSchedModal').classList.add('hidden');
      bentoSchedSub = null;
    }
    function bentoSchedCollectSlots() {
      var slots = [];
      var bad = false;
      document.querySelectorAll('#bentoSchedRows .bento-sched-row').forEach(function (row) {
        var dateEl = row.querySelector('.bento-sched-date');
        var date = dateEl ? dateEl.value : '';
        var l = row.querySelector('.bento-sched-lunch');
        var d = row.querySelector('.bento-sched-dinner');
        var lunchQty = l ? Math.max(0, parseInt(l.value, 10) || 0) : 0;
        var dinnerQty = d ? Math.max(0, parseInt(d.value, 10) || 0) : 0;
        if (lunchQty <= 0 && dinnerQty <= 0) return; // skip empty rows
        if (!date) { bad = true; return; }
        slots.push({
          date: date,
          includeLunch: lunchQty > 0,
          includeDinner: dinnerQty > 0,
          lunchQty: lunchQty,
          dinnerQty: dinnerQty,
        });
      });
      return { slots: slots, bad: bad };
    }
    function bentoSchedFriendlyError(e) {
      var raw = (e && e.message) ? e.message : String(e);
      var brace = raw.indexOf('{');
      if (brace >= 0) {
        try {
          var parsed = JSON.parse(raw.slice(brace));
          if (parsed && parsed.message) return parsed.message;
        } catch (_) { /* fall through */ }
      }
      return raw;
    }
    async function bentoSchedSubmit() {
      if (!bentoSchedSub) return;
      var result = document.getElementById('bentoSchedResult');
      var saveBtn = document.getElementById('bentoSchedSave');
      var collected = bentoSchedCollectSlots();
      if (collected.bad) {
        if (result) { result.style.color = '#b91c1c'; result.textContent = 'Every pickup day with meals needs a date.'; }
        return;
      }
      if (!collected.slots.length) {
        if (result) { result.style.color = '#b91c1c'; result.textContent = 'Add at least one day with a lunch or dinner.'; }
        return;
      }
      var id = bentoSchedSub.subscriptionId;
      var name = bentoSchedSub.customerName;
      var onScheduled = bentoSchedSub.onScheduled;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
      if (result) { result.style.color = '#475569'; result.textContent = 'Saving…'; }
      var overrideEl = document.getElementById('bentoSchedOverrideLock');
      try {
        await apiPost('/admin/reports/bento-subscriptions/' + encodeURIComponent(id) + '/schedule', {
          slots: collected.slots,
          overrideLocked: !!(overrideEl && overrideEl.checked),
        });
        bentoCloseSchedModal();
        var out = document.getElementById('bentoAwaitCopyResult');
        if (out) out.textContent = 'Scheduled ' + collected.slots.length + ' pickup day(s) for ' + name + '.';
        // Refresh both the scheduled and awaiting tables.
        previewBentoOrders().catch(function () {});
        // Let the opener (e.g. the member booking fix card) react to success.
        if (typeof onScheduled === 'function') onScheduled(collected.slots.length, name);
      } catch (e) {
        if (result) { result.style.color = '#b91c1c'; result.textContent = bentoSchedFriendlyError(e); }
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save schedule'; }
      }
    }

    function bentoCopyText(text, okMsg) {
      var out = document.getElementById('bentoAwaitCopyResult');
      function done(ok) { if (out) out.textContent = ok ? okMsg : ('Copy failed. Text:\\n' + text); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () { done(false); });
      } else {
        done(false);
      }
    }
    function bentoCopyWaLinks() {
      var rows = bentoAwaitSelectedRows();
      if (!rows.length) return;
      var lines = rows.map(function (r) {
        var link = 'https://wa.me/' + bentoWaDigits(r.phoneE164) + '?text=' + encodeURIComponent(bentoWaMessage(r.customerName));
        return r.customerName + ' (' + r.phoneE164 + '): ' + link;
      });
      bentoCopyText(lines.join('\\n'), 'Copied ' + rows.length + ' WhatsApp link(s) to clipboard.');
    }
    function bentoCopyPhones() {
      var rows = bentoAwaitSelectedRows();
      if (!rows.length) return;
      var nums = rows.map(function (r) { return r.phoneE164; });
      bentoCopyText(nums.join('\\n'), 'Copied ' + rows.length + ' phone number(s) to clipboard.');
    }

    async function previewBentoOrders() {
      var out = document.getElementById('bentoOrdersExportResult');
      var summary = document.getElementById('bentoOrdersSummary');
      if (out) out.textContent = 'Loading…';
      try {
        bentoOrdersInitDates();
        var data = await api('/admin/reports/bento-meal-orders' + bentoOrdersQueryString());
        var daily = (data && Array.isArray(data.daily)) ? data.daily : [];
        var kitchen = (data && Array.isArray(data.kitchen)) ? data.kitchen : [];
        var awaiting = (data && Array.isArray(data.awaitingSchedule)) ? data.awaitingSchedule : [];
        var totalSets = daily.reduce(function (a, d) { return a + (d.totalSets || 0); }, 0);
        var totalLunch = daily.reduce(function (a, d) { return a + (d.lunchSets || 0); }, 0);
        var totalDinner = daily.reduce(function (a, d) { return a + (d.dinnerSets || 0); }, 0);
        var pickupDays = daily.filter(function (d) { return (d.totalSets || 0) > 0; }).length;
        if (summary) {
          summary.style.display = '';
          summary.innerHTML = ''
            + '<div class="bento-stat"><span class="bento-stat-num">' + totalSets + '</span><span class="bento-stat-lbl">Total sets</span></div>'
            + '<div class="bento-stat"><span class="bento-stat-num">' + totalLunch + '</span><span class="bento-stat-lbl">Lunch</span></div>'
            + '<div class="bento-stat"><span class="bento-stat-num">' + totalDinner + '</span><span class="bento-stat-lbl">Dinner</span></div>'
            + '<div class="bento-stat"><span class="bento-stat-num">' + pickupDays + '</span><span class="bento-stat-lbl">Pickup days</span></div>'
            + '<div class="bento-stat bento-stat-warn"><span class="bento-stat-num">' + awaiting.length + '</span><span class="bento-stat-lbl">Awaiting schedule</span></div>';
        }
        renderBentoScheduled(kitchen, daily);
        renderBentoAwaiting(awaiting);
        if (out) out.textContent = 'Loaded · ' + (data.from || '') + ' to ' + (data.to || '');
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function exportBentoOrdersExcel() {
      var out = document.getElementById('bentoOrdersExportResult');
      if (out) out.textContent = 'Preparing Excel…';
      try {
        bentoOrdersInitDates();
        await apiDownload('/admin/reports/bento-meal-orders' + bentoOrdersQueryString('format=xlsx'), 'bento-meal-orders.xlsx');
        if (out) out.textContent = 'Excel downloaded.';
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }

    // --- Bento overview (member funnel) + dedicated sales views ---
    function bentoIsoDateUtc(d) {
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }
    function bentoRangeInit(prefix) {
      var fromEl = document.getElementById(prefix + 'From');
      var toEl = document.getElementById(prefix + 'To');
      if (!fromEl || !toEl || (fromEl.value && toEl.value)) return;
      var t = new Date();
      var end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      var start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 29);
      fromEl.value = bentoIsoDateUtc(start);
      toEl.value = bentoIsoDateUtc(end);
    }
    function bentoRangePreset(prefix, kind) {
      var fromEl = document.getElementById(prefix + 'From');
      var toEl = document.getElementById(prefix + 'To');
      if (!fromEl || !toEl) return;
      var t = new Date();
      var end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      var start;
      if (kind === 'mtd') {
        start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
      } else {
        start = new Date(end);
        start.setUTCDate(start.getUTCDate() - (kind - 1));
      }
      fromEl.value = bentoIsoDateUtc(start);
      toEl.value = bentoIsoDateUtc(end);
    }
    function bentoRangeQuery(prefix) {
      var fromEl = document.getElementById(prefix + 'From');
      var toEl = document.getElementById(prefix + 'To');
      var bucketEl = document.getElementById(prefix + 'Bucket');
      if (!fromEl || !toEl || !fromEl.value || !toEl.value) return null;
      var fromIso = fromEl.value + 'T00:00:00.000Z';
      var toEnd = new Date(toEl.value + 'T00:00:00.000Z');
      toEnd.setUTCDate(toEnd.getUTCDate() + 1);
      var bucket = bucketEl ? bucketEl.value : 'month';
      return 'from=' + encodeURIComponent(fromIso) + '&to=' + encodeURIComponent(toEnd.toISOString()) + '&bucket=' + encodeURIComponent(bucket);
    }
    function bentoFmtPeriod(iso) {
      return iso ? String(iso).slice(0, 10) : '-';
    }
    function bentoFmtDateTime(iso) {
      if (!iso) return '-';
      var s = String(iso);
      return s.slice(0, 10) + ' ' + s.slice(11, 16);
    }
    function bentoFunnelRow(label, value, pctWidth, color) {
      var w = Math.max(0, Math.min(100, pctWidth));
      return '<div style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>' + label + '</span><strong>' + Number(value || 0).toLocaleString() + '</strong></div>' +
        '<div style="background:#e5e9f0;border-radius:6px;height:22px;overflow:hidden"><div style="width:' + w + '%;height:100%;background:' + color + ';transition:width .3s"></div></div>' +
        '</div>';
    }
    async function loadBentoOverview() {
      bentoRangeInit('bo');
      var q = bentoRangeQuery('bo');
      var hint = document.getElementById('boFunnelHint');
      if (!q) { if (hint) hint.textContent = 'Set from and to dates, then Apply.'; return; }
      if (hint) hint.textContent = 'Loading…';
      try {
        var data = await api('/admin/reports/bento/overview?' + q);
        var t = data.totals || {};
        var r = data.inRange || {};
        var total = Number(t.totalMembers) || 0;
        var paid = Number(t.paidMembers) || 0;
        document.getElementById('boValMembers').textContent = Number(total).toLocaleString();
        document.getElementById('boValPaid').textContent = Number(paid).toLocaleString();
        document.getElementById('boValConv').textContent = ((t.conversionRate || 0) * 100).toFixed(1) + '%';
        document.getElementById('boValGmv').textContent = 'RM ' + moneyFromCents(t.totalGmvCents);
        document.getElementById('boNewMembers').textContent = fmt(r.newMembers);
        document.getElementById('boNewPaid').textContent = fmt(r.newPaidMembers);
        document.getElementById('boPayTxns').textContent = fmt(t.payingTransactions);
        var bar = document.getElementById('boFunnelBar');
        if (bar) {
          bar.innerHTML =
            bentoFunnelRow('Registered members', total, 100, '#3b82f6') +
            bentoFunnelRow('Paid members', paid, total > 0 ? (paid / total) * 100 : 0, '#059669');
        }
        var sb = document.getElementById('boSeriesBody');
        var rows = (data.series || []).map(function (s) {
          return '<tr><td>' + bentoFmtPeriod(s.periodStart) + '</td><td>' + fmt(s.registrations) + '</td><td>' + fmt(s.payments) + '</td><td>' + moneyFromCents(s.gmvCents) + '</td></tr>';
        });
        if (sb) sb.innerHTML = rows.join('') || '<tr><td colspan="4" class="muted-hint">No activity in this range.</td></tr>';
        if (hint) hint.textContent = paid.toLocaleString() + ' of ' + total.toLocaleString() + ' members paid (' + ((t.conversionRate || 0) * 100).toFixed(1) + '% conversion).';
        statusPanel.textContent = 'Bento overview updated.';
      } catch (e) {
        if (hint) hint.textContent = e.message || String(e);
        statusPanel.textContent = e.message || String(e);
      }
    }
    async function loadBentoSales() {
      bentoRangeInit('bs');
      var q = bentoRangeQuery('bs');
      var hint = document.getElementById('bsTxnHint');
      if (!q) { if (hint) hint.textContent = 'Set from and to dates, then Apply.'; return; }
      if (hint) hint.textContent = 'Loading…';
      loadBentoPickupProgress();
      try {
        var data = await api('/admin/reports/sales-analytics?category=bento&' + q);
        var sum = data.summary || {};
        document.getElementById('bsValGmv').textContent = 'RM ' + moneyFromCents(sum.totalGmvCents);
        document.getElementById('bsValOrders').textContent = fmt(sum.completedOrders);
        document.getElementById('bsValAov').textContent = 'RM ' + moneyFromCents(sum.averageOrderValueCents);
        var sb = document.getElementById('bsSeriesBody');
        var srows = (data.series || []).map(function (s) {
          return '<tr><td>' + bentoFmtPeriod(s.periodStart) + '</td><td>' + fmt(s.orderCount) + '</td><td>' + moneyFromCents(s.gmvCents) + '</td></tr>';
        });
        if (sb) sb.innerHTML = srows.join('') || '<tr><td colspan="3" class="muted-hint">No bento sales in this range.</td></tr>';
        var tb = document.getElementById('bsTopBody');
        var trows = (data.topProducts || []).map(function (p) {
          return '<tr><td>' + bpAttr(p.name) + '</td><td><code style="font-size:11px">' + fmt(p.productId) + '</code></td><td>' + fmt(p.qtySold) + '</td><td>' + moneyFromCents(p.revenueCents) + '</td><td>' + fmt(p.orders) + '</td></tr>';
        });
        if (tb) tb.innerHTML = trows.join('') || '<tr><td colspan="5" class="muted-hint">No package sales in this range.</td></tr>';
        var txn = await api('/admin/reports/bento/transactions?' + q);
        var list = (txn && Array.isArray(txn.transactions)) ? txn.transactions : [];
        var xb = document.getElementById('bsTxnBody');
        var xrows = list.map(function (x) {
          var voucherCell = x.voucherCode
            ? '<code style="font-size:11px">' + bpAttr(x.voucherCode) + '</code>'
              + (x.voucherDiscountCents ? '<br><span class="field-hint" style="margin:0">−' + moneyFromCents(x.voucherDiscountCents) + '</span>' : '')
            : '—';
          return '<tr><td>' + bentoFmtDateTime(x.paidAt) + '</td><td>' + bpAttr(x.customerName || '—') + '</td><td>' + fmt(x.customerPhone) + '</td><td>' + bpAttr(x.packageLabel || x.packageCode || '—') + '</td><td>' + fmt(x.mealOption) + '</td><td>' + voucherCell + '</td><td>' + moneyFromCents(x.amountCents) + '</td></tr>';
        });
        if (xb) xb.innerHTML = xrows.join('') || '<tr><td colspan="7" class="muted-hint">No transactions in this range.</td></tr>';
        if (hint) hint.textContent = list.length + ' shown (latest 100)';
        statusPanel.textContent = 'Bento sales updated.';
      } catch (e) {
        if (hint) hint.textContent = e.message || String(e);
        statusPanel.textContent = e.message || String(e);
      }
    }

    var bsProgressRows = [];
    function renderBentoPickupProgress() {
      var body = document.getElementById('bsProgressBody');
      var hint = document.getElementById('bsProgressHint');
      if (!body) return;
      var search = document.getElementById('bsProgressSearch');
      var needle = search && search.value ? search.value.trim().toLowerCase() : '';
      var showArchivedEl = document.getElementById('bsProgressShowArchived');
      var showArchived = !!(showArchivedEl && showArchivedEl.checked);
      var archivedCount = bsProgressRows.filter(function (r) { return r.hiddenAt; }).length;
      var rows = bsProgressRows.filter(function (r) {
        if (!showArchived && r.hiddenAt) return false;
        if (!needle) return true;
        return ((r.customerName || '') + ' ' + (r.customerPhone || '')).toLowerCase().indexOf(needle) !== -1;
      });
      var html = rows.map(function (r) {
        var statusBadge = r.status === 'ACTIVE'
          ? '<span class="pill ok">Active</span>'
          : '<span class="pill neutral">' + bpAttr(r.status) + '</span>';
        if (r.hiddenAt) statusBadge += ' <span class="pill neutral">Archived</span>';
        var left = Number(r.remainingMeals) || 0;
        var leftCell = left > 0 ? '<strong>' + left + '</strong>' : '<span class="field-hint" style="margin:0">0 · done</span>';
        // Validity countdown: package window counted from purchase day.
        var daysLeftCell;
        var daysLeft = (r.daysLeft == null) ? null : Number(r.daysLeft);
        if (daysLeft == null) {
          daysLeftCell = '—';
        } else if (r.status !== 'ACTIVE' || left <= 0) {
          daysLeftCell = '<span class="field-hint" style="margin:0">—</span>';
        } else if (daysLeft <= 0) {
          daysLeftCell = '<span class="pill warn" title="Validity window used up (' + bpAttr(r.durationDays) + ' days from purchase)">0d · expired</span>';
        } else {
          var daysPill = daysLeft <= 7 ? '<span class="pill warn">' + daysLeft + 'd</span>' : '<strong>' + daysLeft + 'd</strong>';
          daysLeftCell = daysPill + ' <span class="field-hint" style="margin:0" title="Valid until ' + bpAttr(r.validUntil || '') + '">of ' + bpAttr(r.durationDays) + 'd</span>';
        }
        var actionBtn = r.hiddenAt
          ? '<button type="button" class="btn-outline bs-progress-restore" data-id="' + bpAttr(r.subscriptionId) + '" data-name="' + bpAttr(r.customerName || r.customerPhone || 'this plan') + '">Restore</button>'
          : '<button type="button" class="btn-outline bs-progress-archive" data-id="' + bpAttr(r.subscriptionId) + '" data-name="' + bpAttr(r.customerName || r.customerPhone || 'this plan') + '">Archive</button>';
        return '<tr' + (r.hiddenAt ? ' style="opacity:.55"' : '') + '>' +
          '<td>' + bpAttr(r.customerName || '—') + '</td>' +
          '<td>' + fmt(r.customerPhone) + '</td>' +
          '<td>' + bpAttr(r.packageLabel || r.packageCode || '—') + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td>' + fmt(r.mealCreditsTotal) + '</td>' +
          '<td>' + fmt(r.collectedMeals) + '</td>' +
          '<td>' + fmt(r.scheduledMeals) + '</td>' +
          '<td>' + fmt(r.unscheduledMeals) + '</td>' +
          '<td>' + leftCell + '</td>' +
          '<td style="white-space:nowrap">' + daysLeftCell + '</td>' +
          '<td style="white-space:nowrap">' + actionBtn + '</td>' +
          '</tr>';
      });
      body.innerHTML = html.join('') || '<tr><td colspan="11" class="muted-hint">' + (needle ? 'No plans match the filter.' : 'No paid bento plans yet.') + '</td></tr>';
      if (hint) {
        hint.textContent = rows.length + ' plan(s)' + (needle ? ' matching' : '') +
          (archivedCount && !showArchived ? ' · ' + archivedCount + ' archived' : '');
      }
    }
    async function bsProgressSetHidden(btn, hidden) {
      var id = btn.getAttribute('data-id');
      var name = btn.getAttribute('data-name') || 'this plan';
      if (!id) return;
      if (hidden && !window.confirm('Archive the plan for ' + name + '? It only disappears from this report — the plan and its pickup history stay intact, and you can restore it via "Show archived".')) return;
      btn.disabled = true;
      btn.textContent = hidden ? 'Archiving…' : 'Restoring…';
      try {
        var res = await apiPost('/admin/reports/bento-subscriptions/' + encodeURIComponent(id) + '/progress-hidden', { hidden: hidden });
        bsProgressRows.forEach(function (r) {
          if (r.subscriptionId === id) r.hiddenAt = res.hiddenAt;
        });
        renderBentoPickupProgress();
        statusPanel.textContent = (hidden ? 'Archived ' : 'Restored ') + name + ' on pickup progress.';
      } catch (e) {
        btn.disabled = false;
        btn.textContent = hidden ? 'Archive' : 'Restore';
        statusPanel.textContent = (e && e.message) ? e.message : String(e);
      }
    }
    async function loadBentoPickupProgress() {
      var body = document.getElementById('bsProgressBody');
      try {
        var data = await api('/admin/reports/bento/pickup-progress');
        bsProgressRows = (data && Array.isArray(data.rows)) ? data.rows : [];
        renderBentoPickupProgress();
      } catch (e) {
        if (body) body.innerHTML = '<tr><td colspan="11" class="muted-hint">' + bpAttr(e.message || String(e)) + '</td></tr>';
      }
    }

    async function downloadBentoMenuTemplate() {
      var out = document.getElementById('bentoMenuImportResult');
      if (out) out.textContent = 'Preparing 4-week template…';
      try {
        await apiDownload('/admin/bento-menu/template', 'bento-menu-4-weeks.xlsx');
        if (out) {
          out.textContent = 'Template downloaded (Week 1–4 sheets). Edit each tab, then Import file.';
        }
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function importBentoMenuFile(file) {
      var out = document.getElementById('bentoMenuImportResult');
      if (!file) return;
      if (out) out.textContent = 'Reading ' + (file.name || 'file') + '…';
      try {
        var headers = { ...getAuthHeaders() };
        delete headers['Content-Type'];
        var fd = new FormData();
        fd.append('file', file);
        var res = await fetch(
          '/admin/bento-menu/import?week=' + bentoMenuWeek,
          { method: 'POST', headers, body: fd },
        );
        if (!res.ok) {
          var txt = await res.text();
          throw new Error('Import failed (' + res.status + '): ' + txt);
        }
        var data = await res.json();
        if (data && Array.isArray(data.weeks) && data.weeks.length > 0) {
          bentoMenuImportCache = bentoMenuImportCache || {};
          data.weeks.forEach(function (w) {
            bentoMenuImportCache[w.weekIndex] = w.weekdays || [];
            if (w.weekStart && w.weekEnd) {
              bentoMenuWeekRange[w.weekIndex] = bentoMenuFmtRange(w.weekStart, w.weekEnd);
            }
          });
          lastBentoMenu = bentoMenuImportCache[bentoMenuWeek] || [];
          renderBentoMenu();
          renderBentoMenuWeekTabs();
          var names = data.weeks.map(function (w) { return bentoMenuWeekName(w.weekIndex); }).join(', ');
          if (out) {
            out.textContent = 'Loaded ' + names + ' from ' + (file.name || 'file') +
              '. Review each week tab, then Save menu to publish.';
          }
          return;
        }
        lastBentoMenu = (data && Array.isArray(data.weekdays)) ? data.weekdays : [];
        renderBentoMenu();
        if (out) {
          out.textContent = 'Loaded ' + lastBentoMenu.length + ' day(s). Review the table, then Save menu.';
        }
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }

    async function exportCustomersCsv() {
      // Export honors the same search/filter/sort as the on-screen list.
      var params = buildCustomerFilterParams();
      await apiDownload(
        '/admin/customers/export?' + params.join('&'),
        'customers.csv',
      );
    }

    async function loadReportingSettings() {
      var inp = document.getElementById('reportingStartDate');
      var out = document.getElementById('reportingSaveResult');
      if (!inp) return;
      try {
        var cfg = await api('/admin/reporting-settings');
        inp.value = (cfg && cfg.salesStartDate) ? cfg.salesStartDate : '';
        if (out) out.textContent = inp.value
          ? ('Charges before ' + inp.value + ' are hidden from all sales reports.')
          : 'No cutoff set — full sales history is shown.';
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function saveReportingSettings(clear) {
      var inp = document.getElementById('reportingStartDate');
      var out = document.getElementById('reportingSaveResult');
      if (!inp) return;
      var val = clear ? null : (inp.value ? inp.value : null);
      if (out) out.textContent = 'Saving…';
      try {
        var saved = await apiPut('/admin/reporting-settings', { salesStartDate: val });
        inp.value = (saved && saved.salesStartDate) ? saved.salesStartDate : '';
        if (out) out.textContent = inp.value
          ? ('Saved. Charges before ' + inp.value + ' are now hidden from all sales reports.')
          : 'Saved. Cutoff cleared — full sales history is shown.';
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }

    function demoModeStatusText(state) {
      var source = state.override !== null ? 'admin override' : 'server .env default';
      return 'Currently ' + (state.effective ? 'ON' : 'OFF') + ' (' + source + ').';
    }
    async function loadDemoModeSetting() {
      var sel = document.getElementById('demoModeSelect');
      var out = document.getElementById('demoModeResult');
      if (!sel) return;
      try {
        var state = await api('/admin/payments/demo-mode');
        sel.value = state.override === null ? 'null' : String(state.override);
        if (out) out.textContent = demoModeStatusText(state);
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function saveDemoModeSetting() {
      var sel = document.getElementById('demoModeSelect');
      var out = document.getElementById('demoModeResult');
      if (!sel) return;
      var raw = sel.value;
      var enabled = raw === 'null' ? null : raw === 'true';
      if (out) out.textContent = 'Saving…';
      try {
        var state = await apiPut('/admin/payments/demo-mode', { enabled: enabled });
        sel.value = state.override === null ? 'null' : String(state.override);
        if (out) out.textContent = 'Saved. ' + demoModeStatusText(state);
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }

    var scTableState = { sortKey: null, sortDir: 'asc', filters: { name: '', category: '', price: '', sort: '', visible: '' } };
    function scPriceNumeric(p) {
      if (Array.isArray(p.variants) && p.variants.length) {
        var avail = p.variants.filter(function (v) { return v.available !== false && v.priceCents > 0; });
        if (avail.length) return Math.min.apply(null, avail.map(function (v) { return v.priceCents; }));
        return 0;
      }
      return p.basePriceCents || 0;
    }
    function scPriceText(p) {
      if (Array.isArray(p.variants) && p.variants.length) {
        return p.variants.map(function (v) {
          return (v.label || '') + ' ' + (v.priceDisplay || ('RM' + ((v.priceCents || 0) / 100).toFixed(2)));
        }).join(' ');
      }
      return 'RM' + ((p.basePriceCents || 0) / 100).toFixed(2) + ' ' + (p.priceDisplay || '');
    }
    function scSortValue(p, key) {
      if (key === 'name') return (p.name || '').toLowerCase();
      if (key === 'category') return (p.categoryLabel || p.category || '').toLowerCase();
      if (key === 'price') return scPriceNumeric(p);
      if (key === 'sort') return p.sortOrder != null ? p.sortOrder : 0;
      if (key === 'visible') return p.isActive ? 1 : 0;
      return '';
    }
    function scApplyFilterSort(list) {
      var f = scTableState.filters;
      var out = list.filter(function (p) {
        if (f.name && (p.name || '').toLowerCase().indexOf(f.name.toLowerCase()) === -1) return false;
        if (f.category && (p.categoryLabel || p.category || '').toLowerCase().indexOf(f.category.toLowerCase()) === -1) return false;
        if (f.price && scPriceText(p).toLowerCase().indexOf(f.price.toLowerCase()) === -1) return false;
        if (f.sort && String(p.sortOrder != null ? p.sortOrder : '').indexOf(f.sort) === -1) return false;
        if (f.visible === 'yes' && !p.isActive) return false;
        if (f.visible === 'no' && p.isActive) return false;
        return true;
      });
      if (scTableState.sortKey) {
        var key = scTableState.sortKey;
        var dir = scTableState.sortDir === 'desc' ? -1 : 1;
        out = out.slice().sort(function (a, b) {
          var av = scSortValue(a, key), bv = scSortValue(b, key);
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
          return 0;
        });
      }
      return out;
    }
    function scUpdateSortIndicators() {
      var inds = document.querySelectorAll('.sc-sort-ind');
      for (var i = 0; i < inds.length; i++) {
        var k = inds[i].getAttribute('data-ind');
        inds[i].textContent = (scTableState.sortKey === k)
          ? (scTableState.sortDir === 'desc' ? '▼' : '▲')
          : '';
      }
    }
    function scPopulateCategoryFilter() {
      var sel = document.getElementById('scFilterCategory');
      if (!sel) return;
      var current = sel.value;
      var cats = [];
      (lastShopCatalogProducts || []).forEach(function (p) {
        var c = p.categoryLabel || p.category || '';
        if (c && cats.indexOf(c) === -1) cats.push(c);
      });
      cats.sort();
      sel.innerHTML = '<option value="">All</option>' + cats.map(function (c) {
        return '<option value="' + fmt(c) + '">' + fmt(c) + '</option>';
      }).join('');
      if (current) sel.value = current;
    }
    async function loadShopCatalog() {
      const data = await api('/admin/shop-catalog/products');
      lastShopCatalogProducts = data || [];
      scPopulateCategoryFilter();
      renderShopCatalog();
      scLoadSalesplayCodes();
    }

    var scSalesplayCodesLoaded = false;
    /** Fills the SalesPlay-code datalist with codes seen on POS receipts (best-effort). */
    function scLoadSalesplayCodes() {
      if (scSalesplayCodesLoaded) return;
      scSalesplayCodesLoaded = true;
      api('/admin/shop-catalog/salesplay-codes').then(function (codes) {
        var dl = document.getElementById('scSalesplayCodesList');
        if (!dl || !Array.isArray(codes)) return;
        dl.innerHTML = codes.map(function (c) {
          var hint = (c.name ? c.name + ' — ' : '') + c.lineCount + ' receipt lines' + (c.mappedProductId ? ' (already mapped)' : '');
          return '<option value="' + fmt(c.code) + '" label="' + fmt(hint) + '"></option>';
        }).join('');
      }).catch(function () { scSalesplayCodesLoaded = false; });
    }
    function renderShopCatalog() {
      var body = document.getElementById('shopCatalogBody');
      if (!body) return;
      const editSvg ='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      const trashSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
      body.innerHTML = scApplyFilterSort(lastShopCatalogProducts || []).map(function (p) {
        var priceCell;
        if (Array.isArray(p.variants) && p.variants.length > 0) {
          priceCell = p.variants.map(function (v) {
            var lbl = fmt(v.label);
            var price = (v.available !== false && v.priceCents > 0)
              ? (v.priceDisplay && String(v.priceDisplay).trim() ? fmt(v.priceDisplay) : 'RM' + (v.priceCents / 100).toFixed(2))
              : '<span style="color:#94a3b8">unavailable</span>';
            return '<div style="white-space:nowrap"><span style="color:#64748b">' + lbl + ':</span> ' + price + '</div>';
          }).join('');
        } else {
          priceCell = slFormatPrice(p.basePriceCents, p.priceDisplay);
        }
        var lockBadge = (Array.isArray(p.syncOverrides) && p.syncOverrides.length > 0)
          ? ' <span title="Manual edits — protected from sync" style="background:#fef3c7;color:#92400e;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:6px">\uD83D\uDD12 EDITED</span>'
          : '';
        var hasSpCode = !!(p.salesplayProductCode || (p.salesplayVariantCodes && Object.keys(p.salesplayVariantCodes).length > 0));
        var posBadge = hasSpCode
          ? ' <span title="Mapped to a SalesPlay POS product" style="background:#dcfce7;color:#166534;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:6px">POS</span>'
          : ' <span title="No SalesPlay product code — in-store sales cannot be matched to this product in reports" style="background:#f1f5f9;color:#94a3b8;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:6px">NO POS</span>';
        return '<tr><td>' + fmt(p.name) + lockBadge + posBadge + '</td><td>' + fmt(p.categoryLabel || p.category) + '</td><td>' + priceCell + '</td><td>' + fmt(p.sortOrder) + '</td><td>' +
          (p.isActive ? statusPill('YES') : statusPill('NO')) + '</td><td class="td-actions"><button type="button" class="icon-btn sc-edit-btn" data-id="' + fmt(p.id) + '">' + editSvg + '</button> <button type="button" class="icon-btn sc-delete-btn" data-id="' + fmt(p.id) + '" data-name="' + fmt(p.name) + '" title="Delete product">' + trashSvg + '</button></td></tr>';
      }).join('') || '<tr><td colspan="6" class="muted-hint">No products match.</td></tr>';
      scUpdateSortIndicators();
    }

    var lastScSyncPreview = null;

    function scResolveShopAssetUrl(url) {
      if (!url) return '';
      if (/^https?:\\/\\//i.test(url) || /^data:/i.test(url)) return url;
      return SHOP_WEB_ORIGIN + (url.startsWith('/') ? '' : '/') + url;
    }

    function scSyncCollectBody() {
      return {
        mode: document.getElementById('scSyncMode').value || 'pricing_and_media',
        createMissing: document.getElementById('scSyncCreateMissing').checked,
        syncLayout: document.getElementById('scSyncLayout').checked,
        writeSeedConfig: document.getElementById('scSyncWriteSeed').checked,
      };
    }

    async function scRefreshSitesCatalogFileHint() {
      var hint = document.getElementById('scSitesCatalogFileHint');
      if (!hint) return;
      try {
        var info = await api('/admin/shop-catalog/sites-catalog/info');
        if (info && info.exists) {
          var when = info.mtime ? ' · updated ' + new Date(info.mtime).toLocaleString() : '';
          hint.innerHTML = '<span style="color:#059669;font-weight:600">Ready</span> — ' +
            fmt(info.productCount) + ' products at <code>' + fmt(info.path) + '</code>' + when;
        } else {
          hint.innerHTML = '<span style="color:#b45309;font-weight:600">Not on server yet</span> — upload <code>products.catalog.json</code> from moja-sites below, then run Preview sync.';
        }
      } catch (e) {
        hint.textContent = e.message;
      }
    }

    async function scSaveSitesCatalogFile() {
      var out = document.getElementById('scSitesCatalogSaveResult');
      var input = document.getElementById('scSitesCatalogFile');
      var file = input && input.files && input.files[0];
      if (!file) {
        if (out) out.textContent = 'Choose products.catalog.json first.';
        return;
      }
      if (out) out.textContent = 'Saving…';
      var headers = Object.assign({}, getAuthHeaders());
      delete headers['Content-Type'];
      var fd = new FormData();
      fd.append('file', file);
      var res = await fetch('/admin/shop-catalog/sites-catalog/file', {
        method: 'POST',
        headers: headers,
        body: fd,
      });
      if (!res.ok) {
        var txt = await res.text();
        throw new Error('Save failed (' + res.status + '): ' + txt);
      }
      var saved = await res.json();
      if (input) input.value = '';
      if (out) {
        out.textContent = 'Saved ' + fmt(saved.productCount) + ' products to server. You can now Preview sync.';
      }
      await scRefreshSitesCatalogFileHint();
    }

    function scSyncStatusPill(status) {
      if (status === 'create') return statusPill('NEW');
      if (status === 'update') return statusPill('UPDATE');
      return '<span style="color:#64748b;font-size:12px">OK</span>';
    }

    function scSyncRenderPreview(preview) {
      lastScSyncPreview = preview;
      var summaryEl = document.getElementById('scSyncSummary');
      var wrap = document.getElementById('scSyncPreviewWrap');
      var body = document.getElementById('scSyncPreviewBody');
      var sourceHint = document.getElementById('scSyncSourceHint');
      if (!summaryEl || !wrap || !body) return;

      var s = preview.summary || {};
      summaryEl.style.display = 'block';
      summaryEl.innerHTML =
        '<strong>Preview</strong> · source: ' + fmt(preview.sourceLabel || preview.source) +
        '<br/>Sites products: ' + fmt(s.sitesProductCount) +
        ' · Member products: ' + fmt(s.memberProductCount) +
        ' · To update: <strong>' + fmt(s.toUpdate) + '</strong>' +
        ' · To create: <strong>' + fmt(s.toCreate) + '</strong>' +
        ' · Unchanged: ' + fmt(s.unchanged) +
        (s.onlyInMember ? ' · Only in member: ' + fmt(s.onlyInMember) : '') +
        (s.lockedProducts ? ' · <span style="color:#92400e">Protected by manual edits: ' + fmt(s.lockedProducts) + '</span>' : '');

      if (sourceHint) {
        sourceHint.textContent = 'Source: ' + (preview.sourceLabel || preview.source || 'unknown');
      }

      var rows = (preview.products || []).filter(function (p) {
        return (p.changes && p.changes.length) || (p.lockedFields && p.lockedFields.length);
      });
      if (rows.length === 0) {
        wrap.style.display = 'none';
        body.innerHTML = '';
        summaryEl.innerHTML += '<br/><span style="color:#059669">No price or image differences found.</span>';
        return;
      }

      wrap.style.display = 'block';
      body.innerHTML = rows.map(function (p) {
        var imageChange = (p.changes || []).find(function (c) { return c.field === 'imageUrl' && !c.locked; });
        var thumbUrl = imageChange ? scResolveShopAssetUrl(imageChange.after) : '';
        if (!thumbUrl) {
          var existing = (lastShopCatalogProducts || []).find(function (x) { return x.id === p.id; });
          thumbUrl = scResolveShopAssetUrl(existing && existing.imageUrl ? existing.imageUrl : '');
        }
        var changesHtml = (p.changes || []).map(function (c) {
          var lockTag = c.locked ? ' <span style="background:#fef3c7;color:#92400e;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:4px">LOCKED</span>' : '';
          var beforeAfter = c.locked
            ? '<span style="color:#94a3b8;text-decoration:line-through">' + fmt(c.before) + ' \u2192 ' + fmt(c.after) + '</span> (kept your edit)'
            : fmt(c.before) + ' \u2192 <strong>' + fmt(c.after) + '</strong>';
          return '<div style="margin-bottom:4px"><span style="color:#64748b">' + fmt(c.field) + ':</span> ' + beforeAfter + lockTag + '</div>';
        }).join('');
        var statusPill = p.status === 'unchanged' && p.lockedFields && p.lockedFields.length
          ? '<span style="background:#fef3c7;color:#92400e;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">PROTECTED</span>'
          : scSyncStatusPill(p.status);
        return '<tr>' +
          '<td>' + slThumb(thumbUrl) + '</td>' +
          '<td><strong>' + fmt(p.name) + '</strong><br/><span style="color:#64748b;font-size:12px">' + fmt(p.id) + '</span></td>' +
          '<td>' + statusPill + '</td>' +
          '<td style="font-size:12px">' + (changesHtml || '-') + '</td>' +
        '</tr>';
      }).join('');
    }

    async function scSyncPreview() {
      var out = document.getElementById('scSyncResult');
      if (out) out.textContent = 'Loading preview…';
      var body = scSyncCollectBody();
      var preview = await apiPost('/admin/shop-catalog/sync/preview', body);
      scSyncRenderPreview(preview);
      if (out) out.textContent = 'Preview ready. Review changes, then click Apply sync.';
    }

    async function scSyncApply() {
      var out = document.getElementById('scSyncResult');
      if (!lastScSyncPreview) {
        if (out) out.textContent = 'Run Preview sync first.';
        return;
      }
      var s = lastScSyncPreview.summary || {};
      if (!s.toUpdate && !s.toCreate) {
        if (out) out.textContent = 'Nothing to apply — catalog already matches.';
        return;
      }
      if (!window.confirm('Apply sync? This updates live member catalog prices and images for ' +
          fmt(s.toUpdate) + ' product(s)' + (s.toCreate ? ' and adds ' + fmt(s.toCreate) + ' new product(s)' : '') + '.')) {
        return;
      }
      if (out) out.textContent = 'Applying sync…';
      var body = scSyncCollectBody();
      var result = await apiPost('/admin/shop-catalog/sync/apply', body);
      scSyncRenderPreview(result.preview || result);
      if (out) {
        out.textContent = 'Sync applied. Updated ' + fmt(result.productsUpdated) +
          ', created ' + fmt(result.productsCreated) +
          (result.layoutUpdated ? ', layout synced.' : '.');
      }
      await loadShopCatalog();
    }

    function haAbsoluteImageUrl(url) {
      if (!url) return '';
      return url;
    }

    function popularProductById(id) {
      return (lastShopCatalogProducts || []).find(function (p) { return p.id === id; });
    }

    function popularFormatPrice(cents) {
      var n = Number(cents);
      if (!Number.isFinite(n)) return '-';
      return 'RM ' + (n / 100).toFixed(2);
    }

    function popularThumb(url) {
      var safe = String(url || '').replace(/"/g, '&quot;');
      if (!safe) return '<div style="width:48px;height:36px;border-radius:6px;background:#f1f5f9;border:1px solid #e2e8f0"></div>';
      return '<div style="width:48px;height:36px;border-radius:6px;background:url(&quot;' + safe + '&quot;) center/cover no-repeat;border:1px solid #e2e8f0"></div>';
    }

    function renderPopularSelected() {
      var body = document.getElementById('popularSelectedBody');
      if (!body) return;
      if (popularSelectedIds.length === 0) {
        body.innerHTML = '<tr><td colspan="7">No items selected. Add items from the list below.</td></tr>';
        return;
      }
      var rows = popularSelectedIds.map(function (id, idx) {
        var p = popularProductById(id) || { id: id, name: id + ' (missing)', category: '-', basePriceCents: 0, imageUrl: '' };
        var upDisabled = idx === 0 ? ' disabled' : '';
        var downDisabled = idx === popularSelectedIds.length - 1 ? ' disabled' : '';
        return '<tr>' +
          '<td><strong>#' + (idx + 1) + '</strong></td>' +
          '<td>' + popularThumb(p.imageUrl) + '</td>' +
          '<td>' + fmt(p.name) + '</td>' +
          '<td>' + fmt(p.category) + '</td>' +
          '<td>' + popularFormatPrice(p.basePriceCents) + '</td>' +
          '<td class="td-actions">' +
            '<button type="button" class="btn-outline pop-up-btn" data-id="' + fmt(p.id) + '"' + upDisabled + '>↑</button> ' +
            '<button type="button" class="btn-outline pop-down-btn" data-id="' + fmt(p.id) + '"' + downDisabled + '>↓</button>' +
          '</td>' +
          '<td class="td-actions"><button type="button" class="btn-outline pop-remove-btn" data-id="' + fmt(p.id) + '">Remove</button></td>' +
        '</tr>';
      });
      body.innerHTML = rows.join('');
    }

    function renderPopularAvailable() {
      var body = document.getElementById('popularAvailableBody');
      if (!body) return;
      var q = (document.getElementById('popularFilter').value || '').trim().toLowerCase();
      var selected = new Set(popularSelectedIds);
      var candidates = (lastShopCatalogProducts || []).filter(function (p) {
        if (selected.has(p.id)) return false;
        if (!q) return true;
        return ((p.name || '') + ' ' + (p.category || '') + ' ' + (p.shortDescription || ''))
          .toLowerCase().indexOf(q) !== -1;
      });
      if (candidates.length === 0) {
        body.innerHTML = '<tr><td colspan="5">' + (q ? 'No matches.' : 'All items are already selected.') + '</td></tr>';
        return;
      }
      var full = popularSelectedIds.length >= popularMaxLimit;
      body.innerHTML = candidates.map(function (p) {
        return '<tr>' +
          '<td>' + popularThumb(p.imageUrl) + '</td>' +
          '<td>' + fmt(p.name) + '</td>' +
          '<td>' + fmt(p.category) + '</td>' +
          '<td>' + popularFormatPrice(p.basePriceCents) + '</td>' +
          '<td class="td-actions"><button type="button" class="btn-primary pop-add-btn" data-id="' + fmt(p.id) + '"' + (full ? ' disabled title="Max reached"' : '') + '>Add</button></td>' +
        '</tr>';
      }).join('');
    }

    function refreshPopularUi() {
      var hint = document.getElementById('popularMaxHint');
      if (hint) hint.textContent = String(popularMaxLimit);
      var maxInput = document.getElementById('popularMax');
      if (maxInput) maxInput.value = String(popularMaxLimit);
      popularSelectedIds = popularSelectedIds.slice(0, popularMaxLimit);
      renderPopularSelected();
      renderPopularAvailable();
    }

    async function loadPopularItems() {
      const [cfg, products] = await Promise.all([
        api('/admin/shop-catalog/popular'),
        api('/admin/shop-catalog/products'),
      ]);
      lastShopCatalogProducts = products || [];
      popularSelectedIds = Array.isArray(cfg && cfg.productIds) ? cfg.productIds.slice() : [];
      popularMaxLimit = Math.max(1, Math.min(5, Number(cfg && cfg.maxLimit) || 5));
      refreshPopularUi();
    }

    function slProductById(id) {
      return (lastShopCatalogProducts || []).find(function (p) { return p.id === id; });
    }

    function slFormatPrice(cents, display) {
      if (display && String(display).trim()) return String(display).trim();
      var n = Number(cents);
      if (!Number.isFinite(n)) return '-';
      return 'RM ' + (n / 100).toFixed(2);
    }

    function slThumb(url) {
      return popularThumb(url);
    }

    function renderShopLayoutFeaturedSelected() {
      var body = document.getElementById('slFeaturedSelectedBody');
      if (!body) return;
      if (shopLayoutFeaturedIds.length === 0) {
        body.innerHTML = '<tr><td colspan="6">No featured products. Add from the list below.</td></tr>';
        return;
      }
      body.innerHTML = shopLayoutFeaturedIds.map(function (id, idx) {
        var p = slProductById(id) || { id: id, name: id + ' (missing)', category: '-', imageUrl: '', basePriceCents: 0 };
        var upDisabled = idx === 0 ? ' disabled' : '';
        var downDisabled = idx === shopLayoutFeaturedIds.length - 1 ? ' disabled' : '';
        return '<tr>' +
          '<td><strong>#' + (idx + 1) + '</strong></td>' +
          '<td>' + slThumb(p.imageUrl) + '</td>' +
          '<td>' + fmt(p.name) + '</td>' +
          '<td>' + fmt(p.categoryLabel || p.category) + '</td>' +
          '<td class="td-actions">' +
            '<button type="button" class="btn-outline sl-feat-up-btn" data-id="' + fmt(p.id) + '"' + upDisabled + '>↑</button> ' +
            '<button type="button" class="btn-outline sl-feat-down-btn" data-id="' + fmt(p.id) + '"' + downDisabled + '>↓</button>' +
          '</td>' +
          '<td class="td-actions"><button type="button" class="btn-outline sl-feat-remove-btn" data-id="' + fmt(p.id) + '">Remove</button></td>' +
        '</tr>';
      }).join('');
    }

    function renderShopLayoutFeaturedAvailable() {
      var body = document.getElementById('slFeaturedAvailableBody');
      if (!body) return;
      var q = (document.getElementById('slFeaturedFilter').value || '').trim().toLowerCase();
      var selected = new Set(shopLayoutFeaturedIds);
      var candidates = (lastShopCatalogProducts || []).filter(function (p) {
        if (selected.has(p.id)) return false;
        if (!q) return true;
        return ((p.name || '') + ' ' + (p.category || '') + ' ' + (p.categoryLabel || '') + ' ' + (p.shortDescription || ''))
          .toLowerCase().indexOf(q) !== -1;
      });
      if (candidates.length === 0) {
        body.innerHTML = '<tr><td colspan="4">' + (q ? 'No matches.' : 'All items are already featured.') + '</td></tr>';
        return;
      }
      body.innerHTML = candidates.map(function (p) {
        return '<tr>' +
          '<td>' + slThumb(p.imageUrl) + '</td>' +
          '<td>' + fmt(p.name) + '</td>' +
          '<td>' + fmt(p.categoryLabel || p.category) + '</td>' +
          '<td class="td-actions"><button type="button" class="btn-primary sl-feat-add-btn" data-id="' + fmt(p.id) + '">Add</button></td>' +
        '</tr>';
      }).join('');
    }

    function refreshShopLayoutFeaturedUi() {
      renderShopLayoutFeaturedSelected();
      renderShopLayoutFeaturedAvailable();
    }

    function renderShopLayoutSections() {
      var body = document.getElementById('slSectionsBody');
      if (!body) return;
      if (!shopLayoutSections.length) {
        body.innerHTML = '<tr><td colspan="4">No sections yet. Click “Add section”.</td></tr>';
        return;
      }
      body.innerHTML = shopLayoutSections.map(function (s, idx) {
        return '<tr>' +
          '<td><code>' + fmt(s.id) + '</code></td>' +
          '<td>' + fmt(s.title) + '</td>' +
          '<td>' + fmt((s.productIds || []).length) + '</td>' +
          '<td class="td-actions">' +
            '<button type="button" class="btn-outline sl-section-edit-btn" data-idx="' + idx + '">Edit</button> ' +
            '<button type="button" class="btn-outline sl-section-up-btn" data-idx="' + idx + '"' + (idx === 0 ? ' disabled' : '') + '>↑</button> ' +
            '<button type="button" class="btn-outline sl-section-down-btn" data-idx="' + idx + '"' + (idx === shopLayoutSections.length - 1 ? ' disabled' : '') + '>↓</button> ' +
            '<button type="button" class="btn-outline sl-section-remove-btn" data-idx="' + idx + '">Remove</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function slSyncSectionFieldsFromState() {
      if (shopLayoutEditingSectionIdx < 0 || !shopLayoutSections[shopLayoutEditingSectionIdx]) return;
      var s = shopLayoutSections[shopLayoutEditingSectionIdx];
      document.getElementById('slSectionId').value = s.id || '';
      document.getElementById('slSectionTitle').value = s.title || '';
      document.getElementById('slSectionDesc').value = s.description || '';
    }

    function slSyncSectionStateFromFields() {
      if (shopLayoutEditingSectionIdx < 0 || !shopLayoutSections[shopLayoutEditingSectionIdx]) return;
      var s = shopLayoutSections[shopLayoutEditingSectionIdx];
      s.id = document.getElementById('slSectionId').value.trim() || s.id;
      s.title = document.getElementById('slSectionTitle').value.trim() || s.title;
      s.description = document.getElementById('slSectionDesc').value.trim();
    }

    function renderShopLayoutSectionProducts() {
      var selectedBody = document.getElementById('slSectionSelectedBody');
      var availableBody = document.getElementById('slSectionAvailableBody');
      if (!selectedBody || !availableBody) return;
      if (shopLayoutEditingSectionIdx < 0 || !shopLayoutSections[shopLayoutEditingSectionIdx]) {
        selectedBody.innerHTML = '<tr><td colspan="5">Select a section to edit.</td></tr>';
        availableBody.innerHTML = '<tr><td colspan="3">—</td></tr>';
        return;
      }
      slSyncSectionStateFromFields();
      var section = shopLayoutSections[shopLayoutEditingSectionIdx];
      var ids = section.productIds || [];
      if (ids.length === 0) {
        selectedBody.innerHTML = '<tr><td colspan="5">No products in this section.</td></tr>';
      } else {
        selectedBody.innerHTML = ids.map(function (id, idx) {
          var p = slProductById(id) || { id: id, name: id + ' (missing)', imageUrl: '' };
          return '<tr>' +
            '<td><strong>#' + (idx + 1) + '</strong></td>' +
            '<td>' + slThumb(p.imageUrl) + '</td>' +
            '<td>' + fmt(p.name) + '</td>' +
            '<td class="td-actions">' +
              '<button type="button" class="btn-outline sl-sec-prod-up-btn" data-id="' + fmt(id) + '"' + (idx === 0 ? ' disabled' : '') + '>↑</button> ' +
              '<button type="button" class="btn-outline sl-sec-prod-down-btn" data-id="' + fmt(id) + '"' + (idx === ids.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '</td>' +
            '<td class="td-actions"><button type="button" class="btn-outline sl-sec-prod-remove-btn" data-id="' + fmt(id) + '">Remove</button></td>' +
          '</tr>';
        }).join('');
      }
      var q = (document.getElementById('slSectionFilter').value || '').trim().toLowerCase();
      var selected = new Set(ids);
      var candidates = (lastShopCatalogProducts || []).filter(function (p) {
        if (selected.has(p.id)) return false;
        if (!q) return true;
        return ((p.name || '') + ' ' + (p.id || '') + ' ' + (p.shortDescription || '')).toLowerCase().indexOf(q) !== -1;
      });
      availableBody.innerHTML = candidates.length
        ? candidates.map(function (p) {
            return '<tr><td>' + slThumb(p.imageUrl) + '</td><td>' + fmt(p.name) + '</td>' +
              '<td class="td-actions"><button type="button" class="btn-primary sl-sec-prod-add-btn" data-id="' + fmt(p.id) + '">Add</button></td></tr>';
          }).join('')
        : '<tr><td colspan="3">' + (q ? 'No matches.' : 'All catalog items are already in this section.') + '</td></tr>';
    }

    function openShopLayoutSectionEditor(idx) {
      shopLayoutEditingSectionIdx = idx;
      var panel = document.getElementById('slSectionPanel');
      if (panel) panel.classList.remove('hidden');
      slSyncSectionFieldsFromState();
      renderShopLayoutSectionProducts();
    }

    function refreshShopLayoutUi() {
      refreshShopLayoutFeaturedUi();
      renderShopLayoutSections();
      if (shopLayoutEditingSectionIdx >= 0) {
        slSyncSectionFieldsFromState();
        renderShopLayoutSectionProducts();
      }
    }

    async function loadShopLayout() {
      const [layout, products] = await Promise.all([
        api('/admin/shop-catalog/layout'),
        api('/admin/shop-catalog/products'),
      ]);
      lastShopCatalogProducts = products || [];
      shopLayoutFeaturedIds = Array.isArray(layout && layout.homeFeaturedProductIds)
        ? layout.homeFeaturedProductIds.slice()
        : [];
      shopLayoutSections = Array.isArray(layout && layout.shopSections)
        ? layout.shopSections.map(function (s) {
            return {
              id: String(s.id || ''),
              title: String(s.title || ''),
              description: String(s.description || ''),
              productIds: Array.isArray(s.productIds) ? s.productIds.slice() : [],
            };
          })
        : [];
      if (shopLayoutEditingSectionIdx >= shopLayoutSections.length) {
        shopLayoutEditingSectionIdx = -1;
        var panel = document.getElementById('slSectionPanel');
        if (panel) panel.classList.add('hidden');
      }
      refreshShopLayoutUi();
    }

    async function loadHomeAdSlides() {
      const data = await api('/admin/home-ads/slides');
      lastHomeAdSlides = data || [];
      const editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      const delSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
      const body = document.getElementById('homeAdsBody');
      if (!body) return;
      body.innerHTML = (data || []).map(function (s) {
        const bg = String(s.backgroundCss || '').replace(/"/g, '&quot;');
        const imgUrl = haAbsoluteImageUrl(s.imageUrl).replace(/"/g, '&quot;');
        const preview = imgUrl
          ? '<div style="width:80px;height:36px;border-radius:8px;background:url(&quot;' + imgUrl + '&quot;) center/cover no-repeat;border:1px solid #e2e8f0"></div>'
          : '<div style="width:80px;height:36px;border-radius:8px;background:' + bg + ';border:1px solid #e2e8f0"></div>';
        const imageCell = imgUrl
          ? '<span style="color:#16a34a;font-weight:600">Uploaded</span>'
          : '<span style="color:#94a3b8">—</span>';
        return '<tr><td>' + preview + '</td><td>' + imageCell + '</td><td>' + fmt(s.title) + '</td><td>' + fmt(s.body) + '</td><td>' + fmt(s.sortOrder) + '</td><td>' +
          (s.isActive ? statusPill('YES') : statusPill('NO')) +
          '</td><td class="td-actions"><button type="button" class="icon-btn ha-edit-btn" data-id="' + fmt(s.id) + '">' + editSvg +
          '</button></td><td class="td-actions"><button type="button" class="icon-btn ha-del-btn" data-id="' + fmt(s.id) + '" title="Delete">' + delSvg + '</button></td></tr>';
      }).join('') || '<tr><td colspan="8">No slides yet. Use “New slide” to create one.</td></tr>';
    }

    function haUpdatePreview() {
      const p = document.getElementById('haPreview');
      if (!p) return;
      const bg = document.getElementById('haBg').value.trim() || 'linear-gradient(135deg, #eef2ff, #dbeafe)';
      const title = document.getElementById('haTitle').value.trim() || 'Slide title';
      const body = document.getElementById('haBody').value.trim() || 'Slide body';
      const id = document.getElementById('haId').value.trim();
      const slide = id ? lastHomeAdSlides.find(function (x) { return x.id === id; }) : null;
      const imgUrl = slide && slide.imageUrl ? haAbsoluteImageUrl(slide.imageUrl) : '';
      if (imgUrl) {
        p.style.background = 'url("' + imgUrl + '") center/cover no-repeat';
      } else {
        p.style.background = bg;
      }
      p.innerHTML = '<div style="text-align:center;background:rgba(255,255,255,0.72);padding:6px 10px;border-radius:8px"><div>' + fmt(title) + '</div><div style="font-weight:400;font-size:12px;color:#475569">' + fmt(body) + '</div></div>';

      const thumb = document.getElementById('haImageThumb');
      if (thumb) {
        if (imgUrl) {
          thumb.style.background = 'url("' + imgUrl + '") center/cover no-repeat';
          thumb.textContent = '';
        } else {
          thumb.style.background = '#f8fafc';
          thumb.textContent = 'No image';
        }
      }
    }

    function haResetForm() {
      document.getElementById('haId').value = '';
      document.getElementById('haTitle').value = '';
      document.getElementById('haBody').value = '';
      document.getElementById('haBg').value = 'linear-gradient(135deg, #eef2ff, #dbeafe)';
      document.getElementById('haSort').value = String((lastHomeAdSlides.length || 0) * 10);
      document.getElementById('haActive').checked = true;
      document.getElementById('haSaveResult').textContent = '';
      const fileInput = document.getElementById('haImageFile');
      if (fileInput) fileInput.value = '';
      const imgOut = document.getElementById('haImageResult');
      if (imgOut) imgOut.textContent = '';
      haUpdatePreview();
    }

    async function haUploadFile(id, file) {
      const headers = { ...getAuthHeaders() };
      delete headers['Content-Type'];
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/admin/home-ads/slides/' + encodeURIComponent(id) + '/image', {
        method: 'POST',
        headers,
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Upload failed (' + res.status + '): ' + txt);
      }
      return res.json();
    }

    let lastEmployeesList = [];

    function emEscapeAttr(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
    }

    function emEscapeHtml(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    var EM_MONTHLY_HOURS = (52 * 40) / 12;

    function emDecimalToBps(s) {
      var n = parseFloat(String(s).replace(',', '.'), 10);
      if (!isFinite(n) || n < 0) return 10_000;
      return Math.min(1_000_000, Math.max(0, Math.round(n * 10_000)));
    }

    function emBpsToDecimalStr(bps, dec) {
      var d = dec == null ? 2 : dec;
      return (Number(bps || 0) / 10_000).toFixed(d);
    }

    function emPercentStrToBps(s) {
      var n = parseFloat(String(s).replace(',', '.'), 10);
      if (!isFinite(n) || n < 0) return 0;
      return Math.min(1_000_000, Math.max(0, Math.round(n * 100)));
    }

    function emBpsToPercentStr(bps) {
      return (Number(bps || 0) / 100).toFixed(2);
    }

    function emHourlyToMonthlyCents(hourlyCents) {
      return Math.round(Number(hourlyCents || 0) * EM_MONTHLY_HOURS);
    }

    function emMonthlyToHourlyCents(monthlyCents) {
      return Math.round(Number(monthlyCents || 0) / EM_MONTHLY_HOURS);
    }

    function emMoneyCents(c) {
      return (Number(c || 0) / 100).toFixed(2);
    }

    function emRenderPayrollPayslip(r) {
      var emp = r.employee || {};
      var period = r.period || {};
      var set = r.settings || {};
      var lines = Array.isArray(r.lines) ? r.lines : [];
      var bd = r.breakdown || { straightTimePayCents: 0, rulesPremiumPayCents: 0 };
      var stdH = (Number(set.standardWorkdayMinutes || 0) / 60).toFixed(2);
      var otM = emBpsToDecimalStr(set.overtimeMultiplierBps, 2);
      var phM = emBpsToDecimalStr(set.publicHolidayMultiplierBps, 2);
      var offM = emBpsToDecimalStr(set.offDayWorkedMultiplierBps, 2);
      var pct = emBpsToPercentStr(emp.commissionRateBps);
      var totalMin = lines.reduce(function (a, ln) {
        return a + Number(ln.minutesWorked || 0);
      }, 0);
      var totalH = (totalMin / 60).toFixed(2);
      var monthlyC = emHourlyToMonthlyCents(emp.hourlyRateCents);
      var commRate = Number(r.commissionFromRateBpsCents || 0);
      var manual = Number(r.manualCommissionCents || 0);
      var gross = Number(r.grandTotalCents || 0);
      var ded = 0;
      var net = gross - ded;
      var title =
        'PAYROLL SUMMARY — ' + emEscapeHtml(period.from || '') + ' to ' + emEscapeHtml(period.to || '');
      var dayRows = lines
        .map(function (ln) {
          var h = (Number(ln.minutesWorked || 0) / 60).toFixed(2);
          return (
            '<tr><td>' +
            emEscapeHtml(ln.date) +
            '</td><td>' +
            emEscapeHtml(ln.dayType) +
            '</td><td class="num">' +
            h +
            '</td><td class="num">' +
            emMoneyCents(ln.payCents) +
            '</td></tr>'
          );
        })
        .join('');
      return (
        '<div class="em-payslip">' +
        '<div class="em-payslip-head">' +
        '<div class="em-payslip-co">Moja</div>' +
        '<div class="em-payslip-title">' +
        title +
        '<div class="em-payslip-sub">Generated from closed punches in range</div></div></div>' +
        '<div class="em-payslip-grid">' +
        '<span>EMPLOYEE NO.</span><span>' +
        emEscapeHtml(emp.employeeCode) +
        '</span>' +
        '<span>POSITION</span><span>' +
        emEscapeHtml(emp.positionTitle || '—') +
        '</span>' +
        '<span>NAME</span><span>' +
        emEscapeHtml(emp.displayName) +
        '</span>' +
        '<span>MONTHLY SALARY (¢)</span><span>' +
        fmt(monthlyC) +
        '</span>' +
        '<span>HOURS (PERIOD)</span><span>' +
        totalH +
        '</span>' +
        '<span>PERCENTAGE (%)</span><span>' +
        pct +
        '</span>' +
        '</div>' +
        '<div class="em-payslip-2col">' +
        '<div class="em-payslip-col"><h3>Earnings</h3>' +
        '<div class="em-payslip-row"><span>Straight-time pay (1×)</span><em>$ ' +
        emMoneyCents(bd.straightTimePayCents) +
        '</em></div>' +
        '<div class="em-payslip-row"><span>Multipliers &amp; premiums (OT / PH / off)</span><em>$ ' +
        emMoneyCents(bd.rulesPremiumPayCents) +
        '</em></div>' +
        '<div class="em-payslip-row"><span>Commission (' +
        pct +
        '% of wage subtotal)</span><em>$ ' +
        emMoneyCents(commRate) +
        '</em></div>' +
        '<div class="em-payslip-row"><span>Manual add-on</span><em>$ ' +
        emMoneyCents(manual) +
        '</em></div>' +
        '<div class="em-payslip-foot"><span>GROSS PAY</span><em>$ ' +
        emMoneyCents(gross) +
        '</em></div></div>' +
        '<div class="em-payslip-col"><h3>Deduction</h3>' +
        '<div class="em-payslip-row"><span>—</span><em>$ 0.00</em></div>' +
        '<div class="em-payslip-foot"><span>TOTAL DEDUCTION</span><em>$ ' +
        emMoneyCents(ded) +
        '</em></div></div></div>' +
        '<div class="em-payslip-net"><span>NET PAY</span><em>$ ' +
        emMoneyCents(net) +
        '</em></div>' +
        (dayRows
          ? '<table class="em-payslip-lines" aria-label="Daily breakdown"><thead><tr><th>Date</th><th>Day type</th><th class="num">Hours</th><th class="num">Pay ($)</th></tr></thead><tbody>' +
            dayRows +
            '</tbody></table>'
          : '<p class="em-payslip-meta">No closed punches in this range.</p>') +
        '<p class="em-payslip-meta">Rules: standard day ' +
        stdH +
        ' h · OT ×' +
        otM +
        ' · PH ×' +
        phM +
        ' · Off worked ×' +
        offM +
        '</p>' +
        (r.notes
          ? '<p class="em-payslip-meta">' + emEscapeHtml(r.notes) + '</p>'
          : '') +
        '<div class="em-payslip-sign"><div>APPROVED BY :</div><div>RECEIVED BY :</div></div>' +
        '</div>'
      );
    }

    function emInitRangeDates() {
      var t = new Date();
      var end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      var start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 13);
      function iso(d) {
        return d.toISOString().slice(0, 10);
      }
      [
        ['emTeFrom', start],
        ['emTeTo', end],
        ['emPayFrom', start],
        ['emPayTo', end],
        ['emCalFrom', start],
        ['emCalTo', end],
      ].forEach(function (pair) {
        var el = document.getElementById(pair[0]);
        if (el && !el.value) el.value = iso(pair[1]);
      });
    }

    async function loadEmPayrollSettingsForm() {
      var s = await api('/admin/employees/payroll-settings');
      var min = Number(s.standardWorkdayMinutes || 480);
      document.getElementById('emStdHours').value = (min / 60).toFixed(2);
      document.getElementById('emOtMul').value = emBpsToDecimalStr(s.overtimeMultiplierBps, 2);
      document.getElementById('emPhMul').value = emBpsToDecimalStr(s.publicHolidayMultiplierBps, 2);
      document.getElementById('emOffMul').value = emBpsToDecimalStr(s.offDayWorkedMultiplierBps, 2);
      document.getElementById('emPayrollSaveHint').textContent = '';
    }

    async function loadEmEmployeesTable() {
      var list = await api('/admin/employees');
      lastEmployeesList = Array.isArray(list) ? list : [];
      var body = document.getElementById('emEmpBody');
      body.innerHTML =
        lastEmployeesList
          .map(function (e) {
            return (
              '<tr data-em-id="' +
              fmt(e.id) +
              '"><td>' +
              fmt(e.employeeCode) +
              '</td><td><input type="text" class="em-inp-name" value="' +
              emEscapeAttr(e.displayName) +
              '" style="width:140px" maxlength="200"/></td><td><input type="text" class="em-inp-pos" value="' +
              emEscapeAttr(e.positionTitle) +
              '" style="width:120px" maxlength="120"/></td><td><input type="number" class="em-inp-rate" min="0" step="1" value="' +
              emHourlyToMonthlyCents(e.hourlyRateCents) +
              '" style="width:100px"/></td><td><input type="number" class="em-inp-comm" min="0" step="0.01" value="' +
              emBpsToPercentStr(e.commissionRateBps) +
              '" style="width:72px"/></td><td><input type="checkbox" class="em-inp-active" ' +
              (e.isActive ? 'checked' : '') +
              ' /></td><td class="td-actions"><button type="button" class="btn-outline em-row-save">Save</button></td></tr>'
            );
          })
          .join('') || '<tr><td colspan="7">No employees yet. Add one above.</td></tr>';
      var teSel = document.getElementById('emTeEmp');
      var paySel = document.getElementById('emPayEmp');
      teSel.innerHTML =
        '<option value="">All</option>' +
        lastEmployeesList
          .map(function (e) {
            return (
              '<option value="' +
              fmt(e.id) +
              '">' +
              fmt(e.employeeCode) +
              ' · ' +
              fmt(e.displayName) +
              '</option>'
            );
          })
          .join('');
      paySel.innerHTML = lastEmployeesList
        .map(function (e) {
          return (
            '<option value="' +
            fmt(e.id) +
            '">' +
            fmt(e.employeeCode) +
            ' · ' +
            fmt(e.displayName) +
            '</option>'
          );
        })
        .join('');
    }

    async function loadEmTimeEntries() {
      var from = document.getElementById('emTeFrom').value;
      var to = document.getElementById('emTeTo').value;
      var emp = document.getElementById('emTeEmp').value;
      var q =
        'from=' +
        encodeURIComponent(from) +
        '&to=' +
        encodeURIComponent(to) +
        (emp ? '&employeeId=' + encodeURIComponent(emp) : '');
      var data = await api('/admin/employees/time-entries?' + q);
      var rows = data.entries || [];
      document.getElementById('emTeBody').innerHTML =
        rows
          .map(function (r) {
            return (
              '<tr><td>' +
              dateFmt(r.clockInAt) +
              '</td><td>' +
              (r.clockOutAt ? dateFmt(r.clockOutAt) : '—') +
              '</td><td>' +
              fmt(r.minutesWorked) +
              '</td><td>' +
              fmt(r.employeeCode) +
              '</td><td>' +
              fmt(r.displayName) +
              '</td><td>' +
              fmt(r.positionTitle) +
              '</td></tr>'
            );
          })
          .join('') || '<tr><td colspan="6">No rows</td></tr>';
    }

    async function loadEmCalendarTable() {
      var from = document.getElementById('emCalFrom').value;
      var to = document.getElementById('emCalTo').value;
      if (!from || !to) return;
      var data = await api(
        '/admin/employees/calendar?from=' +
          encodeURIComponent(from) +
          '&to=' +
          encodeURIComponent(to),
      );
      var rows = data.days || [];
      document.getElementById('emCalBody').innerHTML =
        rows
          .map(function (d) {
            return (
              '<tr><td>' +
              fmt(d.date) +
              '</td><td>' +
              fmt(d.dayType) +
              '</td><td>' +
              fmt(d.label) +
              '</td></tr>'
            );
          })
          .join('') ||
        '<tr><td colspan="3">No custom days in range (days default to REGULAR).</td></tr>';
    }

    async function loadEmployeesMgmtPage() {
      await loadEmPayrollSettingsForm();
      await loadEmEmployeesTable();
      emInitRangeDates();
      await Promise.all([loadEmTimeEntries(), loadEmCalendarTable()]);
    }

    // ---- Email marketing (mailer) ----
    var mailerInitialized = false;

    function mailSetResult(id, msg, isError) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = msg || '';
      el.style.color = isError ? '#dc2626' : '';
    }
    function mailEditorErr(e) { mailSetResult('mailEditorResult', e.message, true); }
    function mailScheduleErr(e) { mailSetResult('mailScheduleResult', e.message, true); }
    function mailListErr(e) { mailSetResult('mailListResult', e.message, true); }

    function mailerInit() {
      if (mailerInitialized) return;
      mailerInitialized = true;
      document.getElementById('mailNewBtn').addEventListener('click', mailResetEditor);
      document.getElementById('mailRefreshBtn').addEventListener('click', function () {
        loadMailCampaigns().catch(mailListErr);
        mailUpdateAudienceCount();
      });
      document.getElementById('mailSaveBtn').addEventListener('click', function () {
        mailSave().then(function () {
          mailSetResult('mailEditorResult', 'Draft saved.');
        }).catch(mailEditorErr);
      });
      document.getElementById('mailPreviewBtn').addEventListener('click', function () {
        mailPreview().catch(mailEditorErr);
      });
      document.getElementById('mailTestBtn').addEventListener('click', function () {
        mailTestSend().catch(mailEditorErr);
      });
      document.getElementById('mailScheduleBtn').addEventListener('click', function () {
        mailSchedule(false).catch(mailScheduleErr);
      });
      document.getElementById('mailSendNowBtn').addEventListener('click', function () {
        mailSchedule(true).catch(mailScheduleErr);
      });
      document.getElementById('mailAudience').addEventListener('change', function () {
        mailSyncBirthdayVisibility();
        mailUpdateAudienceCount();
      });
      document.getElementById('mailTier').addEventListener('change', mailUpdateAudienceCount);
      document.getElementById('mailBirthdayDays').addEventListener('change', mailUpdateAudienceCount);
      document.getElementById('mailCampaignsBody').addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('button[data-mail-act]') : null;
        if (btn) mailTableAction(btn.getAttribute('data-mail-act'), btn.getAttribute('data-id')).catch(mailListErr);
      });
      mailLoadTemplates().catch(function () {});
      mailLoadVoucherDefs().catch(function () {});
      loadMailCampaigns().catch(mailListErr);
      mailUpdateAudienceCount();
    }

    function mailSyncBirthdayVisibility() {
      var wrap = document.getElementById('mailBirthdayDaysWrap');
      if (wrap) wrap.style.display =
        document.getElementById('mailAudience').value === 'BIRTHDAY_UPCOMING' ? '' : 'none';
    }

    async function mailLoadVoucherDefs() {
      var sel = document.getElementById('mailVoucherDef');
      if (!sel) return;
      var defs = await api('/admin/voucher-definitions');
      var current = sel.value;
      sel.innerHTML = '<option value="">— no voucher —</option>' + (defs || [])
        .filter(function (d) { return d.isActive; })
        .map(function (d) {
          var extra = d.rebateValueSen ? ' (RM' + (d.rebateValueSen / 100).toFixed(2) + ' off)' : '';
          return '<option value="' + vcEsc(d.id) + '">' + vcEsc(d.code + ' — ' + d.title + extra) + '</option>';
        }).join('');
      if (current) sel.value = current;
    }

    async function mailLoadTemplates() {
      var grid = document.getElementById('mailTemplateGrid');
      if (!grid) return;
      var data = await api('/admin/mailer/templates');
      var icons = { WELCOME: '👋', WEEKLY: '🍱', EVENT: '🎉', BIRTHDAY: '🎂', PLAIN: '📝' };
      grid.innerHTML = (data.templates || []).map(function (t) {
        return '<button type="button" class="btn-outline" data-mail-template="' + vcEsc(t.kind) + '"' +
          ' style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:12px;text-align:left;height:auto;cursor:pointer">' +
          '<span style="font-size:20px">' + (icons[t.kind] || '📝') + '</span>' +
          '<strong style="font-size:13px">' + vcEsc(t.label) + '</strong>' +
          '<span class="field-hint" style="margin:0;font-size:11.5px">' + vcEsc(t.description) + '</span></button>';
      }).join('');
      grid.querySelectorAll('button[data-mail-template]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var kind = btn.getAttribute('data-mail-template');
          var t = (data.templates || []).find(function (x) { return x.kind === kind; });
          if (!t) return;
          var bodyEl = document.getElementById('mailBody');
          if (bodyEl.value.trim() && !window.confirm('Replace the current draft content with the "' + t.label + '" template?')) return;
          document.getElementById('mailTemplateKind').value = t.kind;
          document.getElementById('mailSubject').value = t.subject || '';
          document.getElementById('mailPreheader').value = t.preheader || '';
          bodyEl.value = t.bodyHtml || '';
          if (t.kind === 'BIRTHDAY') {
            document.getElementById('mailAudience').value = 'BIRTHDAY_UPCOMING';
            mailSyncBirthdayVisibility();
            mailUpdateAudienceCount();
          }
          var nameEl = document.getElementById('mailName');
          if (!nameEl.value.trim()) nameEl.value = t.label;
          grid.querySelectorAll('button[data-mail-template]').forEach(function (b) {
            b.style.borderColor = '';
            b.style.background = '';
          });
          btn.style.borderColor = '#2563eb';
          btn.style.background = '#eff6ff';
          mailSetResult('mailEditorResult', 'Template loaded — edit and save as draft.');
        });
      });
    }

    function mailResetEditor() {
      document.getElementById('mailEditingId').value = '';
      document.getElementById('mailTemplateKind').value = 'PLAIN';
      ['mailName', 'mailSubject', 'mailPreheader', 'mailBody', 'mailTestEmail', 'mailScheduleAt'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
      document.getElementById('mailAudience').value = 'OPTED_IN';
      document.getElementById('mailTier').value = '';
      document.getElementById('mailBirthdayDays').value = '14';
      document.getElementById('mailVoucherDef').value = '';
      document.getElementById('mailVoucherValidDays').value = '';
      mailSyncBirthdayVisibility();
      document.getElementById('mailEditorMode').textContent = 'new campaign';
      document.getElementById('mailPreviewWrap').style.display = 'none';
      mailSetResult('mailEditorResult', '');
      mailSetResult('mailScheduleResult', '');
      mailUpdateAudienceCount();
    }

    function mailEditorPayload() {
      var birthdayDays = parseInt(document.getElementById('mailBirthdayDays').value, 10);
      var voucherValidDays = parseInt(document.getElementById('mailVoucherValidDays').value, 10);
      return {
        name: document.getElementById('mailName').value.trim(),
        templateKind: document.getElementById('mailTemplateKind').value || 'PLAIN',
        subject: document.getElementById('mailSubject').value.trim(),
        preheader: document.getElementById('mailPreheader').value.trim() || null,
        bodyHtml: document.getElementById('mailBody').value,
        audience: document.getElementById('mailAudience').value,
        tierFilter: document.getElementById('mailTier').value.trim() || null,
        birthdayWindowDays: Number.isFinite(birthdayDays) ? birthdayDays : null,
        voucherDefinitionId: document.getElementById('mailVoucherDef').value || null,
        voucherValidDays: Number.isFinite(voucherValidDays) ? voucherValidDays : null,
      };
    }

    async function mailSave() {
      var payload = mailEditorPayload();
      if (!payload.name) throw new Error('Give the campaign an internal name.');
      if (!payload.subject) throw new Error('Subject is required.');
      if (!payload.bodyHtml.trim()) throw new Error('The email body is empty.');
      var editingId = document.getElementById('mailEditingId').value;
      var res;
      if (editingId) {
        res = await apiPatch('/admin/mailer/campaigns/' + editingId, payload);
      } else {
        res = await apiPost('/admin/mailer/campaigns', payload);
        document.getElementById('mailEditingId').value = res.campaign.id;
      }
      document.getElementById('mailEditorMode').textContent = 'editing "' + res.campaign.name + '"';
      await loadMailCampaigns();
      return res.campaign.id;
    }

    async function mailEnsureSaved() {
      var editingId = document.getElementById('mailEditingId').value;
      if (editingId) { await mailSave(); return editingId; }
      return mailSave();
    }

    async function mailPreview() {
      var id = await mailEnsureSaved();
      var data = await api('/admin/mailer/campaigns/' + id + '/preview');
      var frame = document.getElementById('mailPreviewFrame');
      frame.srcdoc = data.html;
      document.getElementById('mailPreviewWrap').style.display = 'block';
      mailSetResult('mailEditorResult', 'Preview updated (subject: ' + data.subject + ')');
    }

    async function mailTestSend() {
      var address = document.getElementById('mailTestEmail').value.trim();
      if (!address) throw new Error('Enter an email address for the test send.');
      var id = await mailEnsureSaved();
      mailSetResult('mailEditorResult', 'Sending test…');
      await apiPost('/admin/mailer/campaigns/' + id + '/test-send', { email: address });
      mailSetResult('mailEditorResult', 'Test email sent to ' + address + '.');
    }

    async function mailUpdateAudienceCount() {
      var el = document.getElementById('mailAudienceCount');
      var preview = document.getElementById('mailBirthdayPreview');
      if (!el) return;
      try {
        var aud = document.getElementById('mailAudience').value;
        var tier = document.getElementById('mailTier').value.trim();
        var days = document.getElementById('mailBirthdayDays').value;
        var data = await api('/admin/mailer/audience-preview?audience=' + encodeURIComponent(aud) +
          '&tier=' + encodeURIComponent(tier) + '&birthdayDays=' + encodeURIComponent(days));
        el.textContent = 'This audience currently has ' + data.count + ' recipient(s).' +
          (aud === 'BIRTHDAY_UPCOMING' ? ' Members with a birthday in the next ' + (data.birthdayWindowDays || days) + ' days, soonest first:' : '');
        if (preview) {
          if (aud === 'BIRTHDAY_UPCOMING' && (data.recipients || []).length) {
            preview.style.display = '';
            preview.innerHTML = '<div class="table-wrap" style="max-height:220px;overflow:auto">' +
              '<table class="data"><thead><tr><th>Birthday in</th><th>Name</th><th>Email</th><th>Birthday</th></tr></thead><tbody>' +
              data.recipients.map(function (r) {
                var when = r.birthdayDaysUntil === 0 ? '🎂 today' : r.birthdayDaysUntil + ' day(s)';
                var bday = r.birthday ? String(r.birthday).slice(5, 10) : '—';
                return '<tr><td>' + when + '</td><td>' + vcEsc(r.name || '—') + '</td><td>' + vcEsc(r.email || '—') + '</td><td>' + vcEsc(bday) + '</td></tr>';
              }).join('') + '</tbody></table></div>';
          } else {
            preview.style.display = 'none';
            preview.innerHTML = '';
          }
        }
      } catch (e) {
        el.textContent = '';
        if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
      }
    }

    async function mailSchedule(sendNow) {
      var id = await mailEnsureSaved();
      var body = {};
      var label;
      if (sendNow) {
        var countEl = document.getElementById('mailAudienceCount');
        var confirmMsg = 'Send this campaign now?' + (countEl && countEl.textContent ? '\\n' + countEl.textContent : '');
        if (!window.confirm(confirmMsg)) return;
        label = 'Sending — refresh the list to follow progress.';
      } else {
        var v = document.getElementById('mailScheduleAt').value;
        if (!v) throw new Error('Pick a date and time to schedule.');
        var when = new Date(v);
        if (isNaN(when.getTime())) throw new Error('Invalid schedule date.');
        if (when.getTime() < Date.now() - 60000) throw new Error('The schedule time is in the past.');
        body.scheduledAt = when.toISOString();
        label = 'Scheduled for ' + when.toLocaleString() + '.';
      }
      await apiPost('/admin/mailer/campaigns/' + id + '/schedule', body);
      mailSetResult('mailScheduleResult', label);
      await loadMailCampaigns();
    }

    function mailStatusBadge(status) {
      var colors = {
        DRAFT: '#64748b', SCHEDULED: '#2563eb', SENDING: '#d97706',
        SENT: '#059669', CANCELLED: '#94a3b8', FAILED: '#dc2626',
      };
      return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:700;color:#fff;background:' + (colors[status] || '#64748b') + '">' + vcEsc(status) + '</span>';
    }

    async function loadMailCampaigns() {
      var body = document.getElementById('mailCampaignsBody');
      if (!body) return;
      var data = await api('/admin/mailer/campaigns');
      var rows = (data.campaigns || []).map(function (c) {
        var audience = (c.audience === 'ALL_WITH_EMAIL' ? 'All with email'
          : c.audience === 'BIRTHDAY_UPCOMING' ? '🎂 Birthday ≤ ' + (c.birthdayWindowDays || 14) + 'd'
          : 'Opted-in') + (c.tierFilter ? ' · ' + vcEsc(c.tierFilter) : '') +
          (c.voucherDefinitionId ? ' · 🎟️ voucher' : '');
        var whenTxt = '';
        if (c.status === 'SCHEDULED' && c.scheduledAt) whenTxt = new Date(c.scheduledAt).toLocaleString();
        else if (c.completedAt) whenTxt = new Date(c.completedAt).toLocaleString();
        var delivered = c.totalRecipients ? (c.sentCount + '/' + c.totalRecipients + (c.failedCount ? ' (' + c.failedCount + ' failed)' : '')) : '—';
        var actions = '<button type="button" class="btn-outline" data-mail-act="open" data-id="' + c.id + '">Open</button> ' +
          '<button type="button" class="btn-outline" data-mail-act="duplicate" data-id="' + c.id + '">Duplicate</button>';
        if (c.status === 'SCHEDULED') actions += ' <button type="button" class="btn-outline" data-mail-act="cancel" data-id="' + c.id + '">Cancel</button>';
        if (c.status === 'DRAFT' || c.status === 'CANCELLED' || c.status === 'SENT' || c.status === 'FAILED') {
          actions += ' <button type="button" class="btn-outline" data-mail-act="delete" data-id="' + c.id + '">Delete</button>';
        }
        return '<tr>' +
          '<td>' + vcEsc(c.name) + '</td>' +
          '<td>' + vcEsc(c.subject) + '</td>' +
          '<td>' + audience + '</td>' +
          '<td style="text-align:center">' + mailStatusBadge(c.status) + '</td>' +
          '<td>' + vcEsc(whenTxt) + '</td>' +
          '<td style="text-align:center">' + vcEsc(delivered) + '</td>' +
          '<td style="text-align:center;white-space:nowrap">' + actions + '</td>' +
          '</tr>';
      });
      body.innerHTML = rows.join('') || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:14px">No campaigns yet — draft your first one above.</td></tr>';
      mailSetResult('mailListResult', '');
    }

    async function mailTableAction(act, id) {
      if (act === 'open') {
        var data = await api('/admin/mailer/campaigns/' + id);
        var c = data.campaign;
        document.getElementById('mailEditingId').value = c.id;
        document.getElementById('mailTemplateKind').value = c.templateKind || 'PLAIN';
        document.getElementById('mailName').value = c.name || '';
        document.getElementById('mailSubject').value = c.subject || '';
        document.getElementById('mailPreheader').value = c.preheader || '';
        document.getElementById('mailBody').value = c.bodyHtml || '';
        document.getElementById('mailAudience').value = c.audience || 'OPTED_IN';
        document.getElementById('mailTier').value = c.tierFilter || '';
        document.getElementById('mailBirthdayDays').value = c.birthdayWindowDays || '14';
        document.getElementById('mailVoucherDef').value = c.voucherDefinitionId || '';
        document.getElementById('mailVoucherValidDays').value = c.voucherValidDays || '';
        mailSyncBirthdayVisibility();
        var editable = c.status === 'DRAFT' || c.status === 'SCHEDULED';
        document.getElementById('mailEditorMode').textContent =
          (editable ? 'editing "' : 'viewing "') + c.name + '" (' + c.status.toLowerCase() + ')';
        document.getElementById('mailPreviewWrap').style.display = 'none';
        mailSetResult('mailEditorResult', editable ? '' : 'This campaign has already run — duplicate it to send again.');
        mailSetResult('mailScheduleResult', c.lastError ? 'Last run: ' + c.lastError : '');
        mailUpdateAudienceCount();
        document.getElementById('mailName').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (act === 'duplicate') {
        await apiPost('/admin/mailer/campaigns/' + id + '/duplicate', {});
        await loadMailCampaigns();
        mailSetResult('mailListResult', 'Campaign duplicated as a new draft.');
      } else if (act === 'cancel') {
        if (!window.confirm('Cancel this scheduled campaign?')) return;
        await apiPost('/admin/mailer/campaigns/' + id + '/cancel', {});
        await loadMailCampaigns();
        mailSetResult('mailListResult', 'Campaign cancelled.');
      } else if (act === 'delete') {
        if (!window.confirm('Delete this campaign? This cannot be undone.')) return;
        await apiDelete('/admin/mailer/campaigns/' + id);
        await loadMailCampaigns();
        mailSetResult('mailListResult', 'Campaign deleted.');
      }
    }

    async function loadAll() {
      statusPanel.innerHTML = 'Loading&hellip;';
      const tasks = [
        loadOverview(),
        loadVoucherCampaigns(),
        loadCustomers(),
        loadLoyalty(),
        loadGiftRewards(),
        loadWalletLedger(),
        loadAudit(),
        loadLoginAudit(),
        loadCampaignSegments(),
        loadCampaignHistory(),
        loadCampaignVoucherInsights(),
        loadImportHistory(),
        loadExportJobs(),
        loadReporting(),
        loadPerksCampaignRules(),
        loadShopCatalog(),
        loadBentoMenu(),
        scRefreshSitesCatalogFileHint(),
        loadShopLayout(),
        loadHomeAdSlides(),
        loadPopularItems(),
      ];
      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === 'rejected');
      const succeeded = results.length - failed.length;
      if (!failed.length) {
        isConnected = true;
        updateConnectionUi();
        statusPanel.innerHTML = 'Connected. Data is loaded from <code>/admin/*</code>. Use the sidebar to switch screens.';
        return;
      }
      if (!succeeded) {
        isConnected = false;
        updateConnectionUi();
        statusPanel.textContent = 'Connection failed. Re-open Connect and verify API key or credentials.';
        throw new Error('Connection failed');
      }
      isConnected = true;
      updateConnectionUi();
      statusPanel.textContent = 'Connected with limited access. Some modules could not load due to permissions or unavailable endpoints.';
    }

    function firstVisibleView() {
      for (var i = 0; i < views.length; i += 1) {
        if (!hiddenViews.has(views[i])) return views[i];
      }
      return 'dashboard-overview';
    }

    function setMainView(view) {
      if (hiddenViews.has(view)) view = firstVisibleView();
      views.forEach((v) => {
        const el = document.getElementById(v);
        if (el) el.classList.add('hidden');
      });
      const cur = document.getElementById(view);
      if (cur) cur.classList.remove('hidden');
      title.textContent = viewTitles[view] || view;
      titleIcon.innerHTML = icons[view] || icons['dashboard-overview'];
      if (view === 'voucher-campaigns') {
        vcInitTemplates();
        vcInitDates();
      }
      if (view === 'mailer-campaigns') {
        mailerInit();
      }
    }

    async function applyDashboardConfig() {
      try {
        var res = await fetch('/admin-dashboard/config.json');
        if (!res.ok) return;
        var cfg = await res.json();
        var groups = (cfg && cfg.menuGroups) || {};
        var menuViews = (cfg && cfg.menuViews) || {};
        var hidden = new Set();
        document.querySelectorAll('.nav-group[data-menu-group]').forEach(function (groupEl) {
          var key = groupEl.getAttribute('data-menu-group');
          var groupCfg = groups[key] || {};
          var showGroup = groupCfg.showGroup !== false;
          var showSubmenu = groupCfg.showSubmenu !== false;
          var navItems = groupEl.querySelector('.nav-items');
          groupEl.classList.toggle('hidden', !showGroup);
          if (!navItems) return;
          navItems.classList.toggle('hidden', !showSubmenu || !showGroup);
        });
        var whitelistKeys = Object.keys(menuViews);
        var useWhitelist = whitelistKeys.length > 0;
        document.querySelectorAll('.nav-btn[data-view]').forEach(function (btn) {
          var v = btn.getAttribute('data-view');
          if (!v) return;
          var groupEl = btn.closest('.nav-group[data-menu-group]');
          var gKey = groupEl ? groupEl.getAttribute('data-menu-group') : '';
          var gCfg = gKey ? groups[gKey] || {} : {};
          var groupOk = gCfg.showGroup !== false && gCfg.showSubmenu !== false;
          var viewOk = !useWhitelist || menuViews[v] === true;
          var hideBtn = !groupOk || !viewOk;
          if (hideBtn) {
            btn.classList.add('hidden');
            hidden.add(v);
          } else {
            btn.classList.remove('hidden');
          }
        });
        hiddenViews = hidden;
        var activeBtn = document.querySelector('.nav-btn.active');
        var activeView = activeBtn ? activeBtn.getAttribute('data-view') : '';
        if (!activeView || hiddenViews.has(activeView)) {
          var fallback = firstVisibleView();
          navButtons().forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-view') === fallback);
          });
          setMainView(fallback);
        }
      } catch (_) {
        // Ignore config load failures and keep default menu behavior.
      }
    }

    loginSubmitBtn.addEventListener('click', () => { submitLogin().catch(() => {}); });
    refreshDataBtn.addEventListener('click', () => {
      loadAll().catch(() => {});
    });
    disconnectBtn.addEventListener('click', () => {
      localStorage.removeItem('moja_admin_jwt');
      localStorage.removeItem('moja_admin_api_key');
      apiKeyInput.value = '';
      adminPassword.value = '';
      isConnected = false;
      updateConnectionUi();
      showDashboard(false);
      setLoginStatus('Signed out.');
    });
    authTabKey.addEventListener('click', () => setAuthTab('key'));
    authTabJwt.addEventListener('click', () => setAuthTab('jwt'));
    [apiKeyInput, adminEmail, adminPassword].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitLogin().catch(() => {});
        }
      });
    });
    document.getElementById('customersBody').addEventListener('click', (e) => {
      const btn = e.target.closest('.edit-member-btn');
      if (!btn) return;
      e.preventDefault();
      openEditMemberModal(btn.getAttribute('data-id'));
    });
    document.getElementById('editMemberBackdrop').addEventListener('click', closeEditMemberModal);
    document.getElementById('editMemberClose').addEventListener('click', closeEditMemberModal);
    document.getElementById('editMemberCancel').addEventListener('click', closeEditMemberModal);
    document.getElementById('editMemberForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveEditMember().catch((err) => { statusPanel.textContent = err.message; });
    });
    document.getElementById('editMemberSave').addEventListener('click', () => saveEditMember().catch((e) => { statusPanel.textContent = e.message; }));
    (function () {
      var setPinBtn = document.getElementById('emSetPinBtn');
      if (!setPinBtn) return;
      setPinBtn.addEventListener('click', async function () {
        var id = document.getElementById('emId').value;
        var out = document.getElementById('emSetPinResult');
        if (!id) return;
        if (!window.confirm('Generate a new login PIN for this member? This replaces any existing PIN.')) return;
        setPinBtn.disabled = true;
        try {
          var res = await apiPost('/admin/customers/' + encodeURIComponent(id) + '/login-pin', {});
          var pinStatus = document.getElementById('emPinStatus');
          if (pinStatus) pinStatus.textContent = 'A login PIN is set.';
          if (out) {
            out.style.display = 'block';
            out.style.color = '#0f172a';
            out.innerHTML =
              'New login PIN: <strong style="font-size:18px;letter-spacing:2px">' + fmt(res && res.pin) + '</strong>' +
              '<div style="font-size:13px;color:var(--text-muted,#475569);margin-top:6px">Give this PIN to the member. They log in by entering their phone number, then this PIN — no OTP needed. Shown once.</div>';
          }
        } catch (e) {
          if (out) { out.style.display = 'block'; out.style.color = '#b91c1c'; out.textContent = e.message || String(e); }
        } finally {
          setPinBtn.disabled = false;
        }
      });
    })();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dashboardApp.classList.contains('hidden')) {
        adminPassword.value = '';
      }
      if (e.key === 'Escape' && !document.getElementById('editMemberModal').classList.contains('hidden')) {
        closeEditMemberModal();
      }
      var scModalEl = document.getElementById('scModal');
      if (e.key === 'Escape' && scModalEl && !scModalEl.classList.contains('hidden')) {
        closeScModal();
      }
      var bentoSchedModalEsc = document.getElementById('bentoSchedModal');
      if (e.key === 'Escape' && bentoSchedModalEsc && !bentoSchedModalEsc.classList.contains('hidden')) {
        bentoCloseSchedModal();
      }
    });
    document.getElementById('refreshCustomersBtn').addEventListener('click', () => loadCustomers().catch((e) => { statusPanel.textContent = e.message; }));
    var exportCustomersBtn = document.getElementById('exportCustomersBtn');
    if (exportCustomersBtn) {
      exportCustomersBtn.addEventListener('click', function () {
        exportCustomersCsv().catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    var reportingSaveBtn = document.getElementById('reportingSaveBtn');
    if (reportingSaveBtn) {
      reportingSaveBtn.addEventListener('click', function () {
        saveReportingSettings(false).catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    var reportingClearBtn = document.getElementById('reportingClearBtn');
    if (reportingClearBtn) {
      reportingClearBtn.addEventListener('click', function () {
        saveReportingSettings(true).catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    var demoModeSaveBtn = document.getElementById('demoModeSaveBtn');
    if (demoModeSaveBtn) {
      demoModeSaveBtn.addEventListener('click', function () {
        saveDemoModeSetting().catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    // Any filter/sort change jumps back to page 1 and reloads.
    function reloadCustomersFromPageOne() {
      customerPage = 1;
      loadCustomers().catch((e) => { statusPanel.textContent = e.message; });
    }
    ['customerSortBy', 'customerSortDir', 'customerStatusFilter', 'customerPageSize'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', reloadCustomersFromPageOne);
    });
    const customerHasVoucherEl = document.getElementById('customerHasVoucher');
    if (customerHasVoucherEl) customerHasVoucherEl.addEventListener('change', reloadCustomersFromPageOne);
    ['customerSearch', 'customerTierFilter', 'customerSourceFilter', 'customerTagFilter'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); reloadCustomersFromPageOne(); }
      });
    });
    const customerSearchBtn = document.getElementById('customerSearchBtn');
    if (customerSearchBtn) customerSearchBtn.addEventListener('click', reloadCustomersFromPageOne);
    const customerClearBtn = document.getElementById('customerClearBtn');
    if (customerClearBtn) {
      customerClearBtn.addEventListener('click', function () {
        ['customerSearch', 'customerTierFilter', 'customerSourceFilter', 'customerTagFilter'].forEach(function (id) {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        const st = document.getElementById('customerStatusFilter');
        if (st) st.value = '';
        const hv = document.getElementById('customerHasVoucher');
        if (hv) hv.checked = false;
        reloadCustomersFromPageOne();
      });
    }
    const customersPrevBtn = document.getElementById('customersPrevBtn');
    if (customersPrevBtn) {
      customersPrevBtn.addEventListener('click', function () {
        if (customerPage > 1) { customerPage -= 1; loadCustomers().catch((e) => { statusPanel.textContent = e.message; }); }
      });
    }
    const customersNextBtn = document.getElementById('customersNextBtn');
    if (customersNextBtn) {
      customersNextBtn.addEventListener('click', function () {
        customerPage += 1;
        loadCustomers().catch((e) => { statusPanel.textContent = e.message; });
      });
    }
    ;['mkDashSpenderPeriod', 'mkRpSpenderPeriod'].forEach(function (sid) {
      const sel = document.getElementById(sid);
      if (!sel) return;
      sel.addEventListener('change', function () {
        const scope = sid === 'mkDashSpenderPeriod' ? 'mkDash' : 'mkRp';
        const m = scope === 'mkDash' ? lastDashMarketing : lastRpMarketing;
        paintSpenderPeriod(scope, m, sel.value);
      });
    });
    document.getElementById('refreshLoyaltyBtn').addEventListener('click', () => loadLoyalty().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshWalletLedgerBtn').addEventListener('click', () => loadWalletLedger().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshAuditBtn').addEventListener('click', () => loadAudit().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshLoginAuditBtn').addEventListener('click', () => loadLoginAudit().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshCampaignSegmentsBtn').addEventListener('click', () => loadCampaignSegments().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshCampaignHistoryBtn').addEventListener('click', () => loadCampaignHistory().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshCampaignVoucherInsightsBtn').addEventListener('click', () => {
      loadCampaignVoucherInsights().catch((e) => {
        statusPanel.textContent = e.message;
        document.getElementById('cpvRunResult').textContent = e.message;
      });
    });
    document.getElementById('runCampaignPushVoucherBtn').addEventListener('click', () => {
      const out = document.getElementById('cpvRunResult');
      out.textContent = 'Running campaign…';
      runCampaignPushVoucher()
        .then((res) => {
          if (res.status === 'PENDING' && res.runId) {
            out.textContent = 'Campaign queued (run ' + fmt(res.runId) + '). Processing…';
            return pollCampaignRunStatus(res.runId).then((final) => {
              out.textContent = 'Done. Status: ' + fmt(final.status) + '. Matched: ' + fmt(final.matched) +
                ', processed: ' + fmt(final.processed) + ', succeeded: ' + fmt(final.succeeded) +
                ', failed: ' + fmt(final.failed) + ', duplicates skipped: ' + fmt(final.duplicatesSkipped) + '.';
              return Promise.all([loadCampaignVoucherInsights(), loadCampaignHistory()]);
            });
          }
          out.textContent = 'Done. Matched: ' + fmt(res.matched) + ', succeeded: ' + fmt(res.succeeded) +
            ', failed: ' + fmt(res.failed) + ', duplicates skipped: ' + fmt(res.duplicatesSkipped || 0) + '.';
          return Promise.all([loadCampaignVoucherInsights(), loadCampaignHistory()]);
        })
        .catch((e) => { out.textContent = e.message; });
    });
    document.getElementById('cpvStrategy').addEventListener('change', (e) => {
      const v = e.target.value;
      const birthday = document.getElementById('cpvUseBirthdayToday');
      const inactive = document.getElementById('cpvUseNotReturning');
      if (v === 'birthday') {
        birthday.checked = true;
        inactive.checked = false;
      } else if (v === 'reengagement') {
        birthday.checked = false;
        inactive.checked = true;
      } else if (v === 'all') {
        birthday.checked = false;
        inactive.checked = false;
      } else {
        birthday.checked = true;
        inactive.checked = true;
      }
    });
    document.getElementById('refreshImportHistoryBtn').addEventListener('click', () => loadImportHistory().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshExportJobsBtn').addEventListener('click', () => loadExportJobs().catch((e) => { statusPanel.textContent = e.message; }));

    function saBind(id, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    }
    saBind('saRefreshBtn', () => {
      loadSalesAnalytics().catch((e) => {
        statusPanel.textContent = e.message || String(e);
      });
    });
    const saCatEl = document.getElementById('saCategory');
    if (saCatEl) {
      saCatEl.addEventListener('change', function () {
        applySalesCategoryUi(saCatEl.value || 'cake');
      });
      applySalesCategoryUi(saCatEl.value || 'cake');
    }
    saBind('saPreset7', () => {
      const t = new Date();
      const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 6);
      const fe = document.getElementById('saFrom');
      const te = document.getElementById('saTo');
      if (fe) fe.value = saIsoDateUtc(start);
      if (te) te.value = saIsoDateUtc(end);
    });
    saBind('saPreset30', () => {
      const t = new Date();
      const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 29);
      const fe = document.getElementById('saFrom');
      const te = document.getElementById('saTo');
      if (fe) fe.value = saIsoDateUtc(start);
      if (te) te.value = saIsoDateUtc(end);
    });
    saBind('saPresetMtd', () => {
      const t = new Date();
      const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
      const fe = document.getElementById('saFrom');
      const te = document.getElementById('saTo');
      if (fe) fe.value = saIsoDateUtc(start);
      if (te) te.value = saIsoDateUtc(end);
    });
    saBind('saExportCsv', () => {
      const q = buildSalesAnalyticsQuery();
      if (!q) {
        statusPanel.textContent = 'Set from and to dates before exporting.';
        return;
      }
      apiDownload('/admin/reports/sales-analytics?' + q + '&format=csv', 'sales-analytics.csv').catch((e) => {
        statusPanel.textContent = e.message || String(e);
      });
    });
    saBind('saExportJson', () => {
      if (!lastSalesAnalytics) {
        statusPanel.textContent = 'Load sales analytics first (open tab and Apply).';
        return;
      }
      const blob = new Blob([JSON.stringify(lastSalesAnalytics, null, 2)], {
        type: 'application/json',
      });
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = 'sales-analytics.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);
      statusPanel.textContent = 'JSON export downloaded.';
    });

    const saKpiStripEl = document.getElementById('saKpiStrip');
    if (saKpiStripEl) {
      saKpiStripEl.addEventListener('click', function (e) {
        const card = e.target.closest('.sa-kpi-card');
        if (!card) return;
        const m = card.getAttribute('data-sa-metric');
        if (!m) return;
        saChartMetric = m;
        refreshSalesViz();
      });
    }
    const saChartStyleEl = document.getElementById('saChartStyle');
    if (saChartStyleEl) {
      saChartStyleEl.addEventListener('change', function () {
        refreshSalesViz();
      });
    }

    // ---- Finance (consolidated cross-channel) -------------------------------

    const FIN_CHANNELS = [
      { key: 'pos', field: 'posRevenueCents', label: 'In-store POS', color: '#38bdf8' },
      { key: 'online_shop', field: 'onlineShopRevenueCents', label: 'Online shop', color: '#a78bfa' },
      { key: 'bento', field: 'bentoRevenueCents', label: 'Bento', color: '#34d399' },
    ];
    let lastFinanceOverview = null;
    let ftPage = 1;

    function finChannelLabel(key) {
      const c = FIN_CHANNELS.find(function (x) { return x.key === key; });
      return c ? c.label : key;
    }

    function finRm(cents) {
      return 'RM ' + moneyFromCents(cents);
    }

    function finPct(p) {
      if (p === null || p === undefined) return 'no prior data';
      const v = Math.round(p * 1000) / 10;
      return (v >= 0 ? '▲ +' : '▼ ') + v + '% vs previous period';
    }

    function finSetDates(startDaysAgo, monthToDate) {
      const t = new Date();
      const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
      const start = monthToDate
        ? new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))
        : new Date(end);
      if (!monthToDate) start.setUTCDate(start.getUTCDate() - startDaysAgo);
      const fe = document.getElementById('finFrom');
      const te = document.getElementById('finTo');
      if (fe) fe.value = saIsoDateUtc(start);
      if (te) te.value = saIsoDateUtc(end);
    }

    function finRangeQuery(fromId, toId) {
      const fromStr = document.getElementById(fromId).value;
      const toStr = document.getElementById(toId).value;
      if (!fromStr || !toStr) return null;
      const toEnd = new Date(toStr + 'T00:00:00.000Z');
      toEnd.setUTCDate(toEnd.getUTCDate() + 1);
      return (
        'from=' + encodeURIComponent(fromStr + 'T00:00:00.000Z') +
        '&to=' + encodeURIComponent(toEnd.toISOString())
      );
    }

    async function loadFinanceOverview() {
      const base = finRangeQuery('finFrom', 'finTo');
      if (!base) {
        statusPanel.textContent = 'Set from and to dates first.';
        return;
      }
      const bucket = document.getElementById('finBucket').value || 'day';
      statusPanel.textContent = 'Loading finance overview…';
      const data = await api('/admin/reports/finance-overview?' + base + '&bucket=' + bucket);
      lastFinanceOverview = data;

      document.getElementById('finValRevenue').textContent = finRm(data.totals.revenueCents);
      document.getElementById('finDeltaRevenue').textContent = finPct(data.deltas.revenuePct);
      document.getElementById('finValOrders').textContent = fmt(data.totals.orders);
      document.getElementById('finDeltaOrders').textContent = finPct(data.deltas.ordersPct);
      document.getElementById('finValAov').textContent = finRm(data.totals.averageOrderValueCents);
      document.getElementById('finValRefunds').textContent = finRm(data.totals.refundsCents);
      document.getElementById('finRefundsDetail').textContent =
        data.refunds.posCount + ' POS · ' + data.refunds.bentoCount + ' bento';
      document.getElementById('finValNet').textContent = finRm(data.totals.netRevenueCents);

      const chBody = document.getElementById('finChannelBody');
      chBody.innerHTML = data.byChannel.length
        ? data.byChannel
            .map(function (c) {
              return (
                '<tr><td>' + finChannelLabel(c.channel) + '</td><td>' + finRm(c.revenueCents) +
                '</td><td>' + fmt(c.orders) + '</td><td>' + finRm(c.averageOrderValueCents) +
                '</td><td>' + (c.refundsCents ? finRm(c.refundsCents) : '—') + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="5">No data.</td></tr>';

      const pmBody = document.getElementById('finMethodsBody');
      pmBody.innerHTML = data.paymentMethods.length
        ? data.paymentMethods
            .map(function (m) {
              return (
                '<tr><td>' + emEscapeHtml(m.method) + '</td><td>' + finRm(m.revenueCents) +
                '</td><td>' + fmt(m.count) + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="3">No transactions in range.</td></tr>';

      const topBody = document.getElementById('finTopBody');
      topBody.innerHTML = data.topProducts.length
        ? data.topProducts
            .map(function (p) {
              return (
                '<tr><td>' + finChannelLabel(p.channel) + '</td><td>' + emEscapeHtml(p.name) +
                '</td><td>' + emEscapeHtml(p.productId) + '</td><td>' + fmt(p.qtySold) +
                '</td><td>' + finRm(p.revenueCents) + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="5">No products sold in range.</td></tr>';

      paintFinanceChart();
      document.getElementById('finOverviewHint').textContent =
        'Range ' + data.meta.from.slice(0, 10) + ' → ' + data.meta.to.slice(0, 10) +
        ' vs previous ' + data.meta.previousFrom.slice(0, 10) + ' → ' + data.meta.previousTo.slice(0, 10) +
        ' · generated ' + data.meta.generatedAt.slice(11, 19) + ' UTC';
      statusPanel.textContent = 'Finance overview loaded.';
    }

    function paintFinanceChart() {
      const wrap = document.getElementById('finChannelChart');
      const legendEl = document.getElementById('finChartLegend');
      if (!wrap) return;
      const arr = (lastFinanceOverview && lastFinanceOverview.series) || [];

      if (legendEl) {
        legendEl.innerHTML = FIN_CHANNELS.map(function (c) {
          return (
            '<span style="display:inline-flex;align-items:center;gap:5px;margin-left:12px;font-size:12px">' +
            '<span style="width:10px;height:10px;border-radius:2px;background:' + c.color + '"></span>' +
            c.label + '</span>'
          );
        }).join('');
      }

      if (!arr.length) {
        wrap.innerHTML =
          '<p class="muted-hint" style="margin:0;padding:48px 16px;text-align:center">No revenue in this range.</p>';
        return;
      }

      const W = 880;
      const H = 260;
      const padL = 58;
      const padR = 20;
      const padT = 16;
      const padB = 44;
      const iw = W - padL - padR;
      const ih = H - padT - padB;
      const n = arr.length;
      const totals = arr.map(function (s) { return Number(s.totalRevenueCents) || 0; });
      const maxV = Math.max(1, ...totals) * 1.06;
      const slot = iw / n;
      const barW = Math.max(3, Math.min(48, slot * 0.62));

      let gridAndLabels = '';
      const yTicks = 5;
      for (let t = 0; t <= yTicks; t += 1) {
        const frac = t / yTicks;
        const y = padT + ih * frac;
        gridAndLabels +=
          '<line class="sa-chart-grid" x1="' + padL + '" y1="' + y.toFixed(1) +
          '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" />' +
          '<text class="sa-chart-axis" x="' + (padL - 8) + '" y="' + (y + 4).toFixed(1) +
          '" text-anchor="end">' + moneyFromCents(Math.round(maxV * (1 - frac))) + '</text>';
      }

      let bars = '';
      let xLabels = '';
      const step = n <= 8 ? 1 : Math.ceil(n / 8);
      arr.forEach(function (s, i) {
        const xc = padL + slot * i + slot / 2;
        let yCursor = padT + ih;
        FIN_CHANNELS.forEach(function (c) {
          const v = Number(s[c.field]) || 0;
          if (v <= 0) return;
          const h = (ih * v) / maxV;
          yCursor -= h;
          const tip =
            String(s.periodStart || '').slice(0, 10) + ' · ' + c.label + ': RM ' + moneyFromCents(v) +
            ' (total RM ' + moneyFromCents(s.totalRevenueCents) + ')';
          bars +=
            '<rect x="' + (xc - barW / 2).toFixed(1) + '" y="' + yCursor.toFixed(1) +
            '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) +
            '" fill="' + c.color + '" rx="1.5"><title>' + tip + '</title></rect>';
        });
        if (i % step === 0 || i === n - 1) {
          xLabels +=
            '<text class="sa-chart-axis" x="' + xc.toFixed(1) + '" y="' + (H - 12) +
            '" text-anchor="middle">' + String(s.periodStart || '').slice(5, 10) + '</text>';
        }
      });

      wrap.innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">' +
        gridAndLabels + bars + xLabels + '</svg>';
    }

    function ftBuildQuery() {
      const base = finRangeQuery('ftFrom', 'ftTo');
      if (!base) return null;
      let q = base + '&page=' + ftPage + '&pageSize=50';
      const ch = document.getElementById('ftChannel').value;
      if (ch) q += '&channel=' + encodeURIComponent(ch);
      const minRm = parseFloat(document.getElementById('ftMinRm').value);
      if (Number.isFinite(minRm)) q += '&minAmountCents=' + Math.round(minRm * 100);
      const maxRm = parseFloat(document.getElementById('ftMaxRm').value);
      if (Number.isFinite(maxRm)) q += '&maxAmountCents=' + Math.round(maxRm * 100);
      return q;
    }

    async function loadFinanceTransactions() {
      const q = ftBuildQuery();
      if (!q) {
        statusPanel.textContent = 'Set from and to dates first.';
        return;
      }
      statusPanel.textContent = 'Loading transactions…';
      const data = await api('/admin/reports/transactions?' + q);
      const tb = document.getElementById('ftBody');
      tb.innerHTML = data.transactions.length
        ? data.transactions
            .map(function (t) {
              return (
                '<tr><td>' + finChannelLabel(t.channel) + '</td><td>' +
                t.occurredAt.slice(0, 16).replace('T', ' ') + '</td><td>' + finRm(t.amountCents) +
                '</td><td>' + fmt(t.paymentMethod) + '</td><td>' + fmt(t.reference) +
                '</td><td>' + fmt(t.customerName) + '</td><td>' + fmt(t.customerPhone) + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="7">No transactions match these filters.</td></tr>';
      document.getElementById('ftSummary').innerHTML =
        '<strong>Filtered total:</strong> ' + finRm(data.totalsInFilter.amountCents) +
        ' across ' + fmt(data.totalsInFilter.count) + ' transaction(s)';
      document.getElementById('ftPageInfo').textContent =
        'Page ' + data.meta.page + ' of ' + Math.max(1, data.meta.totalPages) +
        ' · ' + data.meta.total + ' rows';
      const prev = document.getElementById('ftPrevBtn');
      const next = document.getElementById('ftNextBtn');
      if (prev) prev.disabled = data.meta.page <= 1;
      if (next) next.disabled = data.meta.page >= data.meta.totalPages;
      statusPanel.textContent = 'Transactions loaded.';
    }

    async function loadFinanceDaily() {
      const dce = document.getElementById('fdDate');
      if (!dce || !dce.value) return;
      statusPanel.textContent = 'Loading daily close…';
      const data = await api('/admin/reports/daily-commerce?date=' + encodeURIComponent(dce.value));
      const ch = data.channels || {};
      const setPair = function (valId, cntId, entry) {
        const e = entry || { orders: 0, gmvCents: 0 };
        document.getElementById(valId).textContent = finRm(e.gmvCents);
        document.getElementById(cntId).textContent = fmt(e.orders) + ' txns';
      };
      document.getElementById('fdValTotal').textContent = finRm(data.allChannelsGmvCents || 0);
      document.getElementById('fdCountTotal').textContent = fmt(data.allChannelsOrders || 0) + ' txns';
      setPair('fdValPos', 'fdCountPos', ch.pos);
      setPair('fdValOnline', 'fdCountOnline', ch.onlineShop);
      setPair('fdValBento', 'fdCountBento', ch.bento);
      document.getElementById('fdClosedBadge').textContent = data.closed
        ? 'Closed at ' + String(data.closedAt || '').slice(0, 16).replace('T', ' ') + ' UTC'
        : 'Day is still open';
      const items = data.items || [];
      document.getElementById('fdItemsBody').innerHTML = items.length
        ? items
            .map(function (r) {
              return (
                '<tr><td>' + emEscapeHtml(r.name) + '</td><td>' + emEscapeHtml(r.productId) +
                '</td><td>' + fmt(r.qtySold) + '</td><td>' + finRm(r.revenueCents) + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="4">No completed online orders this day.</td></tr>';
      statusPanel.textContent = 'Daily close loaded.';
    }

    function fsAgo(iso) {
      if (!iso) return 'never';
      const ms = Date.now() - new Date(iso).getTime();
      if (!Number.isFinite(ms) || ms < 0) return iso.slice(0, 16).replace('T', ' ');
      const mins = Math.floor(ms / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      const hrs = Math.floor(mins / 60);
      if (hrs < 48) return hrs + 'h ago';
      return Math.floor(hrs / 24) + 'd ago';
    }

    async function loadFinanceSync() {
      statusPanel.textContent = 'Loading POS sync health…';
      const d = await api('/admin/reports/pos/sync-health');
      document.getElementById('fsValConfigured').textContent = d.configured ? 'Configured' : 'Not configured';
      document.getElementById('fsFlagsDetail').textContent =
        'pull ' + (d.pullEnabled ? 'on' : 'off') + ' · reconcile ' + (d.reconcileEnabled ? 'on' : 'off');
      document.getElementById('fsValWebhook').textContent = fsAgo(d.lastWebhookAt);
      document.getElementById('fsValPull').textContent = fsAgo(d.lastPulledAt);
      document.getElementById('fsValToday').textContent = fmt(d.receiptsToday);
      document.getElementById('fsTodayDetail').textContent =
        d.unmatchedReceiptsToday + ' walk-in · ' + d.onlineSettlementReceiptsToday + ' online settlement';
      document.getElementById('fsValTotal').textContent = fmt(d.totalReceipts);
      document.getElementById('fsCreditsDetail').textContent = d.creditNotesToday + ' credit note(s) today';
      statusPanel.textContent = 'POS sync health loaded.';
    }

    function finRunPull(mode) {
      const out = document.getElementById('fsResult');
      out.textContent = (mode === 'backfill' ? 'Backfill' : 'Reconcile') + ' running… this can take a while.';
      apiPost('/admin/reports/pos/pull', { mode: mode })
        .then(function (r) {
          const rc = r.receipts || {};
          const cn = r.creditNotes || {};
          out.textContent =
            'Receipts: ' + (rc.itemsIngested || 0) + ' new of ' + (rc.itemsSeen || 0) + ' seen (' +
            (rc.stoppedReason || '-') + ') · Credit notes: ' + (cn.itemsIngested || 0) + ' new of ' +
            (cn.itemsSeen || 0) + ' seen (' + (cn.stoppedReason || '-') + ')';
          return loadFinanceSync();
        })
        .catch(function (e) {
          out.textContent = e.message || String(e);
        });
    }

    saBind('finRefreshBtn', function () {
      loadFinanceOverview().catch(function (e) { statusPanel.textContent = e.message || String(e); });
    });
    saBind('finPreset7', function () { finSetDates(6, false); });
    saBind('finPreset30', function () { finSetDates(29, false); });
    saBind('finPresetMtd', function () { finSetDates(0, true); });
    saBind('ftRefreshBtn', function () {
      ftPage = 1;
      loadFinanceTransactions().catch(function (e) { statusPanel.textContent = e.message || String(e); });
    });
    saBind('ftPrevBtn', function () {
      if (ftPage > 1) {
        ftPage -= 1;
        loadFinanceTransactions().catch(function (e) { statusPanel.textContent = e.message || String(e); });
      }
    });
    saBind('ftNextBtn', function () {
      ftPage += 1;
      loadFinanceTransactions().catch(function (e) { statusPanel.textContent = e.message || String(e); });
    });
    saBind('ftExportCsv', function () {
      const q = ftBuildQuery();
      if (!q) {
        statusPanel.textContent = 'Set from and to dates before exporting.';
        return;
      }
      apiDownload('/admin/reports/transactions?' + q + '&format=csv', 'transactions.csv').catch(function (e) {
        statusPanel.textContent = e.message || String(e);
      });
    });
    saBind('fdLoadBtn', function () {
      loadFinanceDaily().catch(function (e) { statusPanel.textContent = e.message || String(e); });
    });
    saBind('fdCloseBtn', function () {
      const dce = document.getElementById('fdDate');
      const out = document.getElementById('fdResult');
      if (!dce || !dce.value) {
        statusPanel.textContent = 'Pick a business date first.';
        return;
      }
      apiPost('/admin/reports/daily-commerce/close', { date: dce.value })
        .then(function (r) {
          out.textContent = r.alreadyClosed
            ? 'Day was already closed at ' + r.closedAt + '.'
            : 'Day closed at ' + r.closedAt + '.';
          return loadFinanceDaily();
        })
        .catch(function (e) { out.textContent = e.message || String(e); });
    });
    saBind('fsRefreshBtn', function () {
      loadFinanceSync().catch(function (e) { statusPanel.textContent = e.message || String(e); });
    });
    saBind('fsPullBtn', function () { finRunPull('reconcile'); });
    saBind('fsBackfillBtn', function () { finRunPull('backfill'); });

    document.querySelectorAll('.template-dl-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-kind');
        const status = document.getElementById('templateDownloadStatus');
        status.textContent = 'Downloading template…';
        apiDownload('/admin/import/templates/' + encodeURIComponent(kind), 'template_' + String(kind || '').toLowerCase() + '.csv')
          .then(() => { status.textContent = 'Template downloaded.'; })
          .catch((e) => { status.textContent = e.message; });
      });
    });

    document.getElementById('oqRefreshBtn').addEventListener('click', () => {
      loadCommerceOrders().catch((e) => {
        statusPanel.textContent = e.message || String(e);
      });
    });
    document.getElementById('dcLoadBtn').addEventListener('click', () => {
      loadDailyCommerceReport().catch((e) => {
        statusPanel.textContent = e.message || String(e);
      });
    });
    document.getElementById('dcCloseBtn').addEventListener('click', () => {
      const dce = document.getElementById('dcDate');
      const out = document.getElementById('dcResult');
      if (!dce || !dce.value) {
        statusPanel.textContent = 'Pick a business date first.';
        return;
      }
      if (out) out.textContent = 'Closing…';
      apiPost('/admin/reports/daily-commerce/close', { date: dce.value })
        .then(() => {
          if (out) out.textContent = 'Day marked closed.';
          return loadDailyCommerceReport();
        })
        .catch((e) => {
          if (out) out.textContent = e.message || String(e);
        });
    });
    document.getElementById('waSubmitBtn').addEventListener('click', () => {
      const customerId = document.getElementById('waCustomerId').value.trim();
      const type = document.getElementById('waType').value;
      const amountCents = parseInt(document.getElementById('waAmount').value, 10);
      const reason = document.getElementById('waReason').value.trim();
      const campaignCode = document.getElementById('waCampaign').value.trim();
      const out = document.getElementById('waResult');
      if (!customerId || !reason || !Number.isFinite(amountCents)) {
        out.textContent = 'Customer ID, amount, and reason are required.';
        return;
      }
      out.textContent = 'Submitting…';
      const body = { type, amountCents, reason };
      if (campaignCode) body.campaignCode = campaignCode;
      apiPost('/admin/customers/' + encodeURIComponent(customerId) + '/wallet/adjustments', body)
        .then((res) => {
          out.textContent = 'OK. New balance (cents): ' + fmt(res.summary?.currentWalletBalance);
          return loadWalletLedger();
        })
        .catch((e) => { out.textContent = e.message; });
    });

    var refreshVrhSeriesBtn = document.getElementById('refreshVrhSeriesBtn');
    if (refreshVrhSeriesBtn) {
      refreshVrhSeriesBtn.addEventListener('click', () => loadVouchers().catch((e) => { statusPanel.textContent = e.message; }));
    }
    var refreshPerksCampaignRulesBtnEl = document.getElementById('refreshPerksCampaignRulesBtn');
    if (refreshPerksCampaignRulesBtnEl) refreshPerksCampaignRulesBtnEl.addEventListener('click', () => loadPerksCampaignRules().catch((e) => { statusPanel.textContent = e.message; }));
    var pcrProgramFilterEl = document.getElementById('pcrProgramFilter');
    if (pcrProgramFilterEl) {
      pcrProgramFilterEl.addEventListener('change', function () {
        paintPerksCampaignRulesTable();
      });
    }
    ['pcrCriteriaKind', 'pcrProgramKind'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () { pcrRefreshCriteriaHint(false); });
    });
    ['pcrEditCriteriaKind', 'pcrEditProgramKind'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () { pcrRefreshCriteriaHint(true); });
    });
    document.getElementById('refreshShopCatalogBtn').addEventListener('click', () => {
      loadShopCatalog().catch((e) => { statusPanel.textContent = e.message; });
      scRefreshSitesCatalogFileHint().catch(function () {});
    });
    // Shop catalog column sort (click header) + per-column filters.
    var scSortHeaders = document.querySelectorAll('th.sc-sortable');
    for (var scH = 0; scH < scSortHeaders.length; scH++) {
      scSortHeaders[scH].addEventListener('click', function () {
        var key = this.getAttribute('data-sort');
        if (!key) return;
        if (scTableState.sortKey === key) {
          scTableState.sortDir = scTableState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          scTableState.sortKey = key;
          scTableState.sortDir = 'asc';
        }
        renderShopCatalog();
      });
    }
    function scBindFilter(id, key) {
      var el = document.getElementById(id);
      if (!el) return;
      var ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, function () {
        scTableState.filters[key] = el.value || '';
        renderShopCatalog();
      });
    }
    scBindFilter('scFilterName', 'name');
    scBindFilter('scFilterCategory', 'category');
    scBindFilter('scFilterPrice', 'price');
    scBindFilter('scFilterSort', 'sort');
    scBindFilter('scFilterVisible', 'visible');
    var refreshBentoMenuBtn = document.getElementById('refreshBentoMenuBtn');
    if (refreshBentoMenuBtn) {
      refreshBentoMenuBtn.addEventListener('click', function () {
        loadBentoMenu().catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.bentoMenuWeekBtn'), function (btn) {
      btn.addEventListener('click', function () {
        var wk = parseInt(btn.getAttribute('data-week'), 10) || 0;
        if (wk === bentoMenuWeek) return;
        bentoMenuWeek = wk;
        var imp = document.getElementById('bentoMenuImportResult');
        if (imp) imp.textContent = '';
        var sv = document.getElementById('bentoMenuSaveResult');
        if (sv) sv.textContent = '';
        renderBentoMenuWeekTabs();
        loadBentoMenu().catch(function (e) { statusPanel.textContent = e.message; });
      });
    });
    var bentoMenuSaveBtn = document.getElementById('bentoMenuSaveBtn');
    if (bentoMenuSaveBtn) {
      bentoMenuSaveBtn.addEventListener('click', function () {
        saveBentoMenu();
      });
    }
    var bentoMenuTemplateBtn = document.getElementById('bentoMenuTemplateBtn');
    if (bentoMenuTemplateBtn) {
      bentoMenuTemplateBtn.addEventListener('click', function () {
        downloadBentoMenuTemplate().catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    var bentoMenuImportBtn = document.getElementById('bentoMenuImportBtn');
    var bentoMenuImportFile = document.getElementById('bentoMenuImportFile');
    if (bentoMenuImportBtn && bentoMenuImportFile) {
      bentoMenuImportBtn.addEventListener('click', function () {
        bentoMenuImportFile.value = '';
        bentoMenuImportFile.click();
      });
      bentoMenuImportFile.addEventListener('change', function () {
        var file = bentoMenuImportFile.files && bentoMenuImportFile.files[0];
        if (file) importBentoMenuFile(file).catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    var bentoSettingsSaveBtn = document.getElementById('bentoSettingsSaveBtn');
    if (bentoSettingsSaveBtn) {
      bentoSettingsSaveBtn.addEventListener('click', function () {
        saveBentoSettings();
      });
    }
    var bentoFixSearchBtn = document.getElementById('bentoFixSearchBtn');
    if (bentoFixSearchBtn) {
      bentoFixSearchBtn.addEventListener('click', function () { bentoFixSearch(); });
    }
    var bentoFixPhoneEl = document.getElementById('bentoFixPhone');
    if (bentoFixPhoneEl) {
      bentoFixPhoneEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); bentoFixSearch(); }
      });
    }
    var bentoFixResultEl = document.getElementById('bentoFixResult');
    if (bentoFixResultEl) {
      bentoFixResultEl.addEventListener('click', function (e) {
        var actBtn = e.target.closest('.bento-fix-activate');
        if (actBtn) { bentoFixActivate(actBtn); return; }
        var cancelBtn = e.target.closest('.bento-fix-cancel');
        if (cancelBtn) { bentoFixCancel(cancelBtn); return; }
        var schedBtn = e.target.closest('.bento-fix-schedule');
        if (schedBtn) bentoFixOpenSchedule(schedBtn.getAttribute('data-id'));
      });
    }
    var bentoPackagesSaveBtn = document.getElementById('bentoPackagesSaveBtn');
    if (bentoPackagesSaveBtn) {
      bentoPackagesSaveBtn.addEventListener('click', function () {
        saveBentoPackages();
      });
    }
    var refreshBentoPackagesBtn = document.getElementById('refreshBentoPackagesBtn');
    if (refreshBentoPackagesBtn) {
      refreshBentoPackagesBtn.addEventListener('click', function () {
        loadBentoPackages().catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    var refreshBentoVouchersBtn = document.getElementById('refreshBentoVouchersBtn');
    if (refreshBentoVouchersBtn) {
      refreshBentoVouchersBtn.addEventListener('click', function () {
        loadBentoVouchers().catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    var bentoVoucherCreateBtn = document.getElementById('bentoVoucherCreateBtn');
    if (bentoVoucherCreateBtn) {
      bentoVoucherCreateBtn.addEventListener('click', function () {
        createBentoVoucher();
      });
    }

    /* ===== Vouchers (campaign builder) & Gift rewards ===== */
    function vcEsc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    var VC_TEMPLATES = [
      { key: 'WELCOME', icon: '🎉', label: 'Welcome', type: 'FIXED_AMOUNT', amount: '5.00', validDays: '30', tnc: 'Welcome voucher for new members.' },
      { key: 'BIRTHDAY', icon: '🎂', label: 'Birthday', type: 'PERCENTAGE', percent: '15', validDays: '7', tnc: 'Birthday treat. Valid 7 days.' },
      { key: 'REFERRAL', icon: '👥', label: 'Referral', type: 'FIXED_AMOUNT', amount: '10.00', validDays: '60', tnc: 'Thanks for referring a friend!' },
      { key: 'WINBACK', icon: '🔄', label: 'Win-back', type: 'FIXED_AMOUNT', amount: '8.00', validDays: '14', tnc: 'We miss you! Come back for a treat.' },
      { key: 'SPEND_EARN', icon: '💰', label: 'Spend & Earn', type: 'PERCENTAGE', percent: '10', minSpend: '50.00', validDays: '30', tnc: 'Spend & earn reward. Min spend applies.' },
      { key: 'CUSTOM', icon: '✏️', label: 'Custom', type: 'FIXED_AMOUNT', amount: '', validDays: '30', tnc: '' }
    ];
    var VC_TRIGGERS = {
      WELCOME: { type: 'AUTO', criteria: 'NEW_MEMBER' },
      BIRTHDAY: { type: 'AUTO', criteria: 'BIRTHDAY' },
      REFERRAL: { type: 'AUTO', criteria: 'REFERRAL_COUNT', thresholdValue: 1 },
      WINBACK: { type: 'AUTO', criteria: 'INACTIVE_DAYS', thresholdValue: 30 },
      SPEND_EARN: { type: 'AUTO', criteria: 'MIN_PURCHASE', thresholdValue: 50 },
      CUSTOM: { type: 'MANUAL' }
    };
    var vcTemplatesRendered = false;
    function vcInitTemplates() {
      var grid = document.getElementById('vcTemplateGrid');
      if (!grid || vcTemplatesRendered) return;
      grid.innerHTML = VC_TEMPLATES.map(function (t) {
        return '<button type="button" class="btn-outline vc-template-card" data-vc-template="' + vcEsc(t.key) +
          '" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:12px;text-align:left;height:auto;cursor:pointer">' +
          '<span style="font-size:20px">' + t.icon + '</span>' +
          '<strong style="font-size:13px">' + vcEsc(t.label) + '</strong></button>';
      }).join('');
      grid.querySelectorAll('.vc-template-card').forEach(function (btn) {
        btn.addEventListener('click', function () {
          applyVcTemplate(btn.getAttribute('data-vc-template'));
          grid.querySelectorAll('.vc-template-card').forEach(function (b) {
            b.style.borderColor = '';
            b.style.background = '';
          });
          btn.style.borderColor = '#2563eb';
          btn.style.background = '#eff6ff';
        });
      });
      vcTemplatesRendered = true;
    }
    function vcSetVal(id, val) {
      var el = document.getElementById(id);
      if (el) el.value = val == null ? '' : val;
    }
    function applyVcTemplate(key) {
      var t = null;
      for (var i = 0; i < VC_TEMPLATES.length; i++) {
        if (VC_TEMPLATES[i].key === key) { t = VC_TEMPLATES[i]; break; }
      }
      if (!t) return;
      vcSetVal('vcTemplate', t.key);
      var typeSel = document.getElementById('vcType');
      if (typeSel) typeSel.value = t.type;
      vcSyncTypeInputs();
      vcSetVal('vcAmount', t.amount || '');
      vcSetVal('vcPercent', t.percent || '');
      vcSetVal('vcMinSpend', t.minSpend || '');
      vcSetVal('vcValidDays', t.validDays || '');
      vcSetVal('vcTnc', t.tnc || '');
      var nameEl = document.getElementById('vcName');
      if (nameEl && !nameEl.value && t.key !== 'CUSTOM') {
        nameEl.value = t.label + ' voucher';
      }
    }
    function vcSyncTypeInputs() {
      var typeSel = document.getElementById('vcType');
      var amountWrap = document.getElementById('vcAmountWrap');
      var percentWrap = document.getElementById('vcPercentWrap');
      var type = typeSel ? typeSel.value : 'FIXED_AMOUNT';
      var showPercent = type === 'PERCENTAGE';
      var showAmount = type === 'FIXED_AMOUNT' || type === 'DELIVERY_DISCOUNT';
      if (amountWrap) amountWrap.style.display = showAmount ? '' : 'none';
      if (percentWrap) percentWrap.style.display = showPercent ? '' : 'none';
    }
    function vcInitDates() {
      var startEl = document.getElementById('vcStart');
      if (startEl && !startEl.value) {
        startEl.value = new Date().toISOString().slice(0, 10);
      }
    }
    function vcNum(id) {
      var el = document.getElementById(id);
      if (!el) return null;
      var raw = String(el.value || '').trim();
      if (!raw) return null;
      var n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    function vcDiscountLabel(c) {
      if (c.discountDisplay) return c.discountDisplay;
      return c.voucherType || '';
    }
    function vcStatusBadge(status) {
      var color = status === 'active' ? '#16a34a'
        : status === 'scheduled' ? '#2563eb'
        : status === 'paused' ? '#64748b' : '#94a3b8';
      return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:' + color + '">' + vcEsc(status) + '</span>';
    }
    function vcShortDate(iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toISOString().slice(0, 10);
    }
    var lastVoucherCampaigns = [];
    async function loadVoucherCampaigns() {
      var data = await api('/admin/campaigns');
      lastVoucherCampaigns = Array.isArray(data) ? data : [];
      renderVoucherCampaigns();
    }
    function renderVoucherCampaigns() {
      var body = document.getElementById('voucherCampaignsBody');
      if (!body) return;
      if (!lastVoucherCampaigns.length) {
        body.innerHTML = '<tr><td colspan="7" class="muted-hint">No campaigns yet. Pick a template above to create your first one.</td></tr>';
        return;
      }
      body.innerHTML = lastVoucherCampaigns.map(function (c) {
        var issued = c.totalRedemptionCap
          ? (c.vouchersIssued + ' / ' + c.totalRedemptionCap)
          : String(c.vouchersIssued);
        var window = vcShortDate(c.startsAt) + ' → ' + (c.endsAt ? vcShortDate(c.endsAt) : 'open');
        var actions =
          '<button type="button" class="btn-outline vc-push-btn" data-id="' + vcEsc(c.id) + '" data-name="' + vcEsc(c.name) + '" style="padding:3px 8px;font-size:12px">Push</button> ' +
          '<button type="button" class="btn-outline vc-edit-btn" data-id="' + vcEsc(c.id) + '" style="padding:3px 8px;font-size:12px">Edit</button> ' +
          '<button type="button" class="btn-outline vc-del-btn" data-id="' + vcEsc(c.id) + '" data-name="' + vcEsc(c.name) + '" style="padding:3px 8px;font-size:12px;color:#dc2626;border-color:#fecaca">Delete</button>';
        return '<tr>' +
          '<td><code style="font-size:11px">' + vcEsc(c.code) + '</code></td>' +
          '<td>' + vcEsc(c.name) + '</td>' +
          '<td>' + vcEsc(vcDiscountLabel(c)) + '</td>' +
          '<td>' + vcEsc(issued) + '</td>' +
          '<td style="font-size:12px">' + vcEsc(window) + '</td>' +
          '<td style="text-align:center">' + vcStatusBadge(c.status) + '</td>' +
          '<td style="text-align:center;white-space:nowrap">' + actions + '</td>' +
          '</tr>';
      }).join('');
    }
    function vcCloseEdit() {
      var p = document.getElementById('vcEditPanel');
      if (p) p.style.display = 'none';
    }
    function vcCloseIssue() {
      var p = document.getElementById('vcIssuePanel');
      if (p) p.style.display = 'none';
    }
    async function vcOpenEdit(id) {
      vcCloseIssue();
      var out = document.getElementById('vcEditResult');
      if (out) out.textContent = 'Loading…';
      try {
        var c = await api('/admin/campaigns/' + encodeURIComponent(id));
        document.getElementById('vcEditId').value = c.id;
        var codeEl = document.getElementById('vcEditCode');
        if (codeEl) codeEl.textContent = c.code || '';
        vcSetVal('vcEditName', c.name || '');
        var actSel = document.getElementById('vcEditActive');
        if (actSel) actSel.value = c.isActive ? 'true' : 'false';
        var isPct = c.voucherType === 'PERCENTAGE';
        var aw = document.getElementById('vcEditAmountWrap');
        var pw = document.getElementById('vcEditPercentWrap');
        if (aw) aw.style.display = isPct ? 'none' : '';
        if (pw) pw.style.display = isPct ? '' : 'none';
        vcSetVal('vcEditAmount', c.fixedAmountOffRM != null ? c.fixedAmountOffRM : '');
        vcSetVal('vcEditPercent', c.percentageOff != null ? c.percentageOff : '');
        vcSetVal('vcEditMinSpend', c.minSpendRM != null ? c.minSpendRM : '');
        vcSetVal('vcEditValidDays', c.voucherValidDays != null ? c.voucherValidDays : '');
        vcSetVal('vcEditMaxIssued', c.totalRedemptionCap != null ? c.totalRedemptionCap : '');
        vcSetVal('vcEditTnc', c.tncText || '');
        document.getElementById('vcEditPanel').dataset.voucherType = c.voucherType || '';
        document.getElementById('vcEditPanel').style.display = '';
        if (out) out.textContent = '';
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function vcSaveEdit() {
      var out = document.getElementById('vcEditResult');
      if (out) out.textContent = 'Saving…';
      try {
        var id = document.getElementById('vcEditId').value;
        var panel = document.getElementById('vcEditPanel');
        var type = panel ? panel.dataset.voucherType : '';
        var payload = {
          name: String((document.getElementById('vcEditName') || {}).value || '').trim(),
          isActive: (document.getElementById('vcEditActive') || {}).value === 'true'
        };
        if (type === 'PERCENTAGE') {
          var pct = vcNum('vcEditPercent');
          if (pct != null) payload.discountPercent = pct;
        } else {
          var amt = vcNum('vcEditAmount');
          if (amt != null) payload.discountAmountRM = amt;
        }
        var ms = vcNum('vcEditMinSpend');
        if (ms != null) payload.minSpendRM = ms;
        var vd = vcNum('vcEditValidDays');
        if (vd != null) payload.voucherValidDays = Math.round(vd);
        var mx = vcNum('vcEditMaxIssued');
        if (mx != null) payload.maxTotalIssued = Math.round(mx);
        var tnc = String((document.getElementById('vcEditTnc') || {}).value || '').trim();
        payload.tncText = tnc;
        await apiPatch('/admin/campaigns/' + encodeURIComponent(id), payload);
        if (out) out.textContent = 'Saved.';
        vcCloseEdit();
        await loadVoucherCampaigns();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function vcDeleteCampaign(id, name) {
      if (!window.confirm('Delete campaign "' + name + '"? This cannot be undone.')) return;
      var out = document.getElementById('voucherCampaignsListResult');
      if (out) out.textContent = 'Deleting…';
      try {
        await apiDelete('/admin/campaigns/' + encodeURIComponent(id));
        if (out) out.textContent = 'Deleted.';
        await loadVoucherCampaigns();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    function vcOpenIssue(id, name) {
      vcCloseEdit();
      var panel = document.getElementById('vcIssuePanel');
      if (!panel) return;
      panel.dataset.campaignId = id;
      var nameEl = document.getElementById('vcIssueCampaignName');
      if (nameEl) nameEl.textContent = name || '';
      vcSetVal('vcIssuePhone', '');
      var out = document.getElementById('vcIssueResult');
      if (out) out.textContent = '';
      panel.style.display = '';
    }
    async function vcIssueOne() {
      var panel = document.getElementById('vcIssuePanel');
      var id = panel ? panel.dataset.campaignId : '';
      var out = document.getElementById('vcIssueResult');
      var phone = String((document.getElementById('vcIssuePhone') || {}).value || '').trim();
      if (!phone) { if (out) out.textContent = 'Enter a member phone.'; return; }
      if (out) out.textContent = 'Searching…';
      try {
        var res = await api('/admin/customers?search=' + encodeURIComponent(phone) + '&pageSize=5');
        var items = (res && res.items) || [];
        if (!items.length) throw new Error('No member found for that phone.');
        var match = items.find(function (m) { return (m.phoneE164 || '').replace(/\\D/g, '').indexOf(phone.replace(/\\D/g, '')) !== -1; }) || items[0];
        var issued = await apiPost('/admin/campaigns/' + encodeURIComponent(id) + '/issue/' + encodeURIComponent(match.id), { reason: 'admin_manual_issue' });
        if (out) out.textContent = 'Issued ' + (issued.code || 'voucher') + ' to ' + (match.displayName || match.phoneE164 || 'member') + '.';
        await loadVoucherCampaigns();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function vcIssueAll() {
      var panel = document.getElementById('vcIssuePanel');
      var id = panel ? panel.dataset.campaignId : '';
      var out = document.getElementById('vcIssueResult');
      if (!window.confirm('Issue this voucher to ALL active members?')) return;
      if (out) out.textContent = 'Issuing…';
      try {
        var res = await apiPost('/admin/campaigns/' + encodeURIComponent(id) + '/issue-all', { reason: 'admin_issue_all' });
        if (out) out.textContent = 'Issued ' + res.issued + ', skipped ' + res.skipped + ' (already had it), failed ' + res.failed + '.';
        await loadVoucherCampaigns();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function createVoucherCampaign() {
      var out = document.getElementById('vcCreateResult');
      if (out) out.textContent = 'Saving…';
      try {
        var template = String((document.getElementById('vcTemplate') || {}).value || 'CUSTOM');
        var name = String((document.getElementById('vcName') || {}).value || '').trim();
        var type = String((document.getElementById('vcType') || {}).value || 'FIXED_AMOUNT');
        var startRaw = String((document.getElementById('vcStart') || {}).value || '').trim();
        if (!name) throw new Error('Enter a voucher name.');
        if (!startRaw) throw new Error('Pick a "Valid from" date.');
        var payload = {
          template: template,
          name: name,
          voucherType: type,
          trigger: VC_TRIGGERS[template] || { type: 'MANUAL' },
          startsAt: new Date(startRaw).toISOString()
        };
        if (type === 'PERCENTAGE') {
          var pct = vcNum('vcPercent');
          if (pct == null) throw new Error('Enter a percentage.');
          payload.discountPercent = pct;
        } else if (type === 'FIXED_AMOUNT' || type === 'DELIVERY_DISCOUNT') {
          var amt = vcNum('vcAmount');
          if (amt == null && template !== 'CUSTOM') throw new Error('Enter an amount off.');
          if (amt != null) payload.discountAmountRM = amt;
        }
        var minSpend = vcNum('vcMinSpend');
        if (minSpend != null) payload.minSpendRM = minSpend;
        var endRaw = String((document.getElementById('vcEnd') || {}).value || '').trim();
        if (endRaw) payload.endsAt = new Date(endRaw).toISOString();
        var validDays = vcNum('vcValidDays');
        if (validDays != null) payload.voucherValidDays = Math.round(validDays);
        var maxIssued = vcNum('vcMaxIssued');
        if (maxIssued != null) payload.maxTotalIssued = Math.round(maxIssued);
        var tnc = String((document.getElementById('vcTnc') || {}).value || '').trim();
        if (tnc) payload.tncText = tnc;
        var created = await apiPost('/admin/campaigns', payload);
        if (out) out.textContent = 'Created campaign ' + (created.code || '') + '.';
        ['vcName', 'vcAmount', 'vcPercent', 'vcMinSpend', 'vcEnd', 'vcMaxIssued', 'vcTnc'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.value = '';
        });
        await loadVoucherCampaigns();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }

    var lastGiftRewards = [];
    var lastGrCampaignMap = {};
    async function loadGiftRewards() {
      var rewards = await api('/admin/rewards-workflow/reward-catalog');
      lastGiftRewards = Array.isArray(rewards) ? rewards : [];
      var campaigns = [];
      try { campaigns = await api('/admin/campaigns'); } catch (e) { campaigns = []; }
      lastGrCampaignMap = {};
      (campaigns || []).forEach(function (c) { lastGrCampaignMap[c.id] = c; });
      populateGrCampaigns(campaigns || []);
      renderGiftRewards();
    }
    function populateGrCampaigns(campaigns) {
      var sel = document.getElementById('grCampaign');
      if (!sel) return;
      var current = sel.value;
      sel.innerHTML = '<option value="">— select a campaign —</option>' +
        campaigns.map(function (c) {
          return '<option value="' + vcEsc(c.id) + '">' + vcEsc(c.name) + ' (' + vcEsc(c.code) + ')</option>';
        }).join('');
      if (current) sel.value = current;
    }
    function renderGiftRewards() {
      var body = document.getElementById('giftRewardsBody');
      if (!body) return;
      if (!lastGiftRewards.length) {
        body.innerHTML = '<tr><td colspan="6" class="muted-hint">No gift rewards yet. Create one above so members can spend points.</td></tr>';
        return;
      }
      body.innerHTML = lastGiftRewards.map(function (r) {
        var linked = r.voucherCampaignId && lastGrCampaignMap[r.voucherCampaignId]
          ? lastGrCampaignMap[r.voucherCampaignId].name
          : (r.voucherCampaignId ? 'Linked' : '—');
        var active = r.isActive
          ? '<span style="color:#16a34a;font-weight:600">Yes</span>'
          : '<span style="color:#94a3b8">No</span>';
        var actions =
          '<button type="button" class="btn-outline gr-edit-btn" data-id="' + vcEsc(r.id) + '" style="padding:3px 8px;font-size:12px">Edit</button> ' +
          '<button type="button" class="btn-outline gr-del-btn" data-id="' + vcEsc(r.id) + '" data-name="' + vcEsc(r.name) + '" style="padding:3px 8px;font-size:12px;color:#dc2626;border-color:#fecaca">Delete</button>';
        return '<tr>' +
          '<td>' + vcEsc(r.name) + '</td>' +
          '<td>' + vcEsc(String(r.pointsCost)) + '</td>' +
          '<td style="font-size:12px">' + vcEsc(r.rewardType) + '</td>' +
          '<td>' + vcEsc(linked) + '</td>' +
          '<td style="text-align:center">' + active + '</td>' +
          '<td style="text-align:center;white-space:nowrap">' + actions + '</td>' +
          '</tr>';
      }).join('');
    }
    function grCloseEdit() {
      var p = document.getElementById('grEditPanel');
      if (p) p.style.display = 'none';
    }
    function grOpenEdit(id) {
      var r = lastGiftRewards.find(function (x) { return x.id === id; });
      if (!r) return;
      document.getElementById('grEditId').value = r.id;
      vcSetVal('grEditName', r.name || '');
      vcSetVal('grEditPoints', r.pointsCost != null ? r.pointsCost : '');
      var actSel = document.getElementById('grEditActive');
      if (actSel) actSel.value = r.isActive ? 'true' : 'false';
      var campSel = document.getElementById('grEditCampaign');
      if (campSel) {
        campSel.innerHTML = '<option value="">— select a campaign —</option>' +
          Object.keys(lastGrCampaignMap).map(function (cid) {
            var c = lastGrCampaignMap[cid];
            return '<option value="' + vcEsc(c.id) + '">' + vcEsc(c.name) + ' (' + vcEsc(c.code) + ')</option>';
          }).join('');
        campSel.value = r.voucherCampaignId || '';
      }
      vcSetVal('grEditTnc', r.tncText || '');
      var out = document.getElementById('grEditResult');
      if (out) out.textContent = '';
      document.getElementById('grEditPanel').style.display = '';
    }
    async function grSaveEdit() {
      var out = document.getElementById('grEditResult');
      if (out) out.textContent = 'Saving…';
      try {
        var id = document.getElementById('grEditId').value;
        var points = parseInt(String((document.getElementById('grEditPoints') || {}).value || '').trim(), 10);
        var payload = {
          name: String((document.getElementById('grEditName') || {}).value || '').trim(),
          isActive: (document.getElementById('grEditActive') || {}).value === 'true',
          voucherCampaignId: String((document.getElementById('grEditCampaign') || {}).value || '').trim() || undefined,
          tncText: String((document.getElementById('grEditTnc') || {}).value || '').trim()
        };
        if (Number.isFinite(points) && points >= 0) payload.pointsCost = points;
        await apiPatch('/admin/rewards-workflow/reward-catalog/' + encodeURIComponent(id), payload);
        if (out) out.textContent = 'Saved.';
        grCloseEdit();
        await loadGiftRewards();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function grDeleteReward(id, name) {
      if (!window.confirm('Delete reward "' + name + '"? This cannot be undone.')) return;
      var out = document.getElementById('giftRewardsListResult');
      if (out) out.textContent = 'Deleting…';
      try {
        await apiDelete('/admin/rewards-workflow/reward-catalog/' + encodeURIComponent(id));
        if (out) out.textContent = 'Deleted.';
        await loadGiftRewards();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }

    var ivState = { page: 1, pageSize: 20, total: 0 };
    function ivVoucherStatusBadge(status) {
      var map = { ACTIVE: '#16a34a', USED: '#2563eb', LOCKED: '#d97706', EXPIRED: '#94a3b8', VOID: '#64748b' };
      var label = status === 'VOID' ? 'WITHDRAWN' : status;
      return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:' + (map[status] || '#94a3b8') + '">' + vcEsc(label) + '</span>';
    }
    function ivPopulateCampaignFilter() {
      var sel = document.getElementById('ivCampaign');
      if (!sel || !lastVoucherCampaigns.length) return;
      var current = sel.value;
      sel.innerHTML = '<option value="">All</option>' +
        lastVoucherCampaigns.map(function (c) {
          return '<option value="' + vcEsc(c.id) + '">' + vcEsc(c.name) + '</option>';
        }).join('');
      if (current) sel.value = current;
    }
    async function loadIssuedVouchers() {
      var body = document.getElementById('issuedVouchersBody');
      if (!body) return;
      ivPopulateCampaignFilter();
      var search = String((document.getElementById('ivSearch') || {}).value || '').trim();
      var status = String((document.getElementById('ivStatus') || {}).value || '');
      var campaignId = String((document.getElementById('ivCampaign') || {}).value || '');
      var qs = 'page=' + ivState.page + '&pageSize=' + ivState.pageSize;
      if (search) qs += '&search=' + encodeURIComponent(search);
      if (status) qs += '&status=' + encodeURIComponent(status);
      if (campaignId) qs += '&campaignId=' + encodeURIComponent(campaignId);
      var data = await api('/admin/campaigns/issued-vouchers?' + qs);
      ivState.total = data.total || 0;
      renderIssuedVouchers(data.items || []);
      var info = document.getElementById('ivPageInfo');
      var from = data.total ? ((ivState.page - 1) * ivState.pageSize + 1) : 0;
      var to = Math.min(ivState.page * ivState.pageSize, ivState.total);
      if (info) info.textContent = ivState.total ? (from + '–' + to + ' of ' + ivState.total) : 'No issued vouchers.';
    }
    function renderIssuedVouchers(items) {
      var body = document.getElementById('issuedVouchersBody');
      if (!body) return;
      if (!items.length) {
        body.innerHTML = '<tr><td colspan="8" class="muted-hint">No vouchers match.</td></tr>';
        return;
      }
      body.innerHTML = items.map(function (v) {
        var recipient = v.customer ? (v.customer.displayName || '—') : '—';
        var phone = v.customer ? (v.customer.phoneE164 || '') : '';
        var campaign = v.campaign ? v.campaign.name : '—';
        var usedExpiry = v.usedAt
          ? ('Used ' + vcShortDate(v.usedAt))
          : (v.expiresAt ? ('Expires ' + vcShortDate(v.expiresAt)) : '—');
        var canWithdraw = v.status !== 'USED' && v.status !== 'VOID';
        var action = canWithdraw
          ? '<button type="button" class="btn-outline iv-withdraw-btn" data-id="' + vcEsc(v.id) + '" data-code="' + vcEsc(v.code) + '" style="padding:3px 8px;font-size:12px;color:#dc2626;border-color:#fecaca">Withdraw</button>'
          : '<span class="muted-hint">—</span>';
        return '<tr>' +
          '<td><code style="font-size:11px">' + vcEsc(v.code) + '</code></td>' +
          '<td>' + vcEsc(recipient) + '</td>' +
          '<td style="font-size:12px">' + vcEsc(phone) + '</td>' +
          '<td>' + vcEsc(campaign) + '</td>' +
          '<td style="text-align:center">' + ivVoucherStatusBadge(v.status) + '</td>' +
          '<td style="font-size:12px">' + vcEsc(vcShortDate(v.issuedAt)) + '</td>' +
          '<td style="font-size:12px">' + vcEsc(usedExpiry) + '</td>' +
          '<td style="text-align:center">' + action + '</td>' +
          '</tr>';
      }).join('');
    }
    async function ivWithdraw(id, code) {
      if (!window.confirm('Withdraw voucher ' + code + '? The member will no longer be able to use it.')) return;
      var out = document.getElementById('ivResult');
      if (out) out.textContent = 'Withdrawing…';
      try {
        await apiPost('/admin/campaigns/vouchers/' + encodeURIComponent(id) + '/revoke', { reason: 'admin_withdraw' });
        if (out) out.textContent = 'Withdrawn ' + code + '.';
        await loadIssuedVouchers();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function vrFindMember() {
      var phone = String((document.getElementById('vrPhone') || {}).value || '').trim();
      var out = document.getElementById('vrFindResult');
      var panel = document.getElementById('vrMemberPanel');
      if (!phone) { if (out) out.textContent = 'Enter a member phone.'; return; }
      if (out) out.textContent = 'Searching…';
      if (panel) panel.style.display = 'none';
      try {
        var res = await api('/admin/customers?search=' + encodeURIComponent(phone) + '&pageSize=5');
        var items = (res && res.items) || [];
        if (!items.length) throw new Error('No member found for that phone.');
        var match = items.find(function (m) { return (m.phoneE164 || '').replace(/\D/g, '').indexOf(phone.replace(/\D/g, '')) !== -1; }) || items[0];
        if (out) out.textContent = '';
        var nameEl = document.getElementById('vrMemberName');
        if (nameEl) nameEl.textContent = match.displayName || match.phoneE164 || 'Member';
        if (panel) { panel.style.display = ''; panel.dataset.customerId = match.id; }
        await vrLoadVouchers(match.id);
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function vrLoadVouchers(customerId) {
      var body = document.getElementById('vrVouchersBody');
      var out = document.getElementById('vrVouchersResult');
      if (!body) return;
      body.innerHTML = '<tr><td colspan="6" class="muted-hint">Loading…</td></tr>';
      try {
        var items = await api('/admin/customers/' + encodeURIComponent(customerId) + '/vouchers/redeemable');
        if (!items || !items.length) {
          body.innerHTML = '<tr><td colspan="6" class="muted-hint">No redeemable vouchers.</td></tr>';
          if (out) out.textContent = '';
          return;
        }
        body.innerHTML = items.map(function (v) {
          var action = v.locked
            ? '<span class="muted-hint">Locked (online checkout)</span>'
            : '<button type="button" class="btn-primary vr-redeem-btn" data-id="' + vcEsc(v.id) + '" data-source="' + vcEsc(v.source) + '" data-code="' + vcEsc(v.code) + '" style="padding:3px 8px;font-size:12px">Redeem</button>';
          return '<tr>' +
            '<td><code style="font-size:11px">' + vcEsc(v.code) + '</code></td>' +
            '<td>' + vcEsc(v.title || '') + '</td>' +
            '<td>' + vcEsc(v.discountLabel || '') + '</td>' +
            '<td>' + (v.source === 'CATALOG' ? 'Catalog' : 'Campaign') + '</td>' +
            '<td style="font-size:12px">' + (v.expiresAt ? vcEsc(vcShortDate(v.expiresAt)) : '—') + '</td>' +
            '<td style="text-align:center">' + action + '</td>' +
            '</tr>';
        }).join('');
        if (out) out.textContent = '';
      } catch (e) {
        body.innerHTML = '<tr><td colspan="6" class="muted-hint">Error loading vouchers.</td></tr>';
        if (out) out.textContent = e.message || String(e);
      }
    }
    async function vrRedeem(voucherId, source, code) {
      var panel = document.getElementById('vrMemberPanel');
      var customerId = panel ? panel.dataset.customerId : '';
      if (!customerId) return;
      if (!window.confirm('Redeem voucher ' + code + ' now? This cannot be undone.')) return;
      var out = document.getElementById('vrVouchersResult');
      if (out) out.textContent = 'Redeeming…';
      try {
        await apiPost('/admin/customers/' + encodeURIComponent(customerId) + '/vouchers/' + encodeURIComponent(voucherId) + '/redeem', { source: source, reason: 'staff_instore_redeem' });
        if (out) out.textContent = 'Redeemed ' + code + '.';
        await vrLoadVouchers(customerId);
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }
    function grSyncType() {
      var typeSel = document.getElementById('grType');
      var wrap = document.getElementById('grCampaignWrap');
      if (!wrap) return;
      var isVoucher = !typeSel || typeSel.value === 'DISCOUNT_VOUCHER';
      wrap.style.display = isVoucher ? '' : 'none';
    }
    async function createGiftReward() {
      var out = document.getElementById('grCreateResult');
      if (out) out.textContent = 'Saving…';
      try {
        var name = String((document.getElementById('grName') || {}).value || '').trim();
        var pointsRaw = String((document.getElementById('grPoints') || {}).value || '').trim();
        var type = String((document.getElementById('grType') || {}).value || 'DISCOUNT_VOUCHER');
        var campaignId = String((document.getElementById('grCampaign') || {}).value || '').trim();
        var tnc = String((document.getElementById('grTnc') || {}).value || '').trim();
        if (!name) throw new Error('Enter a reward name.');
        var points = parseInt(pointsRaw, 10);
        if (!Number.isFinite(points) || points < 0) throw new Error('Enter a valid points cost.');
        if (type === 'DISCOUNT_VOUCHER' && !campaignId) throw new Error('Pick a voucher campaign to link.');
        var payload = {
          code: 'GIFT-' + Date.now().toString(36).toUpperCase(),
          name: name,
          rewardType: type,
          pointsCost: points
        };
        if (type === 'DISCOUNT_VOUCHER' && campaignId) payload.voucherCampaignId = campaignId;
        if (tnc) payload.tncText = tnc;
        await apiPost('/admin/rewards-workflow/reward-catalog', payload);
        if (out) out.textContent = 'Reward created.';
        ['grName', 'grPoints', 'grTnc'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.value = '';
        });
        await loadGiftRewards();
      } catch (e) {
        if (out) out.textContent = e.message || String(e);
      }
    }

    var refreshVoucherCampaignsBtn = document.getElementById('refreshVoucherCampaignsBtn');
    if (refreshVoucherCampaignsBtn) {
      refreshVoucherCampaignsBtn.addEventListener('click', function () {
        loadVoucherCampaigns().catch(function (e) { statusPanel.textContent = e.message || String(e); });
      });
    }
    var vcCreateBtn = document.getElementById('vcCreateBtn');
    if (vcCreateBtn) {
      vcCreateBtn.addEventListener('click', function () { createVoucherCampaign(); });
    }
    var vcTypeSel = document.getElementById('vcType');
    if (vcTypeSel) {
      vcTypeSel.addEventListener('change', vcSyncTypeInputs);
    }
    var refreshGiftRewardsBtn = document.getElementById('refreshGiftRewardsBtn');
    if (refreshGiftRewardsBtn) {
      refreshGiftRewardsBtn.addEventListener('click', function () {
        loadGiftRewards().catch(function (e) { statusPanel.textContent = e.message || String(e); });
      });
    }
    var grCreateBtn = document.getElementById('grCreateBtn');
    if (grCreateBtn) {
      grCreateBtn.addEventListener('click', function () { createGiftReward(); });
    }
    var grTypeSel = document.getElementById('grType');
    if (grTypeSel) {
      grTypeSel.addEventListener('change', grSyncType);
    }
    var voucherCampaignsBodyEl = document.getElementById('voucherCampaignsBody');
    if (voucherCampaignsBodyEl) {
      voucherCampaignsBodyEl.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var pushB = t.closest('.vc-push-btn');
        if (pushB) { vcOpenIssue(pushB.getAttribute('data-id'), pushB.getAttribute('data-name')); return; }
        var editB = t.closest('.vc-edit-btn');
        if (editB) { vcOpenEdit(editB.getAttribute('data-id')); return; }
        var delB = t.closest('.vc-del-btn');
        if (delB) { vcDeleteCampaign(delB.getAttribute('data-id'), delB.getAttribute('data-name')); return; }
      });
    }
    var vcEditSaveBtn = document.getElementById('vcEditSaveBtn');
    if (vcEditSaveBtn) vcEditSaveBtn.addEventListener('click', function () { vcSaveEdit(); });
    var vcEditCancelBtn = document.getElementById('vcEditCancelBtn');
    if (vcEditCancelBtn) vcEditCancelBtn.addEventListener('click', vcCloseEdit);
    var vcIssueOneBtn = document.getElementById('vcIssueOneBtn');
    if (vcIssueOneBtn) vcIssueOneBtn.addEventListener('click', function () { vcIssueOne(); });
    var vcIssueAllBtn = document.getElementById('vcIssueAllBtn');
    if (vcIssueAllBtn) vcIssueAllBtn.addEventListener('click', function () { vcIssueAll(); });
    var vcIssueCloseBtn = document.getElementById('vcIssueCloseBtn');
    if (vcIssueCloseBtn) vcIssueCloseBtn.addEventListener('click', vcCloseIssue);
    var ivRefreshBtn = document.getElementById('ivRefreshBtn');
    if (ivRefreshBtn) ivRefreshBtn.addEventListener('click', function () {
      ivState.page = 1;
      loadIssuedVouchers().catch(function (e) { statusPanel.textContent = e.message || String(e); });
    });
    var ivApplyBtn = document.getElementById('ivApplyBtn');
    if (ivApplyBtn) ivApplyBtn.addEventListener('click', function () {
      ivState.page = 1;
      loadIssuedVouchers().catch(function (e) { statusPanel.textContent = e.message || String(e); });
    });
    var ivSearchEl = document.getElementById('ivSearch');
    if (ivSearchEl) ivSearchEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ivState.page = 1; loadIssuedVouchers().catch(function () {}); }
    });
    var ivStatusEl = document.getElementById('ivStatus');
    if (ivStatusEl) ivStatusEl.addEventListener('change', function () {
      ivState.page = 1;
      loadIssuedVouchers().catch(function () {});
    });
    var ivCampaignEl = document.getElementById('ivCampaign');
    if (ivCampaignEl) ivCampaignEl.addEventListener('change', function () {
      ivState.page = 1;
      loadIssuedVouchers().catch(function () {});
    });
    var ivPrevBtn = document.getElementById('ivPrevBtn');
    if (ivPrevBtn) ivPrevBtn.addEventListener('click', function () {
      if (ivState.page > 1) { ivState.page--; loadIssuedVouchers().catch(function () {}); }
    });
    var ivNextBtn = document.getElementById('ivNextBtn');
    if (ivNextBtn) ivNextBtn.addEventListener('click', function () {
      if (ivState.page * ivState.pageSize < ivState.total) { ivState.page++; loadIssuedVouchers().catch(function () {}); }
    });
    var issuedVouchersBodyEl = document.getElementById('issuedVouchersBody');
    if (issuedVouchersBodyEl) issuedVouchersBodyEl.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var b = t.closest('.iv-withdraw-btn');
      if (b) ivWithdraw(b.getAttribute('data-id'), b.getAttribute('data-code'));
    });
    var vrFindBtn = document.getElementById('vrFindBtn');
    if (vrFindBtn) vrFindBtn.addEventListener('click', function () { vrFindMember(); });
    var vrPhoneEl = document.getElementById('vrPhone');
    if (vrPhoneEl) vrPhoneEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') vrFindMember();
    });
    var vrVouchersBodyEl = document.getElementById('vrVouchersBody');
    if (vrVouchersBodyEl) vrVouchersBodyEl.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var b = t.closest('.vr-redeem-btn');
      if (b) vrRedeem(b.getAttribute('data-id'), b.getAttribute('data-source'), b.getAttribute('data-code'));
    });
    var giftRewardsBodyEl = document.getElementById('giftRewardsBody');
    if (giftRewardsBodyEl) {
      giftRewardsBodyEl.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var editB = t.closest('.gr-edit-btn');
        if (editB) { grOpenEdit(editB.getAttribute('data-id')); return; }
        var delB = t.closest('.gr-del-btn');
        if (delB) { grDeleteReward(delB.getAttribute('data-id'), delB.getAttribute('data-name')); return; }
      });
    }
    var grEditSaveBtn = document.getElementById('grEditSaveBtn');
    if (grEditSaveBtn) grEditSaveBtn.addEventListener('click', function () { grSaveEdit(); });
    var grEditCancelBtn = document.getElementById('grEditCancelBtn');
    if (grEditCancelBtn) grEditCancelBtn.addEventListener('click', grCloseEdit);
    var bentoVouchersBody = document.getElementById('bentoVouchersBody');
    if (bentoVouchersBody) {
      bentoVouchersBody.addEventListener('change', function (ev) {
        var target = ev.target;
        if (!target || !target.classList || !target.classList.contains('bv-active')) return;
        var tr = target.closest('tr[data-voucher-id]');
        if (!tr) return;
        toggleBentoVoucherActive(tr.getAttribute('data-voucher-id'), target.checked);
      });
      bentoVouchersBody.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('button.bv-delete') : null;
        if (!btn) return;
        var tr = btn.closest('tr[data-voucher-id]');
        if (!tr) return;
        deleteBentoVoucher(tr.getAttribute('data-voucher-id'), btn.getAttribute('data-code') || 'this voucher');
      });
    }
    var bentoMenuBody = document.getElementById('bentoMenuBody');
    if (bentoMenuBody) {
      bentoMenuBody.addEventListener('change', function (e) {
        var cb = e.target;
        if (cb && cb.classList && cb.classList.contains('bm-closed')) {
          var tr = cb.closest('tr');
          if (!tr) return;
          var disabled = cb.checked;
          tr.querySelectorAll('.bm-input').forEach(function (inp) {
            inp.disabled = disabled;
            inp.placeholder = disabled ? 'Closed' : 'Dish name';
          });
        }
      });
    }
    var bentoOrdersPreviewBtn = document.getElementById('bentoOrdersPreviewBtn');
    if (bentoOrdersPreviewBtn) {
      bentoOrdersPreviewBtn.addEventListener('click', function () {
        previewBentoOrders().catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    var bentoOrdersExportBtn = document.getElementById('bentoOrdersExportBtn');
    if (bentoOrdersExportBtn) {
      bentoOrdersExportBtn.addEventListener('click', function () {
        exportBentoOrdersExcel().catch(function (e) { statusPanel.textContent = e.message; });
      });
    }
    var bentoAwaitBodyEl = document.getElementById('bentoAwaitBody');
    if (bentoAwaitBodyEl) {
      bentoAwaitBodyEl.addEventListener('change', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('bento-await-cb')) {
          var selAll = document.getElementById('bentoAwaitSelectAll');
          if (selAll) {
            var all = document.querySelectorAll('#bentoAwaitBody input.bento-await-cb');
            var checked = document.querySelectorAll('#bentoAwaitBody input.bento-await-cb:checked');
            selAll.checked = all.length > 0 && all.length === checked.length;
          }
          bentoAwaitSyncButtons();
        }
      });
      bentoAwaitBodyEl.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var refundBtn = e.target.closest('button.bento-await-refund');
        if (refundBtn) { bentoMarkRefunded(refundBtn); return; }
        var schedBtn = e.target.closest('button.bento-await-schedule');
        if (schedBtn) {
          var i = parseInt(schedBtn.getAttribute('data-i'), 10);
          if (!isNaN(i) && bentoAwaitRows[i]) bentoOpenSchedModal(bentoAwaitRows[i]);
        }
      });
    }
    var bentoSchedModalEl = document.getElementById('bentoSchedModal');
    if (bentoSchedModalEl) {
      document.getElementById('bentoSchedBackdrop').addEventListener('click', bentoCloseSchedModal);
      document.getElementById('bentoSchedClose').addEventListener('click', bentoCloseSchedModal);
      document.getElementById('bentoSchedCancel').addEventListener('click', bentoCloseSchedModal);
      document.getElementById('bentoSchedAddDay').addEventListener('click', function () {
        bentoSchedAddRow(bentoSchedTomorrowIso());
      });
      document.getElementById('bentoSchedSave').addEventListener('click', function () {
        bentoSchedSubmit().catch(function () {});
      });
      var bentoSchedOverrideEl = document.getElementById('bentoSchedOverrideLock');
      if (bentoSchedOverrideEl) {
        bentoSchedOverrideEl.addEventListener('change', bentoSchedSyncLockedRows);
      }
      var bentoSchedRowsEl = document.getElementById('bentoSchedRows');
      if (bentoSchedRowsEl) {
        bentoSchedRowsEl.addEventListener('click', function (e) {
          var rm = e.target && e.target.closest ? e.target.closest('button.bento-sched-remove') : null;
          if (!rm) return;
          var row = rm.closest('.bento-sched-row');
          if (row) row.parentNode.removeChild(row);
          bentoSchedUpdateTotals();
        });
        bentoSchedRowsEl.addEventListener('input', function (e) {
          if (e.target && e.target.classList &&
              (e.target.classList.contains('bento-sched-lunch') || e.target.classList.contains('bento-sched-dinner'))) {
            bentoSchedUpdateTotals();
          }
        });
      }
    }
    var bentoAwaitSelectAllEl = document.getElementById('bentoAwaitSelectAll');
    if (bentoAwaitSelectAllEl) {
      bentoAwaitSelectAllEl.addEventListener('change', function () {
        var on = bentoAwaitSelectAllEl.checked;
        document.querySelectorAll('#bentoAwaitBody input.bento-await-cb').forEach(function (b) { b.checked = on; });
        bentoAwaitSyncButtons();
      });
    }
    var bentoAwaitCopyWaEl = document.getElementById('bentoAwaitCopyWa');
    if (bentoAwaitCopyWaEl) bentoAwaitCopyWaEl.addEventListener('click', bentoCopyWaLinks);
    var bentoAwaitCopyPhonesEl = document.getElementById('bentoAwaitCopyPhones');
    if (bentoAwaitCopyPhonesEl) bentoAwaitCopyPhonesEl.addEventListener('click', bentoCopyPhones);
    function wireBentoRange(prefix, loader) {
      var refreshBtn = document.getElementById(prefix + 'RefreshBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', function () {
          loader().catch(function (e) { statusPanel.textContent = e.message; });
        });
      }
      var presets = [['Preset7', 7], ['Preset30', 30], ['PresetMtd', 'mtd']];
      presets.forEach(function (p) {
        var el = document.getElementById(prefix + p[0]);
        if (el) {
          el.addEventListener('click', function () {
            bentoRangePreset(prefix, p[1]);
            loader().catch(function (e) { statusPanel.textContent = e.message; });
          });
        }
      });
    }
    wireBentoRange('bo', loadBentoOverview);
    wireBentoRange('bs', loadBentoSales);
    var bsProgressSearchEl = document.getElementById('bsProgressSearch');
    if (bsProgressSearchEl) bsProgressSearchEl.addEventListener('input', renderBentoPickupProgress);
    var bsProgressShowArchivedEl = document.getElementById('bsProgressShowArchived');
    if (bsProgressShowArchivedEl) bsProgressShowArchivedEl.addEventListener('change', renderBentoPickupProgress);
    var bsProgressBodyEl = document.getElementById('bsProgressBody');
    if (bsProgressBodyEl) {
      bsProgressBodyEl.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.classList) return;
        if (t.classList.contains('bs-progress-archive')) bsProgressSetHidden(t, true);
        else if (t.classList.contains('bs-progress-restore')) bsProgressSetHidden(t, false);
      });
    }
    var scSitesCatalogSaveBtn = document.getElementById('scSitesCatalogSaveBtn');
    if (scSitesCatalogSaveBtn) {
      scSitesCatalogSaveBtn.addEventListener('click', function () {
        scSaveSitesCatalogFile().catch(function (e) {
          var out = document.getElementById('scSitesCatalogSaveResult');
          if (out) out.textContent = e.message;
        });
      });
    }
    document.getElementById('scSyncPreviewBtn').addEventListener('click', () => scSyncPreview().catch(function (e) {
      var out = document.getElementById('scSyncResult');
      if (out) out.textContent = e.message;
    }));
    document.getElementById('scSyncApplyBtn').addEventListener('click', () => scSyncApply().catch(function (e) {
      var out = document.getElementById('scSyncResult');
      if (out) out.textContent = e.message;
    }));

    (function wireShopLayoutHandlers() {
      const refreshBtn = document.getElementById('refreshShopLayoutBtn');
      if (refreshBtn) refreshBtn.addEventListener('click', function () {
        loadShopLayout().catch(function (e) { statusPanel.textContent = e.message; });
      });
      const saveBtn = document.getElementById('saveShopLayoutBtn');
      const saveResult = document.getElementById('shopLayoutSaveResult');
      if (saveBtn) saveBtn.addEventListener('click', async function () {
        if (shopLayoutEditingSectionIdx >= 0) slSyncSectionStateFromFields();
        if (saveResult) saveResult.textContent = 'Saving…';
        try {
          const layout = await apiPatch('/admin/shop-catalog/layout', {
            homeFeaturedProductIds: shopLayoutFeaturedIds,
            shopSections: shopLayoutSections,
          });
          shopLayoutFeaturedIds = Array.isArray(layout && layout.homeFeaturedProductIds)
            ? layout.homeFeaturedProductIds.slice()
            : shopLayoutFeaturedIds;
          shopLayoutSections = Array.isArray(layout && layout.shopSections)
            ? layout.shopSections.map(function (s) {
                return {
                  id: String(s.id || ''),
                  title: String(s.title || ''),
                  description: String(s.description || ''),
                  productIds: Array.isArray(s.productIds) ? s.productIds.slice() : [],
                };
              })
            : shopLayoutSections;
          refreshShopLayoutUi();
          if (saveResult) saveResult.textContent = 'Layout saved.';
        } catch (e) {
          if (saveResult) saveResult.textContent = 'Save failed: ' + (e && e.message ? e.message : 'unknown error');
        }
      });
      const featFilter = document.getElementById('slFeaturedFilter');
      if (featFilter) featFilter.addEventListener('input', function () { renderShopLayoutFeaturedAvailable(); });
      const secFilter = document.getElementById('slSectionFilter');
      if (secFilter) secFilter.addEventListener('input', function () { renderShopLayoutSectionProducts(); });
      ['slSectionId', 'slSectionTitle', 'slSectionDesc'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function () { slSyncSectionStateFromFields(); renderShopLayoutSections(); });
      });
      const featSel = document.getElementById('slFeaturedSelectedBody');
      if (featSel) featSel.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.dataset || !t.dataset.id) return;
        var id = t.dataset.id;
        var idx = shopLayoutFeaturedIds.indexOf(id);
        if (idx < 0) return;
        if (t.classList.contains('sl-feat-up-btn') && idx > 0) {
          var tmp = shopLayoutFeaturedIds[idx - 1];
          shopLayoutFeaturedIds[idx - 1] = shopLayoutFeaturedIds[idx];
          shopLayoutFeaturedIds[idx] = tmp;
          refreshShopLayoutFeaturedUi();
        } else if (t.classList.contains('sl-feat-down-btn') && idx < shopLayoutFeaturedIds.length - 1) {
          var tmp2 = shopLayoutFeaturedIds[idx + 1];
          shopLayoutFeaturedIds[idx + 1] = shopLayoutFeaturedIds[idx];
          shopLayoutFeaturedIds[idx] = tmp2;
          refreshShopLayoutFeaturedUi();
        } else if (t.classList.contains('sl-feat-remove-btn')) {
          shopLayoutFeaturedIds.splice(idx, 1);
          refreshShopLayoutFeaturedUi();
        }
      });
      const featAvail = document.getElementById('slFeaturedAvailableBody');
      if (featAvail) featAvail.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.classList.contains('sl-feat-add-btn') || !t.dataset.id) return;
        if (shopLayoutFeaturedIds.indexOf(t.dataset.id) !== -1) return;
        shopLayoutFeaturedIds.push(t.dataset.id);
        refreshShopLayoutFeaturedUi();
      });
      const secBody = document.getElementById('slSectionsBody');
      if (secBody) secBody.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || t.dataset.idx == null) return;
        var idx = parseInt(t.dataset.idx, 10);
        if (!Number.isFinite(idx) || idx < 0 || idx >= shopLayoutSections.length) return;
        if (t.classList.contains('sl-section-edit-btn')) {
          openShopLayoutSectionEditor(idx);
        } else if (t.classList.contains('sl-section-up-btn') && idx > 0) {
          var tmp = shopLayoutSections[idx - 1];
          shopLayoutSections[idx - 1] = shopLayoutSections[idx];
          shopLayoutSections[idx] = tmp;
          if (shopLayoutEditingSectionIdx === idx) shopLayoutEditingSectionIdx = idx - 1;
          else if (shopLayoutEditingSectionIdx === idx - 1) shopLayoutEditingSectionIdx = idx;
          refreshShopLayoutUi();
        } else if (t.classList.contains('sl-section-down-btn') && idx < shopLayoutSections.length - 1) {
          var tmp2 = shopLayoutSections[idx + 1];
          shopLayoutSections[idx + 1] = shopLayoutSections[idx];
          shopLayoutSections[idx] = tmp2;
          if (shopLayoutEditingSectionIdx === idx) shopLayoutEditingSectionIdx = idx + 1;
          else if (shopLayoutEditingSectionIdx === idx + 1) shopLayoutEditingSectionIdx = idx;
          refreshShopLayoutUi();
        } else if (t.classList.contains('sl-section-remove-btn')) {
          shopLayoutSections.splice(idx, 1);
          if (shopLayoutEditingSectionIdx === idx) {
            shopLayoutEditingSectionIdx = -1;
            document.getElementById('slSectionPanel').classList.add('hidden');
          } else if (shopLayoutEditingSectionIdx > idx) shopLayoutEditingSectionIdx -= 1;
          refreshShopLayoutUi();
        }
      });
      const addSecBtn = document.getElementById('slAddSectionBtn');
      if (addSecBtn) addSecBtn.addEventListener('click', function () {
        var n = shopLayoutSections.length + 1;
        shopLayoutSections.push({
          id: 'section-' + n,
          title: 'New section ' + n,
          description: '',
          productIds: [],
        });
        openShopLayoutSectionEditor(shopLayoutSections.length - 1);
        refreshShopLayoutUi();
      });
      const secSel = document.getElementById('slSectionSelectedBody');
      if (secSel) secSel.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.dataset || !t.dataset.id || shopLayoutEditingSectionIdx < 0) return;
        var section = shopLayoutSections[shopLayoutEditingSectionIdx];
        if (!section) return;
        var ids = section.productIds || [];
        var id = t.dataset.id;
        var idx = ids.indexOf(id);
        if (idx < 0) return;
        if (t.classList.contains('sl-sec-prod-up-btn') && idx > 0) {
          var tmp = ids[idx - 1];
          ids[idx - 1] = ids[idx];
          ids[idx] = tmp;
          renderShopLayoutSectionProducts();
        } else if (t.classList.contains('sl-sec-prod-down-btn') && idx < ids.length - 1) {
          var tmp2 = ids[idx + 1];
          ids[idx + 1] = ids[idx];
          ids[idx] = tmp2;
          renderShopLayoutSectionProducts();
        } else if (t.classList.contains('sl-sec-prod-remove-btn')) {
          ids.splice(idx, 1);
          renderShopLayoutSectionProducts();
        }
      });
      const secAvail = document.getElementById('slSectionAvailableBody');
      if (secAvail) secAvail.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.classList.contains('sl-sec-prod-add-btn') || !t.dataset.id || shopLayoutEditingSectionIdx < 0) return;
        var section = shopLayoutSections[shopLayoutEditingSectionIdx];
        if (!section) return;
        if (!Array.isArray(section.productIds)) section.productIds = [];
        if (section.productIds.indexOf(t.dataset.id) !== -1) return;
        section.productIds.push(t.dataset.id);
        renderShopLayoutSectionProducts();
      });
    })();

    (function wirePopularItemsHandlers() {
      const refreshBtn = document.getElementById('refreshPopularBtn');
      if (refreshBtn) refreshBtn.addEventListener('click', function () {
        loadPopularItems().catch(function (e) { statusPanel.textContent = e.message; });
      });
      const maxInput = document.getElementById('popularMax');
      if (maxInput) maxInput.addEventListener('change', function () {
        const n = Math.max(1, Math.min(5, Number(maxInput.value) || 5));
        popularMaxLimit = n;
        refreshPopularUi();
      });
      const filter = document.getElementById('popularFilter');
      if (filter) filter.addEventListener('input', function () { renderPopularAvailable(); });

      const selBody = document.getElementById('popularSelectedBody');
      if (selBody) selBody.addEventListener('click', function (ev) {
        const t = ev.target;
        if (!t || !t.dataset || !t.dataset.id) return;
        const id = t.dataset.id;
        const idx = popularSelectedIds.indexOf(id);
        if (idx < 0) return;
        if (t.classList.contains('pop-up-btn') && idx > 0) {
          const tmp = popularSelectedIds[idx - 1];
          popularSelectedIds[idx - 1] = popularSelectedIds[idx];
          popularSelectedIds[idx] = tmp;
          refreshPopularUi();
        } else if (t.classList.contains('pop-down-btn') && idx < popularSelectedIds.length - 1) {
          const tmp = popularSelectedIds[idx + 1];
          popularSelectedIds[idx + 1] = popularSelectedIds[idx];
          popularSelectedIds[idx] = tmp;
          refreshPopularUi();
        } else if (t.classList.contains('pop-remove-btn')) {
          popularSelectedIds.splice(idx, 1);
          refreshPopularUi();
        }
      });

      const availBody = document.getElementById('popularAvailableBody');
      if (availBody) availBody.addEventListener('click', function (ev) {
        const t = ev.target;
        if (!t || !t.classList.contains('pop-add-btn') || !t.dataset.id) return;
        if (popularSelectedIds.length >= popularMaxLimit) return;
        const id = t.dataset.id;
        if (popularSelectedIds.indexOf(id) !== -1) return;
        popularSelectedIds.push(id);
        refreshPopularUi();
      });

      const saveBtn = document.getElementById('savePopularBtn');
      const resultEl = document.getElementById('popularSaveResult');
      if (saveBtn) saveBtn.addEventListener('click', async function () {
        if (resultEl) resultEl.textContent = 'Saving…';
        try {
          const cfg = await apiPatch('/admin/shop-catalog/popular', {
            productIds: popularSelectedIds,
            maxLimit: popularMaxLimit,
          });
          popularSelectedIds = Array.isArray(cfg && cfg.productIds) ? cfg.productIds.slice() : popularSelectedIds;
          popularMaxLimit = Math.max(1, Math.min(5, Number(cfg && cfg.maxLimit) || popularMaxLimit));
          refreshPopularUi();
          if (resultEl) resultEl.textContent = 'Saved.';
        } catch (e) {
          if (resultEl) resultEl.textContent = 'Save failed: ' + (e && e.message ? e.message : 'unknown error');
        }
      });
    })();

    (function wireHomeAdsHandlers() {
      const refreshBtn = document.getElementById('refreshHomeAdsBtn');
      if (refreshBtn) refreshBtn.addEventListener('click', () => loadHomeAdSlides().catch((e) => { statusPanel.textContent = e.message; }));

      ['haBg', 'haTitle', 'haBody'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', haUpdatePreview);
      });

      const listBody = document.getElementById('homeAdsBody');
      if (listBody) {
        listBody.addEventListener('click', function (e) {
          const editBtn = e.target.closest('.ha-edit-btn');
          const delBtn = e.target.closest('.ha-del-btn');
          if (editBtn) {
            const id = editBtn.getAttribute('data-id');
            const s = lastHomeAdSlides.find(function (x) { return x.id === id; });
            if (!s) return;
            document.getElementById('haId').value = s.id || '';
            document.getElementById('haTitle').value = s.title || '';
            document.getElementById('haBody').value = s.body || '';
            document.getElementById('haBg').value = s.backgroundCss || '';
            document.getElementById('haSort').value = s.sortOrder != null ? String(s.sortOrder) : '0';
            document.getElementById('haActive').checked = !!s.isActive;
            document.getElementById('haSaveResult').textContent = '';
            haUpdatePreview();
            return;
          }
          if (delBtn) {
            const id = delBtn.getAttribute('data-id');
            if (!id) return;
            if (!confirm('Delete this slide?')) return;
            apiDelete('/admin/home-ads/slides/' + encodeURIComponent(id))
              .then(function () { return loadHomeAdSlides(); })
              .catch(function (err) { statusPanel.textContent = err.message; });
          }
        });
      }

      const newBtn = document.getElementById('haNewBtn');
      if (newBtn) newBtn.addEventListener('click', haResetForm);

      const uploadBtn = document.getElementById('haImageUploadBtn');
      if (uploadBtn) uploadBtn.addEventListener('click', async function () {
        const out = document.getElementById('haImageResult');
        const id = document.getElementById('haId').value.trim();
        const fileInput = document.getElementById('haImageFile');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (!id) { out.textContent = 'Save the slide first, then upload an image.'; return; }
        if (!file) { out.textContent = 'Choose an image file first.'; return; }
        out.textContent = 'Uploading…';
        try {
          const updated = await haUploadFile(id, file);
          const idx = lastHomeAdSlides.findIndex(function (x) { return x.id === id; });
          if (idx >= 0) lastHomeAdSlides[idx] = updated;
          out.textContent = 'Uploaded.';
          fileInput.value = '';
          haUpdatePreview();
          await loadHomeAdSlides();
        } catch (err) {
          out.textContent = err.message;
        }
      });

      const clearImgBtn = document.getElementById('haImageClearBtn');
      if (clearImgBtn) clearImgBtn.addEventListener('click', async function () {
        const out = document.getElementById('haImageResult');
        const id = document.getElementById('haId').value.trim();
        if (!id) { out.textContent = 'Save the slide first.'; return; }
        if (!confirm('Remove the image from this slide?')) return;
        out.textContent = 'Removing…';
        try {
          const updated = await apiDelete('/admin/home-ads/slides/' + encodeURIComponent(id) + '/image');
          const idx = lastHomeAdSlides.findIndex(function (x) { return x.id === id; });
          if (idx >= 0) lastHomeAdSlides[idx] = updated;
          out.textContent = 'Removed.';
          haUpdatePreview();
          await loadHomeAdSlides();
        } catch (err) {
          out.textContent = err.message;
        }
      });

      const saveBtn = document.getElementById('haSaveBtn');
      if (saveBtn) saveBtn.addEventListener('click', function () {
        const id = document.getElementById('haId').value.trim();
        const out = document.getElementById('haSaveResult');
        const body = {
          title: document.getElementById('haTitle').value.trim(),
          body: document.getElementById('haBody').value.trim(),
          backgroundCss: document.getElementById('haBg').value.trim(),
          sortOrder: parseInt(document.getElementById('haSort').value, 10) || 0,
          isActive: document.getElementById('haActive').checked,
        };
        if (!body.title) { out.textContent = 'Title is required.'; return; }
        if (!body.backgroundCss) { body.backgroundCss = 'linear-gradient(135deg, #eef2ff, #dbeafe)'; }
        out.textContent = 'Saving…';
        const req = id
          ? apiPatch('/admin/home-ads/slides/' + encodeURIComponent(id), body)
          : apiPost('/admin/home-ads/slides', body);
        req
          .then(function (saved) {
            out.textContent = id ? 'Updated.' : 'Created. You can now upload an image below.';
            if (saved && saved.id) {
              document.getElementById('haId').value = saved.id;
            }
            return loadHomeAdSlides();
          })
          .then(function () { haUpdatePreview(); })
          .catch(function (err) { out.textContent = err.message; });
      });
    })();

    function isoDateOnly(d) {
      if (!d) return '';
      var x = new Date(d);
      if (Number.isNaN(x.getTime())) return '';
      return x.toISOString().slice(0, 10);
    }

    var vrHubSeriesBody = document.getElementById('vrHubSeriesBody');
    if (vrHubSeriesBody) vrHubSeriesBody.addEventListener('click', (e) => {
      var copyBtn = e.target.closest('.reward-def-copy-id-btn');
      if (copyBtn) {
        var voucherId = copyBtn.getAttribute('data-id') || '';
        if (!voucherId) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(voucherId).then(function () {
            statusPanel.textContent = 'Voucher ID copied: ' + voucherId;
          }).catch(function () {
            statusPanel.textContent = 'Copy failed. ID: ' + voucherId;
          });
        } else {
          statusPanel.textContent = 'Clipboard not available. ID: ' + voucherId;
        }
        return;
      }

      var viewBtn = e.target.closest('.reward-def-view-image-btn');
      if (viewBtn) {
        var imageUrl = viewBtn.getAttribute('data-image-url') || '';
        if (!imageUrl) return;
        window.open(imageUrl, '_blank', 'noopener');
        return;
      }

      var btn = e.target.closest('.reward-def-edit-btn');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var v = lastVoucherDefinitions.find(function (x) { return x.id === id; });
      if (!v) return;
      document.getElementById('rdEditId').value = v.id;
      document.getElementById('rdCode').value = v.code || '';
      document.getElementById('rdTitle').value = v.title || '';
      document.getElementById('rdDescription').value = v.description || '';
      document.getElementById('rdPoints').value = v.pointsCost != null ? String(v.pointsCost) : '';
      document.getElementById('rdDiscountRm').value = v.rebateValueSen != null ? (v.rebateValueSen / 100).toFixed(2) : '';
      document.getElementById('rdMinSpendRm').value = v.minSpendSen != null ? (v.minSpendSen / 100).toFixed(2) : '';
      document.getElementById('rdCategory').value = v.rewardCategory || '';
      document.getElementById('rdImageUrl').value = v.imageUrl || '';
      rdUpdateImagePreview();
      var rdImgFile = document.getElementById('rdImageFile');
      if (rdImgFile) rdImgFile.value = '';
      var rdImgOut = document.getElementById('rdImageResult');
      if (rdImgOut) rdImgOut.textContent = '';
      document.getElementById('rdValidFrom').value = isoDateOnly(v.rewardValidFrom);
      document.getElementById('rdValidUntil').value = isoDateOnly(v.rewardValidUntil);
      document.getElementById('rdSort').value = v.rewardSortOrder != null ? String(v.rewardSortOrder) : '0';
      document.getElementById('rdMaxIssued').value = v.maxTotalIssued != null ? String(v.maxTotalIssued) : '';
      document.getElementById('rdShowCatalog').checked = !!v.showInRewardsCatalog;
      document.getElementById('rdActive').checked = !!v.isActive;
      document.getElementById('rewardDefEditor').classList.remove('hidden');
      document.getElementById('rdSaveResult').textContent = '';
    });

    var rewardDefEditorCancelBtn = document.getElementById('rewardDefEditorCancel');
    if (rewardDefEditorCancelBtn) rewardDefEditorCancelBtn.addEventListener('click', () => {
      document.getElementById('rewardDefEditor').classList.add('hidden');
    });

    function rdUpdateImagePreview() {
      var thumb = document.getElementById('rdImageThumb');
      if (!thumb) return;
      var url = (document.getElementById('rdImageUrl').value || '').trim();
      if (url) {
        thumb.style.backgroundImage = 'url("' + url.replace(/"/g, '\\"') + '")';
        thumb.textContent = '';
      } else {
        thumb.style.backgroundImage = '';
        thumb.textContent = 'No image';
      }
    }

    var rdImageUrlInput = document.getElementById('rdImageUrl');
    if (rdImageUrlInput) rdImageUrlInput.addEventListener('input', rdUpdateImagePreview);

    async function rdUploadImageFile(id, file) {
      const headers = { ...getAuthHeaders() };
      delete headers['Content-Type'];
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/admin/voucher-definitions/' + encodeURIComponent(id) + '/image', {
        method: 'POST',
        headers,
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Upload failed (' + res.status + '): ' + txt);
      }
      return res.json();
    }

    var rdUploadBtn = document.getElementById('rdImageUploadBtn');
    if (rdUploadBtn) rdUploadBtn.addEventListener('click', async function () {
      var out = document.getElementById('rdImageResult');
      var id = document.getElementById('rdEditId').value.trim();
      var fileInput = document.getElementById('rdImageFile');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!id) { out.textContent = 'Open a voucher series for editing first.'; return; }
      if (!file) { out.textContent = 'Choose an image file first.'; return; }
      out.textContent = 'Uploading…';
      try {
        var updated = await rdUploadImageFile(id, file);
        var idx = lastVoucherDefinitions.findIndex(function (x) { return x.id === id; });
        if (idx >= 0) lastVoucherDefinitions[idx] = updated;
        document.getElementById('rdImageUrl').value = updated.imageUrl || '';
        rdUpdateImagePreview();
        out.textContent = 'Uploaded.';
        fileInput.value = '';
        await loadVouchers();
      } catch (err) {
        out.textContent = err.message;
      }
    });

    var rdClearImgBtn = document.getElementById('rdImageClearBtn');
    if (rdClearImgBtn) rdClearImgBtn.addEventListener('click', async function () {
      var out = document.getElementById('rdImageResult');
      var id = document.getElementById('rdEditId').value.trim();
      if (!id) { out.textContent = 'Open a voucher series for editing first.'; return; }
      if (!confirm('Remove the image from this voucher series?')) return;
      out.textContent = 'Removing…';
      try {
        var updated = await apiDelete('/admin/voucher-definitions/' + encodeURIComponent(id) + '/image');
        var idx = lastVoucherDefinitions.findIndex(function (x) { return x.id === id; });
        if (idx >= 0) lastVoucherDefinitions[idx] = updated;
        document.getElementById('rdImageUrl').value = '';
        rdUpdateImagePreview();
        out.textContent = 'Removed.';
        await loadVouchers();
      } catch (err) {
        out.textContent = err.message;
      }
    });

    var rdSaveBtnEl = document.getElementById('rdSaveBtn');
    if (rdSaveBtnEl) rdSaveBtnEl.addEventListener('click', () => {
      var id = document.getElementById('rdEditId').value;
      var out = document.getElementById('rdSaveResult');
      if (!id) return;
      var pcVal = document.getElementById('rdPoints').value;
      var discRm = document.getElementById('rdDiscountRm').value;
      var minRm = document.getElementById('rdMinSpendRm').value;
      var body = {
        title: document.getElementById('rdTitle').value.trim(),
        description: document.getElementById('rdDescription').value.trim() || null,
        pointsCost: pcVal === '' ? undefined : parseInt(pcVal, 10),
        rebateValueSen: discRm === '' ? null : Math.round(parseFloat(discRm) * 100),
        minSpendSen: minRm === '' ? null : Math.round(parseFloat(minRm) * 100),
        imageUrl: document.getElementById('rdImageUrl').value.trim() || null,
        rewardCategory: document.getElementById('rdCategory').value.trim() || null,
        showInRewardsCatalog: document.getElementById('rdShowCatalog').checked,
        isActive: document.getElementById('rdActive').checked,
        rewardSortOrder: parseInt(document.getElementById('rdSort').value, 10) || 0,
        rewardValidFrom: document.getElementById('rdValidFrom').value || null,
        rewardValidUntil: document.getElementById('rdValidUntil').value || null,
        maxTotalIssued: document.getElementById('rdMaxIssued').value === '' ? null : parseInt(document.getElementById('rdMaxIssued').value, 10),
      };
      out.textContent = 'Saving…';
      apiPatch('/admin/voucher-definitions/' + encodeURIComponent(id), body)
        .then(function () {
          out.textContent = 'Saved.';
          rdUpdateImagePreview();
          return loadVouchers();
        })
        .catch(function (err) { out.textContent = err.message; });
    });

    var pcrRulesBodyEl = document.getElementById('pcrRulesBody');
    if (pcrRulesBodyEl) pcrRulesBodyEl.addEventListener('click', (e) => {
      var btn = e.target.closest('.pcr-edit-btn');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var r = lastPerksCampaignRules.find(function (x) { return x.id === id; });
      if (!r) return;
      document.getElementById('pcrEditId').value = r.id;
      document.getElementById('pcrEditName').value = r.name || '';
      document.getElementById('pcrEditDescription').value = r.description || '';
      document.getElementById('pcrEditIsActive').checked = !!r.isActive;
      document.getElementById('pcrEditProgramKind').value = r.programKind || 'VOUCHER_REBATE';
      document.getElementById('pcrEditCriteriaKind').value = r.criteriaKind || 'CAMPAIGN_WINDOW_ONLY';
      document.getElementById('pcrEditCampaignStart').value = pcrIsoDate(r.campaignStartDate);
      document.getElementById('pcrEditCampaignEnd').value = pcrIsoDate(r.campaignEndDate);
      document.getElementById('pcrEditMinPurchaseRm').value =
        r.minPurchaseAmountSen != null ? (Number(r.minPurchaseAmountSen) / 100).toFixed(2) : '';
      document.getElementById('pcrEditRebateRm').value =
        r.rebateValueSen != null ? (Number(r.rebateValueSen) / 100).toFixed(2) : '';
      document.getElementById('pcrEditMinTopupRm').value =
        r.minWalletTopupSen != null ? (Number(r.minWalletTopupSen) / 100).toFixed(2) : '';
      document.getElementById('pcrEditWithinDaysSignup').value =
        r.withinDaysOfSignup != null ? String(r.withinDaysOfSignup) : '';
      document.getElementById('pcrEditMinReferrals').value =
        r.minReferralCount != null ? String(r.minReferralCount) : '';
      document.getElementById('pcrEditInactiveDays').value =
        r.inactiveDays != null ? String(r.inactiveDays) : '';
      document.getElementById('pcrEditMinTier').value = r.minMemberTier || '';
      document.getElementById('pcrEditVoucherDefinitionId').value =
        r.voucherDefinitionId || (r.voucherDefinition && r.voucherDefinition.id) || '';
      document.getElementById('pcrEditMaxGrantsPerCustomer').value =
        r.maxGrantsPerCustomer != null ? String(r.maxGrantsPerCustomer) : '';
      document.getElementById('pcrEditPanel').classList.remove('hidden');
      document.getElementById('pcrSaveResult').textContent = '';
      pcrRefreshCriteriaHint(true);
    });

    var pcrEditCancelEl = document.getElementById('pcrEditCancel');
    if (pcrEditCancelEl) pcrEditCancelEl.addEventListener('click', () => {
      document.getElementById('pcrEditPanel').classList.add('hidden');
    });

    var pcrCreateBtnEl = document.getElementById('pcrCreateBtn');
    if (pcrCreateBtnEl) pcrCreateBtnEl.addEventListener('click', () => {
      var out = document.getElementById('pcrCreateResult');
      var name = document.getElementById('pcrName').value.trim();
      var vid = document.getElementById('pcrVoucherDefinitionId').value.trim();
      var cs = document.getElementById('pcrCampaignStart').value;
      var ce = document.getElementById('pcrCampaignEnd').value;
      if (!name || !vid || !cs || !ce) {
        out.textContent = 'Name, voucher definition ID, campaign start and end are required.';
        return;
      }
      var body = {
        name: name,
        description: document.getElementById('pcrDescription').value.trim() || undefined,
        isActive: document.getElementById('pcrIsActive').checked,
        programKind: document.getElementById('pcrProgramKind').value,
        criteriaKind: document.getElementById('pcrCriteriaKind').value,
        campaignStartDate: cs,
        campaignEndDate: ce,
        voucherDefinitionId: vid,
      };
      var mp = pcrParseRmToSen(document.getElementById('pcrMinPurchaseRm').value);
      if (mp != null) body.minPurchaseAmountSen = mp;
      var rv = pcrParseRmToSen(document.getElementById('pcrRebateRm').value);
      if (rv != null) body.rebateValueSen = rv;
      var tu = pcrParseRmToSen(document.getElementById('pcrMinTopupRm').value);
      if (tu != null) body.minWalletTopupSen = tu;
      var wd = pcrOptionalInt(document.getElementById('pcrWithinDaysSignup'));
      if (wd != null) body.withinDaysOfSignup = wd;
      var mr = pcrOptionalInt(document.getElementById('pcrMinReferrals'));
      if (mr != null) body.minReferralCount = mr;
      var idays = pcrOptionalInt(document.getElementById('pcrInactiveDays'));
      if (idays != null) body.inactiveDays = idays;
      var tier = document.getElementById('pcrMinTier').value.trim();
      if (tier) body.minMemberTier = tier;
      var mg = pcrOptionalInt(document.getElementById('pcrMaxGrantsPerCustomer'));
      if (mg != null) body.maxGrantsPerCustomer = mg;
      out.textContent = 'Creating…';
      apiPost('/admin/perks-campaign-rules', body)
        .then(function () {
          out.textContent = 'Created.';
          document.getElementById('pcrName').value = '';
          document.getElementById('pcrDescription').value = '';
          document.getElementById('pcrVoucherDefinitionId').value = '';
          document.getElementById('pcrMinPurchaseRm').value = '';
          document.getElementById('pcrRebateRm').value = '';
          document.getElementById('pcrMinTopupRm').value = '';
          document.getElementById('pcrWithinDaysSignup').value = '';
          document.getElementById('pcrMinReferrals').value = '';
          document.getElementById('pcrInactiveDays').value = '';
          document.getElementById('pcrMinTier').value = '';
          document.getElementById('pcrMaxGrantsPerCustomer').value = '';
          return loadPerksCampaignRules();
        })
        .catch(function (err) { out.textContent = err.message; });
    });

    var pcrSaveBtnEl = document.getElementById('pcrSaveBtn');
    if (pcrSaveBtnEl) pcrSaveBtnEl.addEventListener('click', () => {
      var id = document.getElementById('pcrEditId').value;
      var out = document.getElementById('pcrSaveResult');
      if (!id) return;
      var cs = document.getElementById('pcrEditCampaignStart').value;
      var ce = document.getElementById('pcrEditCampaignEnd').value;
      if (!cs || !ce) {
        out.textContent = 'Campaign start and end are required.';
        return;
      }
      var body = {
        name: document.getElementById('pcrEditName').value.trim(),
        description: document.getElementById('pcrEditDescription').value.trim() || null,
        isActive: document.getElementById('pcrEditIsActive').checked,
        programKind: document.getElementById('pcrEditProgramKind').value,
        criteriaKind: document.getElementById('pcrEditCriteriaKind').value,
        campaignStartDate: cs,
        campaignEndDate: ce,
        voucherDefinitionId: document.getElementById('pcrEditVoucherDefinitionId').value.trim(),
      };
      var mp = pcrParseRmToSen(document.getElementById('pcrEditMinPurchaseRm').value);
      body.minPurchaseAmountSen = mp != null ? mp : null;
      var rv = pcrParseRmToSen(document.getElementById('pcrEditRebateRm').value);
      body.rebateValueSen = rv != null ? rv : null;
      var tu = pcrParseRmToSen(document.getElementById('pcrEditMinTopupRm').value);
      body.minWalletTopupSen = tu != null ? tu : null;
      body.withinDaysOfSignup = pcrOptionalInt(document.getElementById('pcrEditWithinDaysSignup')) ?? null;
      body.minReferralCount = pcrOptionalInt(document.getElementById('pcrEditMinReferrals')) ?? null;
      body.inactiveDays = pcrOptionalInt(document.getElementById('pcrEditInactiveDays')) ?? null;
      var tier = document.getElementById('pcrEditMinTier').value.trim();
      body.minMemberTier = tier || null;
      var mg = document.getElementById('pcrEditMaxGrantsPerCustomer').value.trim();
      body.maxGrantsPerCustomer = mg === '' ? null : parseInt(mg, 10);
      out.textContent = 'Saving…';
      apiPatch('/admin/perks-campaign-rules/' + encodeURIComponent(id), body)
        .then(function () {
          out.textContent = 'Saved.';
          document.getElementById('pcrEditPanel').classList.add('hidden');
          return loadPerksCampaignRules();
        })
        .catch(function (err) { out.textContent = err.message; });
    });

    function scRenderVariants(variants) {
      var body = document.getElementById('scVariantsBody');
      var rows = (variants || []).map(function (v) {
        var label = (v && v.label) || '';
        var rm = v && v.priceCents != null ? (Number(v.priceCents) / 100).toFixed(2) : '';
        var spCode = (v && v.salesplayCode) || '';
        var checked = v && v.available === false ? '' : 'checked';
        return '<tr class="sc-variant-row">' +
          '<td><input type="text" class="sc-var-label" value="' + fmt(label) + '" placeholder="6 inch" /></td>' +
          '<td><input type="number" class="sc-var-price" min="0" step="0.01" value="' + fmt(rm) + '" placeholder="0.00" /></td>' +
          '<td><input type="text" class="sc-var-spcode" list="scSalesplayCodesList" value="' + fmt(spCode) + '" placeholder="POS code" /></td>' +
          '<td style="text-align:center"><input type="checkbox" class="sc-var-avail" ' + checked + ' /></td>' +
          '<td class="td-actions"><button type="button" class="icon-btn sc-var-remove" title="Remove">×</button></td>' +
          '</tr>';
      }).join('');
      body.innerHTML = rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px">No variants. Click <strong>Add variant</strong> to add one (e.g. 6 inch, 8 inch).</td></tr>';
    }

    function scCollectVariants() {
      var rows = document.querySelectorAll('#scVariantsBody tr.sc-variant-row');
      var out = [];
      rows.forEach(function (row) {
        var label = (row.querySelector('.sc-var-label').value || '').trim();
        var priceStr = (row.querySelector('.sc-var-price').value || '').trim();
        if (!label && !priceStr) return;
        var rm = parseFloat(priceStr);
        var priceCents = Number.isFinite(rm) ? Math.round(rm * 100) : 0;
        var available = row.querySelector('.sc-var-avail').checked;
        var spEl = row.querySelector('.sc-var-spcode');
        var salesplayCode = spEl ? (spEl.value || '').trim() : '';
        out.push({ label: label, priceCents: priceCents, available: available, salesplayCode: salesplayCode });
      });
      return out;
    }

    function scClampPercent(v) {
      var n = Number(v);
      if (!Number.isFinite(n)) return 50;
      return Math.max(0, Math.min(100, n));
    }
    function scClampScale(v) {
      var n = Number(v);
      if (!Number.isFinite(n)) return 1;
      return Math.max(0.5, Math.min(3, n));
    }

    function scGetImageFraming() {
      var x = scClampPercent(document.getElementById('scImageOffsetX').value);
      var y = scClampPercent(document.getElementById('scImageOffsetY').value);
      var s = scClampScale(document.getElementById('scImageScale').value);
      return { x: x, y: y, s: s };
    }

    function scUpdateImagePreview() {
      var thumb = document.getElementById('scImageThumb');
      if (!thumb) return;
      var url = (document.getElementById('scImageUrl').value || '').trim();
      var f = scGetImageFraming();
      var lx = document.getElementById('scImageOffsetXVal');
      var ly = document.getElementById('scImageOffsetYVal');
      var ls = document.getElementById('scImageScaleVal');
      if (lx) lx.textContent = String(Math.round(f.x));
      if (ly) ly.textContent = String(Math.round(f.y));
      if (ls) ls.textContent = f.s.toFixed(2);
      if (url) {
        thumb.style.background = 'url("' + url + '") ' + f.x + '% ' + f.y + '%/' + (f.s * 100) + '% no-repeat';
        thumb.textContent = '';
      } else {
        thumb.style.background = '#f8fafc';
        thumb.textContent = 'No image';
      }
    }

    function scSetImageFraming(x, y, s) {
      var ix = document.getElementById('scImageOffsetX');
      var iy = document.getElementById('scImageOffsetY');
      var is = document.getElementById('scImageScale');
      if (ix) ix.value = String(scClampPercent(x == null ? 50 : x));
      if (iy) iy.value = String(scClampPercent(y == null ? 50 : y));
      if (is) is.value = String(scClampScale(s == null ? 1 : s));
      scUpdateImagePreview();
    }

    (function bindFramingControls() {
      ['scImageOffsetX', 'scImageOffsetY', 'scImageScale'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', scUpdateImagePreview);
      });
      var reset = document.getElementById('scImageRecenterBtn');
      if (reset) reset.addEventListener('click', function () { scSetImageFraming(50, 50, 1); });

      var thumb = document.getElementById('scImageThumb');
      if (!thumb) return;
      var dragging = false;
      function onMove(clientX, clientY) {
        var rect = thumb.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        var x = ((clientX - rect.left) / rect.width) * 100;
        var y = ((clientY - rect.top) / rect.height) * 100;
        document.getElementById('scImageOffsetX').value = String(scClampPercent(x));
        document.getElementById('scImageOffsetY').value = String(scClampPercent(y));
        scUpdateImagePreview();
      }
      thumb.addEventListener('mousedown', function (e) {
        if (!(document.getElementById('scImageUrl').value || '').trim()) return;
        dragging = true;
        thumb.style.cursor = 'grabbing';
        onMove(e.clientX, e.clientY);
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) { if (dragging) onMove(e.clientX, e.clientY); });
      window.addEventListener('mouseup', function () { if (dragging) { dragging = false; thumb.style.cursor = 'grab'; } });
      thumb.addEventListener('touchstart', function (e) {
        if (!(document.getElementById('scImageUrl').value || '').trim()) return;
        var t = e.touches[0]; if (!t) return;
        dragging = true;
        onMove(t.clientX, t.clientY);
        e.preventDefault();
      }, { passive: false });
      thumb.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        var t = e.touches[0]; if (!t) return;
        onMove(t.clientX, t.clientY);
        e.preventDefault();
      }, { passive: false });
      thumb.addEventListener('touchend', function () { dragging = false; });
    })();

    var SC_FIELD_LABELS = {
      imageUrl: 'Photo',
      images: 'Photo gallery',
      basePriceCents: 'Base price',
      priceDisplay: 'Price label',
      variants: 'Variants',
      badge: 'Badge',
      soldOut: 'Sold-out flag',
      name: 'Name',
      categoryLabel: 'Category label',
      shortDescription: 'Short description',
      description: 'Description',
    };

    function scRenderOverridesPanel(p) {
      var panel = document.getElementById('scOverridesPanel');
      var list = document.getElementById('scOverridesList');
      var resetOut = document.getElementById('scResetOverridesResult');
      if (resetOut) resetOut.textContent = '';
      if (!panel || !list) return;
      var locks = (p && Array.isArray(p.syncOverrides)) ? p.syncOverrides : [];
      if (!locks.length) {
        panel.style.display = 'none';
        return;
      }
      panel.style.display = 'block';
      list.innerHTML = 'Sync from moja-sites will <strong>not</strong> change: ' +
        locks.map(function (f) { return '<code>' + fmt(SC_FIELD_LABELS[f] || f) + '</code>'; }).join(', ') + '.';
    }

    async function scUploadProductImage(id, file) {
      var headers = Object.assign({}, getAuthHeaders());
      delete headers['Content-Type'];
      var fd = new FormData();
      fd.append('file', file);
      var res = await fetch('/admin/shop-catalog/products/' + encodeURIComponent(id) + '/image', {
        method: 'POST',
        headers: headers,
        body: fd,
      });
      if (!res.ok) {
        var txt = await res.text();
        throw new Error('Upload failed (' + res.status + '): ' + txt);
      }
      return res.json();
    }

    document.getElementById('shopCatalogBody').addEventListener('click', async (e) => {
      var delBtn = e.target.closest('.sc-delete-btn');
      if (delBtn) {
        var delId = delBtn.getAttribute('data-id');
        var delName = delBtn.getAttribute('data-name') || delId;
        if (!delId) return;
        if (!window.confirm('Delete "' + delName + '" from the shop catalog? This cannot be undone.')) return;
        delBtn.disabled = true;
        try {
          await apiDelete('/admin/shop-catalog/products/' + encodeURIComponent(delId));
          await loadShopCatalog();
        } catch (err) {
          delBtn.disabled = false;
          window.alert('Delete failed: ' + (err && err.message ? err.message : err));
        }
        return;
      }

      var btn = e.target.closest('.sc-edit-btn');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var p = lastShopCatalogProducts.find(function (x) { return x.id === id; });
      if (!p) return;
      document.getElementById('scId').value = p.id || '';
      document.getElementById('scIdVisible').value = p.id || '';
      document.getElementById('scIdVisible').readOnly = true;
      document.getElementById('scName').value = p.name || '';
      document.getElementById('scCategory').value = p.category || 'specials';
      document.getElementById('scCategoryLabel').value = p.categoryLabel || '';
      document.getElementById('scShort').value = p.shortDescription || '';
      document.getElementById('scDesc').value = p.description || '';
      document.getElementById('scImageUrl').value = p.imageUrl || '';
      document.getElementById('scPrice').value = p.basePriceCents != null ? String(p.basePriceCents) : '0';
      document.getElementById('scPriceDisplay').value = p.priceDisplay || '';
      document.getElementById('scSort').value = p.sortOrder != null ? String(p.sortOrder) : '0';
      document.getElementById('scBadge').value = p.badge || '';
      document.getElementById('scActive').checked = !!p.isActive;
      document.getElementById('scSoldOut').checked = !!p.soldOut;
      document.getElementById('scSalesplayCode').value = p.salesplayProductCode || '';
      var spVarCodes = (p.salesplayVariantCodes && typeof p.salesplayVariantCodes === 'object') ? p.salesplayVariantCodes : {};
      scRenderVariants((Array.isArray(p.variants) ? p.variants : []).map(function (v) {
        return Object.assign({}, v, { salesplayCode: spVarCodes[(v.label || '').trim()] || '' });
      }));
      document.getElementById('scSaveResult').textContent = '';
      var fileInput = document.getElementById('scImageFile');
      if (fileInput) fileInput.value = '';
      var imgOut = document.getElementById('scImageResult');
      if (imgOut) imgOut.textContent = '';
      scSetImageFraming(p.imageOffsetX, p.imageOffsetY, p.imageScale);
      scRenderOverridesPanel(p);
      var scModalTitleEl = document.getElementById('scModalTitle');
      if (scModalTitleEl) scModalTitleEl.textContent = 'Edit product — ' + (p.name || '');
      openScModal();
    });

    function openScModal() {
      var bd = document.getElementById('scModalBackdrop');
      var md = document.getElementById('scModal');
      if (bd) bd.classList.remove('hidden');
      if (md) md.classList.remove('hidden');
    }
    function closeScModal() {
      var bd = document.getElementById('scModalBackdrop');
      var md = document.getElementById('scModal');
      if (bd) bd.classList.add('hidden');
      if (md) md.classList.add('hidden');
    }
    function scResetProductForm() {
      document.getElementById('scId').value = '';
      document.getElementById('scIdVisible').value = '';
      document.getElementById('scIdVisible').readOnly = false;
      document.getElementById('scName').value = '';
      document.getElementById('scCategory').value = 'specials';
      document.getElementById('scCategoryLabel').value = '';
      document.getElementById('scShort').value = '';
      document.getElementById('scDesc').value = '';
      document.getElementById('scImageUrl').value = '';
      document.getElementById('scPrice').value = '0';
      document.getElementById('scPriceDisplay').value = '';
      document.getElementById('scSort').value = '0';
      document.getElementById('scBadge').value = '';
      document.getElementById('scActive').checked = true;
      document.getElementById('scSoldOut').checked = false;
      document.getElementById('scSalesplayCode').value = '';
      scRenderVariants([]);
      document.getElementById('scSaveResult').textContent = '';
      var fileInput = document.getElementById('scImageFile');
      if (fileInput) fileInput.value = '';
      var imgOut = document.getElementById('scImageResult');
      if (imgOut) imgOut.textContent = '';
      scSetImageFraming(50, 50, 1);
      scRenderOverridesPanel(null);
    }

    var scAddProductBtn = document.getElementById('scAddProductBtn');
    if (scAddProductBtn) scAddProductBtn.addEventListener('click', function () {
      scResetProductForm();
      var scModalTitleEl = document.getElementById('scModalTitle');
      if (scModalTitleEl) scModalTitleEl.textContent = 'New product';
      openScModal();
    });
    var scModalCloseBtn = document.getElementById('scModalClose');
    if (scModalCloseBtn) scModalCloseBtn.addEventListener('click', closeScModal);
    var scModalCancelBtn = document.getElementById('scModalCancel');
    if (scModalCancelBtn) scModalCancelBtn.addEventListener('click', closeScModal);
    var scModalBackdropEl = document.getElementById('scModalBackdrop');
    if (scModalBackdropEl) scModalBackdropEl.addEventListener('click', closeScModal);

    var scResetOverridesBtn = document.getElementById('scResetOverridesBtn');
    if (scResetOverridesBtn) scResetOverridesBtn.addEventListener('click', async function () {
      var out = document.getElementById('scResetOverridesResult');
      var id = document.getElementById('scId').value.trim();
      if (!id) { if (out) out.textContent = 'No product loaded.'; return; }
      if (!window.confirm('Allow sync to overwrite this product\u2019s manual edits on the next sync?')) return;
      if (out) out.textContent = 'Resetting…';
      try {
        var updated = await apiPost('/admin/shop-catalog/products/' + encodeURIComponent(id) + '/reset-sync-overrides', {});
        var idx = lastShopCatalogProducts.findIndex(function (x) { return x.id === id; });
        if (idx >= 0) lastShopCatalogProducts[idx] = updated;
        scRenderOverridesPanel(updated);
        if (out) out.textContent = 'Sync overrides cleared. The next sync may update this product.';
      } catch (e) {
        if (out) out.textContent = e.message;
      }
    });

    var scImageUploadBtn = document.getElementById('scImageUploadBtn');
    if (scImageUploadBtn) scImageUploadBtn.addEventListener('click', async function () {
      var out = document.getElementById('scImageResult');
      var id = document.getElementById('scId').value.trim();
      var fileInput = document.getElementById('scImageFile');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!id) { out.textContent = 'Save the product first, then upload an image.'; return; }
      if (!file) { out.textContent = 'Choose an image file first.'; return; }
      out.textContent = 'Uploading…';
      try {
        var updated = await scUploadProductImage(id, file);
        var idx = lastShopCatalogProducts.findIndex(function (x) { return x.id === id; });
        if (idx >= 0) lastShopCatalogProducts[idx] = updated;
        document.getElementById('scImageUrl').value = updated.imageUrl || '';
        scUpdateImagePreview();
        scRenderOverridesPanel(updated);
        fileInput.value = '';
        out.textContent = 'Image uploaded.';
        await loadShopCatalog();
      } catch (e) {
        out.textContent = e.message;
      }
    });

    var scImageClearBtn = document.getElementById('scImageClearBtn');
    if (scImageClearBtn) scImageClearBtn.addEventListener('click', async function () {
      var out = document.getElementById('scImageResult');
      var id = document.getElementById('scId').value.trim();
      if (!id) { out.textContent = 'Save the product first.'; return; }
      if (!window.confirm('Remove the current product image?')) return;
      out.textContent = 'Removing…';
      try {
        var updated = await apiDelete('/admin/shop-catalog/products/' + encodeURIComponent(id) + '/image');
        var idx = lastShopCatalogProducts.findIndex(function (x) { return x.id === id; });
        if (idx >= 0) lastShopCatalogProducts[idx] = updated;
        document.getElementById('scImageUrl').value = updated.imageUrl || '';
        scUpdateImagePreview();
        scRenderOverridesPanel(updated);
        out.textContent = 'Image removed.';
        await loadShopCatalog();
      } catch (e) {
        out.textContent = e.message;
      }
    });

    document.getElementById('scAddVariantBtn').addEventListener('click', () => {
      var existing = scCollectVariants();
      var nextLabel = existing.length === 0 ? '6 inch' : existing.length === 1 ? '8 inch' : '';
      existing.push({ label: nextLabel, priceCents: 0, available: true });
      scRenderVariants(existing);
    });

    document.getElementById('scVariantsBody').addEventListener('click', (e) => {
      var btn = e.target.closest('.sc-var-remove');
      if (!btn) return;
      var row = btn.closest('tr.sc-variant-row');
      if (!row) return;
      row.remove();
      var remaining = document.querySelectorAll('#scVariantsBody tr.sc-variant-row').length;
      if (remaining === 0) scRenderVariants([]);
    });

    scRenderVariants([]);

    document.getElementById('scSaveBtn').addEventListener('click', () => {
      var id = document.getElementById('scId').value.trim();
      var slug = document.getElementById('scIdVisible').value.trim();
      var out = document.getElementById('scSaveResult');
      var variants = scCollectVariants();
      var spVariantCodes = {};
      variants.forEach(function (v) {
        if (v.label && v.salesplayCode) spVariantCodes[v.label] = v.salesplayCode;
      });
      var body = {
        name: document.getElementById('scName').value.trim(),
        category: document.getElementById('scCategory').value,
        categoryLabel: document.getElementById('scCategoryLabel').value.trim() || undefined,
        shortDescription: document.getElementById('scShort').value.trim(),
        description: document.getElementById('scDesc').value.trim(),
        imageUrl: document.getElementById('scImageUrl').value.trim(),
        imageOffsetX: scClampPercent(document.getElementById('scImageOffsetX').value),
        imageOffsetY: scClampPercent(document.getElementById('scImageOffsetY').value),
        imageScale: scClampScale(document.getElementById('scImageScale').value),
        basePriceCents: parseInt(document.getElementById('scPrice').value, 10) || 0,
        priceDisplay: document.getElementById('scPriceDisplay').value.trim() || undefined,
        sortOrder: parseInt(document.getElementById('scSort').value, 10) || 0,
        badge: document.getElementById('scBadge').value.trim() || undefined,
        isActive: document.getElementById('scActive').checked,
        soldOut: document.getElementById('scSoldOut').checked,
        variants: variants.map(function (v) {
          return { label: v.label, priceCents: v.priceCents, available: v.available };
        }),
        salesplayProductCode: document.getElementById('scSalesplayCode').value.trim(),
        salesplayVariantCodes: spVariantCodes,
      };
      if (!body.name) {
        out.textContent = 'Name is required.';
        return;
      }
      for (var i = 0; i < variants.length; i++) {
        if (!variants[i].label) {
          out.textContent = 'Variant ' + (i + 1) + ' is missing a label.';
          return;
        }
      }
      out.textContent = 'Saving…';
      var req = id
        ? apiPatch('/admin/shop-catalog/products/' + encodeURIComponent(id), body)
        : apiPost('/admin/shop-catalog/products', Object.assign({ id: slug || undefined }, body));
      req
        .then(function () {
          out.textContent = id ? 'Updated.' : 'Created.';
          closeScModal();
          return loadShopCatalog();
        })
        .catch(function (err) { out.textContent = err.message; });
    });

    document.getElementById('emPayrollReloadBtn').addEventListener('click', function () {
      loadEmPayrollSettingsForm().catch(function (e) { statusPanel.textContent = e.message; });
    });
    document.getElementById('emPayrollSaveBtn').addEventListener('click', function () {
      var h = document.getElementById('emPayrollSaveHint');
      h.textContent = 'Saving…';
      apiPatch('/admin/employees/payroll-settings', {
        standardWorkdayMinutes: Math.max(
          1,
          Math.round((parseFloat(document.getElementById('emStdHours').value) || 8) * 60),
        ),
        overtimeMultiplierBps: emDecimalToBps(document.getElementById('emOtMul').value),
        publicHolidayMultiplierBps: emDecimalToBps(document.getElementById('emPhMul').value),
        offDayWorkedMultiplierBps: emDecimalToBps(document.getElementById('emOffMul').value),
      })
        .then(function () {
          h.textContent = 'Saved.';
        })
        .catch(function (e) { h.textContent = e.message; });
    });
    document.getElementById('emEmpReloadBtn').addEventListener('click', function () {
      loadEmEmployeesTable().catch(function (e) { statusPanel.textContent = e.message; });
    });
    document.getElementById('emEmpCreateBtn').addEventListener('click', function () {
      var hint = document.getElementById('emEmpCreateHint');
      hint.textContent = '';
      var code = document.getElementById('emNewCode').value.trim();
      var name = document.getElementById('emNewName').value.trim();
      if (!code || !name) {
        hint.textContent = 'Employee ID and display name required.';
        return;
      }
      apiPost('/admin/employees', {
        employeeCode: code,
        displayName: name,
        positionTitle: document.getElementById('emNewPos').value.trim(),
        hourlyRateCents: emMonthlyToHourlyCents(parseInt(document.getElementById('emNewRate').value, 10) || 0),
        commissionRateBps: emPercentStrToBps(document.getElementById('emNewComm').value),
      })
        .then(function () {
          hint.textContent = 'Created.';
          document.getElementById('emNewCode').value = '';
          document.getElementById('emNewName').value = '';
          return loadEmEmployeesTable();
        })
        .catch(function (e) { hint.textContent = e.message; });
    });
    document.getElementById('emEmpBody').addEventListener('click', function (e) {
      var btn = e.target.closest('.em-row-save');
      if (!btn) return;
      var tr = btn.closest('tr[data-em-id]');
      if (!tr) return;
      var id = tr.getAttribute('data-em-id');
      var body = {
        displayName: tr.querySelector('.em-inp-name').value.trim(),
        positionTitle: tr.querySelector('.em-inp-pos').value.trim(),
        hourlyRateCents: emMonthlyToHourlyCents(parseInt(tr.querySelector('.em-inp-rate').value, 10) || 0),
        commissionRateBps: emPercentStrToBps(tr.querySelector('.em-inp-comm').value),
        isActive: tr.querySelector('.em-inp-active').checked,
      };
      apiPatch('/admin/employees/' + encodeURIComponent(id), body)
        .then(function () {
          statusPanel.textContent = 'Employee row saved.';
          return loadEmEmployeesTable();
        })
        .catch(function (err) { statusPanel.textContent = err.message; });
    });
    document.getElementById('emCalLoadBtn').addEventListener('click', function () {
      loadEmCalendarTable().catch(function (e) { statusPanel.textContent = e.message; });
    });
    document.getElementById('emCalSaveBtn').addEventListener('click', function () {
      var h = document.getElementById('emCalHint');
      var day = document.getElementById('emCalDay').value;
      var type = document.getElementById('emCalType').value;
      var label = document.getElementById('emCalLabel').value.trim();
      if (!day) {
        h.textContent = 'Pick a date.';
        return;
      }
      h.textContent = 'Saving…';
      apiPost('/admin/employees/calendar', {
        days: [{ date: day, dayType: type, label: label || undefined }],
      })
        .then(function () {
          h.textContent = 'Saved.';
          return loadEmCalendarTable();
        })
        .catch(function (e) { h.textContent = e.message; });
    });
    document.getElementById('emTeReloadBtn').addEventListener('click', function () {
      loadEmTimeEntries().catch(function (e) { statusPanel.textContent = e.message; });
    });
    document.getElementById('emPayCalcBtn').addEventListener('click', function () {
      var id = document.getElementById('emPayEmp').value;
      var from = document.getElementById('emPayFrom').value;
      var to = document.getElementById('emPayTo').value;
      var root = document.getElementById('emPayslipRoot');
      if (!id || !from || !to) {
        root.innerHTML =
          '<p class="field-hint" style="margin:0">Select employee and date range.</p>';
        return;
      }
      root.innerHTML = '<p class="muted-box" style="margin:0">Calculating…</p>';
      apiPost('/admin/employees/payroll-preview', {
        employeeId: id,
        from: from,
        to: to,
        manualCommissionCents: parseInt(document.getElementById('emPayManual').value, 10) || 0,
      })
        .then(function (r) {
          root.innerHTML = emRenderPayrollPayslip(r);
        })
        .catch(function (e) {
          root.innerHTML =
            '<p class="field-hint" style="margin:0">' + emEscapeHtml(e.message) + '</p>';
        });
    });
    document.getElementById('emPayPrintBtn').addEventListener('click', function () {
      var root = document.getElementById('emPayslipRoot');
      if (!root || !root.querySelector('.em-payslip')) {
        statusPanel.textContent = 'Run Calculate first to print the payslip.';
        return;
      }
      window.print();
    });

    function wireNav() {
      navButtons().forEach((btn) => {
        btn.addEventListener('click', () => {
          const view = btn.getAttribute('data-view');
          navButtons().forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          setMainView(view);
          if (view === 'reports-sales' && isConnected) {
            const fe = document.getElementById('saFrom');
            if (fe && !fe.value) saInitDefaultDates();
            const dce = document.getElementById('dcDate');
            if (dce && !dce.value) {
              const t = new Date();
              dce.value = saIsoDateUtc(
                new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())),
              );
            }
            loadSalesAnalytics().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
            loadDailyCommerceReport().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'finance-overview' && isConnected) {
            const fe = document.getElementById('finFrom');
            if (fe && !fe.value) finSetDates(29, false);
            loadFinanceOverview().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'finance-transactions' && isConnected) {
            const fe = document.getElementById('ftFrom');
            const te = document.getElementById('ftTo');
            if (fe && !fe.value) {
              const t = new Date();
              const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
              const start = new Date(end);
              start.setUTCDate(start.getUTCDate() - 29);
              fe.value = saIsoDateUtc(start);
              if (te) te.value = saIsoDateUtc(end);
            }
            ftPage = 1;
            loadFinanceTransactions().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'finance-daily' && isConnected) {
            const dce = document.getElementById('fdDate');
            if (dce && !dce.value) {
              const t = new Date();
              dce.value = saIsoDateUtc(
                new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())),
              );
            }
            loadFinanceDaily().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'finance-sync' && isConnected) {
            loadFinanceSync().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'customers-list' && isConnected) {
            loadCustomers().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'customer-orders' && isConnected) {
            loadCommerceOrders().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'dashboard-employees' && isConnected) {
            loadEmployeesMgmtPage().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'voucher-campaigns' && isConnected) {
            vcInitTemplates();
            vcInitDates();
            loadVoucherCampaigns()
              .then(function () { return loadIssuedVouchers(); })
              .catch(function (err) {
                statusPanel.textContent = err.message || String(err);
              });
          }
          if (view === 'gift-rewards' && isConnected) {
            loadGiftRewards().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'bento-overview' && isConnected) {
            loadBentoOverview().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'bento-sales' && isConnected) {
            loadBentoSales().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (
            (view === 'bento-menu' ||
              view === 'bento-pricing' ||
              view === 'bento-operations') &&
            isConnected
          ) {
            loadBentoMenu().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'bento-orders' && isConnected) {
            bentoOrdersInitDates();
            previewBentoOrders().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'bento-vouchers' && isConnected) {
            loadBentoVouchers().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
          if (view === 'settings-system' && isConnected) {
            loadReportingSettings().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
            loadDemoModeSetting().catch(function (err) {
              statusPanel.textContent = err.message || String(err);
            });
          }
        });
      });
    }
    document.querySelectorAll('.vrh-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pane = btn.getAttribute('data-vrh-pane');
        if (pane) vrhShowPane(pane);
      });
    });
    ['vrhOfferPromo', 'vrhOfferPoints'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', vrhSyncOfferTypeCards);
    });
    vrhSyncOfferTypeCards();
    var vrhSuggest = document.getElementById('vrhSuggestCodeBtn');
    if (vrhSuggest) {
      vrhSuggest.addEventListener('click', function () {
        var t = document.getElementById('vrhSeriesTitle').value.trim();
        document.getElementById('vrhSeriesCode').value = vrhSlugFromTitle(t);
      });
    }
    var vrhN1 = document.getElementById('vrhWizardNext1');
    if (vrhN1) {
      vrhN1.addEventListener('click', function () {
        var title = document.getElementById('vrhSeriesTitle').value.trim();
        var code = document.getElementById('vrhSeriesCode').value.trim();
        if (!title || !code) {
          statusPanel.textContent = 'Series name and internal code are required.';
          return;
        }
        statusPanel.textContent = '';
        vrhSyncOfferTypeCards();
        vrhSetWizardStep(2);
      });
    }
    var vrhN2 = document.getElementById('vrhWizardNext2');
    if (vrhN2) {
      vrhN2.addEventListener('click', function () {
        if (document.getElementById('vrhOfferPoints').checked) {
          var pc = parseInt(document.getElementById('vrhSeriesPoints').value, 10);
          if (!Number.isFinite(pc) || pc < 1) {
            statusPanel.textContent = 'Points catalog rewards need a points price (at least 1).';
            return;
          }
        }
        statusPanel.textContent = '';
        vrhWizardBuildSummary();
        vrhSetWizardStep(3);
      });
    }
    var vrhB2 = document.getElementById('vrhWizardBack2');
    if (vrhB2) vrhB2.addEventListener('click', function () { vrhSetWizardStep(1); });
    var vrhB3 = document.getElementById('vrhWizardBack3');
    if (vrhB3) vrhB3.addEventListener('click', function () { vrhSetWizardStep(2); });
    var vrhCreate = document.getElementById('vrhCreateSeriesBtn');
    if (vrhCreate) {
      vrhCreate.addEventListener('click', function () {
        var title = document.getElementById('vrhSeriesTitle').value.trim();
        var code = document.getElementById('vrhSeriesCode').value.trim();
        var desc = document.getElementById('vrhSeriesDescription').value.trim();
        var points = document.getElementById('vrhOfferPoints').checked;
        var out = document.getElementById('vrhCreateSeriesResult');
        if (!title || !code) {
          if (out) out.textContent = 'Series name and code are required.';
          return;
        }
        var body = { code: code, title: title, showInRewardsCatalog: points, rewardSortOrder: parseInt(document.getElementById('vrhSeriesSort').value, 10) || 0 };
        if (desc) body.description = desc;
        if (points) {
          var p = parseInt(document.getElementById('vrhSeriesPoints').value, 10);
          if (!Number.isFinite(p) || p < 1) {
            if (out) out.textContent = 'Points price is required for catalog rewards.';
            return;
          }
          body.pointsCost = p;
        }
        var vf = document.getElementById('vrhSeriesValidFrom').value;
        var vu = document.getElementById('vrhSeriesValidUntil').value;
        if (vf) body.rewardValidFrom = vf;
        if (vu) body.rewardValidUntil = vu;
        var cat = document.getElementById('vrhSeriesCategory').value.trim();
        if (cat) body.rewardCategory = cat;
        var img = document.getElementById('vrhSeriesImageUrl').value.trim();
        if (img) body.imageUrl = img;
        var mx = document.getElementById('vrhSeriesMaxIssued').value.trim();
        if (mx !== '') {
          var m = parseInt(mx, 10);
          if (Number.isFinite(m) && m >= 1) body.maxTotalIssued = m;
        }
        if (out) out.textContent = 'Creating…';
        apiPost('/admin/voucher-definitions', body)
          .then(function () {
            if (out) out.textContent = 'Series created. You can find it under All series or set up automation.';
            document.getElementById('vrhSeriesTitle').value = '';
            document.getElementById('vrhSeriesCode').value = '';
            document.getElementById('vrhSeriesDescription').value = '';
            document.getElementById('vrhSeriesValidFrom').value = '';
            document.getElementById('vrhSeriesValidUntil').value = '';
            document.getElementById('vrhSeriesCategory').value = '';
            document.getElementById('vrhSeriesImageUrl').value = '';
            document.getElementById('vrhSeriesMaxIssued').value = '';
            document.getElementById('vrhSeriesPoints').value = '';
            document.getElementById('vrhSeriesSort').value = '0';
            document.getElementById('vrhOfferPromo').checked = true;
            vrhSyncOfferTypeCards();
            vrhSetWizardStep(1);
            vrhShowPane('series');
            return loadVouchers();
          })
          .catch(function (err) {
            if (out) out.textContent = err.message || String(err);
          });
      });
    }
    var refreshRwfBtn = document.getElementById('refreshRwfBtn');
    if (refreshRwfBtn) {
      refreshRwfBtn.addEventListener('click', function () {
        loadRewardsWorkflowV2().catch(function (err) {
          statusPanel.textContent = err.message || String(err);
        });
      });
    }

    applyDashboardConfig().then(function () {
      wireNav();
      pcrRefreshCriteriaHint(false);
      initSession().catch(function () {});
    });
  </script>
</body>
</html>`;
  }
}
