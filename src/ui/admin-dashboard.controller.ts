import { Controller, Get, Header } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_DASHBOARD_CONFIG = {
  menuGroups: {
    dashboard: { showGroup: false, showSubmenu: true },
    customers: { showGroup: true, showSubmenu: true },
    wallet: { showGroup: false, showSubmenu: true },
    loyalty: { showGroup: true, showSubmenu: true },
    vouchers: { showGroup: false, showSubmenu: true },
    campaigns: { showGroup: false, showSubmenu: true },
    'data-tools': { showGroup: false, showSubmenu: true },
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
    'loyalty-rewards-catalog': true,
    'loyalty-voucher-push-rules': true,
    'vouchers-list': true,
    'settings-shopping-catalog': true,
    'settings-system': true,
    'reports-customers': true,
    'reports-sales': true,
    'reports-vouchers': true,
    'reports-loyalty': true,
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
      if (!parsed || typeof parsed !== 'object') return DEFAULT_DASHBOARD_CONFIG;
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
    .hidden { display: none !important; }
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
    .customer-sort-bar select { padding: 6px 10px; border-radius: var(--radius); border: 1px solid var(--border); }
    @media (max-width: 960px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { border-right: none; border-bottom: 1px solid var(--sidebar-border); }
      .nav-scroll { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; }
      .nav-group { flex: 1 1 100%; }
      .nav-group .nav-items { flex-direction: row; flex-wrap: wrap; }
      .nav-btn { flex: 1 1 auto; min-width: 140px; }
    }
  </style>
</head>
<body>
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
            <button type="button" class="nav-btn nav-sub" data-view="dashboard-employees">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Employee management
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
            <button type="button" class="nav-btn nav-sub" data-view="reports-sales">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-6 3 4 5-8"/></svg>
              Sales &amp; transactions
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
            <button type="button" class="nav-btn nav-sub" data-view="loyalty-rewards-catalog">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              Rewards catalog
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="loyalty-voucher-push-rules">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Voucher push rules
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="vouchers-list">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V21"/></svg>
              Voucher definitions
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="vouchers-templates">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg>
              Voucher templates
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="vouchers-assigned">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Assigned vouchers
            </button>
            <button type="button" class="nav-btn nav-sub" data-view="vouchers-redemption">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Redemption tracking
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
        <details class="nav-group" data-menu-group="reports" open>
          <summary>Reports</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="reports-customers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>Customer reports</button>
            <button type="button" class="nav-btn nav-sub" data-view="reports-vouchers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V21"/></svg>Voucher reports</button>
            <button type="button" class="nav-btn nav-sub" data-view="reports-loyalty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Loyalty reports</button>
          </div>
        </details>
        <details class="nav-group" data-menu-group="settings" open>
          <summary>Settings</summary>
          <div class="nav-items">
            <button type="button" class="nav-btn nav-sub" data-view="settings-shopping-catalog">Shopping catalog</button>
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
            <button type="button" class="btn-primary" id="connectBtn">Connect</button>
            <button type="button" class="btn-primary btn-outline" id="disconnectBtn">Disconnect</button>
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

        <div class="info-banner" id="statusPanel">Use an <strong>API key</strong> or <strong>sign in</strong>, then choose <strong>Connect / refresh</strong> to load data.</div>

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
            <strong>Clock in/out</strong> runs from the ops order queue (Timesheet window). Here: staff records, work calendar (off / public holiday), closed punches, payroll rules, and a period calculator (regular + overtime + holiday multipliers + commission bps + optional manual commission).
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Payroll rules</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="emPayrollReloadBtn">Reload</button><button type="button" class="btn-primary" id="emPayrollSaveBtn">Save</button></div></div>
            <div style="padding:16px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
              <div class="form-section" style="margin:0"><label for="emStdMin">Standard workday (minutes)</label><input type="number" id="emStdMin" min="1" step="1" /></div>
              <div class="form-section" style="margin:0"><label for="emOtBps">Overtime multiplier (bps)</label><input type="number" id="emOtBps" min="0" step="1" title="15000 = 1.5× hourly for minutes after standard day" /></div>
              <div class="form-section" style="margin:0"><label for="emPhBps">Public holiday multiplier (bps)</label><input type="number" id="emPhBps" min="0" step="1" title="20000 = 2× for all minutes that day" /></div>
              <div class="form-section" style="margin:0"><label for="emOffBps">Off-day worked multiplier (bps)</label><input type="number" id="emOffBps" min="0" step="1" title="10000 = same pay structure as regular; adjust for premium" /></div>
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
                <div class="form-section" style="margin:0"><label for="emNewRate">Hourly rate (¢)</label><input type="number" id="emNewRate" min="0" step="1" value="0" /></div>
              </div>
              <div class="form-section" style="margin:0"><label for="emNewComm">Commission (basis points of wage subtotal)</label><input type="number" id="emNewComm" min="0" step="1" value="0" title="500 = 5%" /></div>
              <button type="button" class="btn-primary" id="emEmpCreateBtn" style="margin-top:12px">Add employee</button>
              <p class="field-hint" id="emEmpCreateHint" style="margin-top:8px"></p>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>ID</th><th>Name</th><th>Position</th><th>Hourly ¢</th><th>Comm bps</th><th>Active</th><th>Save row</th></tr></thead>
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
            <div class="sheet-head"><h2>Salary calculator (period)</h2></div>
            <div style="padding:16px 20px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
              <div class="form-section" style="margin:0"><label for="emPayEmp">Employee</label><select id="emPayEmp"></select></div>
              <div class="form-section" style="margin:0"><label for="emPayFrom">From</label><input type="date" id="emPayFrom" /></div>
              <div class="form-section" style="margin:0"><label for="emPayTo">To</label><input type="date" id="emPayTo" /></div>
              <div class="form-section" style="margin:0"><label for="emPayManual">Manual commission add-on (¢)</label><input type="number" id="emPayManual" min="0" step="1" value="0" /></div>
              <button type="button" class="btn-primary" id="emPayCalcBtn">Calculate</button>
            </div>
            <pre id="emPayrollOut" class="muted-box" style="margin:16px 20px;white-space:pre-wrap;font-size:13px;max-height:420px;overflow:auto"></pre>
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
                <button type="button" class="btn-outline" id="refreshCustomersBtn">Refresh list</button>
              </div>
            </div>
            <div class="customer-sort-bar">
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
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Phone</th><th>Name</th><th>Email</th><th>Tier</th><th>Source</th><th>Birthday in</th><th>Vouchers</th><th>Status</th><th>Points</th><th>Spent</th><th>Refs</th><th>Last visit</th><th>Edit</th></tr></thead>
                <tbody id="customersBody"></tbody>
              </table>
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

        <section id="loyalty-rewards-catalog" class="tab-panel hidden">
          <div class="info-banner" style="margin-top:0">
            Configure how items appear in the <strong>member app Rewards</strong> tab: image URL, points cost, category, visibility, date window, sort order, and optional max total issues.
            New definitions: use <strong>Loyalty → Voucher definitions → Create definition</strong>, or the editor below for catalog fields on existing codes.
          </div>
          <div class="sheet">
            <div class="sheet-head">
              <h2>Rewards catalog (voucher definitions)</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshLoyaltyRewardsBtn">Refresh</button>
              </div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Code</th><th>Title</th><th>Voucher ID</th><th>Image</th><th>Points</th><th>Category</th><th>Catalog</th><th>Valid</th><th>Sort</th><th>Max issued</th><th>Status</th><th>Edit</th></tr></thead>
                <tbody id="loyaltyRewardsCatalogBody"></tbody>
              </table>
            </div>
          </div>
          <div id="rewardDefEditor" class="sheet hidden" style="margin-top:16px">
            <div class="sheet-head"><h2>Edit catalog entry</h2><button type="button" class="btn-outline" id="rewardDefEditorCancel">Close</button></div>
            <div style="padding:16px 20px;max-width:560px">
              <input type="hidden" id="rdEditId" />
              <div class="form-section"><label>Code</label><input type="text" id="rdCode" readonly /></div>
              <div class="form-section"><label for="rdTitle">Title</label><input type="text" id="rdTitle" maxlength="200" /></div>
              <div class="form-section"><label for="rdDescription">Description</label><textarea id="rdDescription" maxlength="2000"></textarea></div>
              <div class="form-row-2">
                <div class="form-section"><label for="rdPoints">Points cost</label><input type="number" id="rdPoints" min="0" step="1" /></div>
                <div class="form-section"><label for="rdCategory">Category</label><input type="text" id="rdCategory" maxlength="64" placeholder="food, drinks…" /></div>
              </div>
              <div class="form-section"><label for="rdImageUrl">Image URL</label><input type="text" id="rdImageUrl" maxlength="2000" placeholder="https://…" /></div>
              <div class="form-row-2">
                <div class="form-section"><label for="rdValidFrom">Valid from (ISO date)</label><input type="date" id="rdValidFrom" /></div>
                <div class="form-section"><label for="rdValidUntil">Valid until</label><input type="date" id="rdValidUntil" /></div>
              </div>
              <div class="form-row-2">
                <div class="form-section"><label for="rdSort">Sort order</label><input type="number" id="rdSort" step="1" value="0" /></div>
                <div class="form-section"><label for="rdMaxIssued">Max total issued</label><input type="number" id="rdMaxIssued" min="1" step="1" placeholder="empty = unlimited" /></div>
              </div>
              <div class="form-section"><label><input type="checkbox" id="rdShowCatalog" style="width:auto;margin-right:8px" /> Show in member rewards catalog</label></div>
              <div class="form-section"><label><input type="checkbox" id="rdActive" style="width:auto;margin-right:8px" /> Definition active</label></div>
              <button type="button" class="btn-primary" id="rdSaveBtn">Save changes</button>
              <p class="field-hint" id="rdSaveResult"></p>
            </div>
          </div>
        </section>

        <section id="loyalty-voucher-push-rules" class="tab-panel hidden">
          <div class="info-banner" style="margin-top:0">
            <strong>Automated voucher entitlement rules</strong> (configuration). Execution can be wired to signup, wallet top-up, referral, or scheduled jobs.
            Suggested <code>triggerConfig</code> keys: <code>withinDaysOfSignup</code> (newcomer), <code>minLifetimeTopUpCents</code> (top-up), <code>minReferrals</code> (referral), <code>inactiveDays</code> (re-engagement).
            Use <strong>Campaigns → Push voucher</strong> for immediate bulk issue with filters.
          </div>
          <div class="sheet">
            <div class="sheet-head">
              <h2>Voucher push rules</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshVoucherPushRulesBtn">Refresh</button>
              </div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Name</th><th>Trigger</th><th>Voucher</th><th>Active</th><th>Sort</th><th>Limits</th><th>Edit</th></tr></thead>
                <tbody id="voucherPushRulesBody"></tbody>
              </table>
            </div>
          </div>
          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>New rule</h2></div>
            <div style="padding:16px 20px;max-width:560px">
              <div class="form-section"><label for="vprName">Name</label><input type="text" id="vprName" maxlength="200" /></div>
              <div class="form-section"><label for="vprDesc">Description</label><textarea id="vprDesc" maxlength="2000"></textarea></div>
              <div class="form-row-2">
                <div class="form-section"><label for="vprTrigger">Trigger type</label>
                  <select id="vprTrigger">
                    <option value="NEWCOMER">Newcomer</option>
                    <option value="TOPUP_THRESHOLD">Top-up threshold</option>
                    <option value="REFERRAL">Referral</option>
                    <option value="BIRTHDAY">Birthday</option>
                    <option value="REENGAGEMENT">Re-engagement</option>
                  </select>
                </div>
                <div class="form-section"><label for="vprVoucherDefId">Voucher definition ID</label><input type="text" id="vprVoucherDefId" placeholder="UUID from catalog" /></div>
              </div>
              <div class="form-section"><label for="vprConfigJson">Trigger config (JSON)</label><textarea id="vprConfigJson" rows="4" placeholder='{"withinDaysOfSignup":14}'></textarea></div>
              <div class="form-row-2">
                <div class="form-section"><label for="vprSort">Sort order</label><input type="number" id="vprSort" value="0" step="1" /></div>
                <div class="form-section"><label for="vprMaxGrants">Max grants / customer</label><input type="number" id="vprMaxGrants" min="1" step="1" placeholder="optional" /></div>
              </div>
              <div class="form-section"><label for="vprCooldown">Cooldown (days)</label><input type="number" id="vprCooldown" min="0" step="1" placeholder="optional" /></div>
              <button type="button" class="btn-primary" id="vprCreateBtn">Create rule</button>
              <p class="field-hint" id="vprCreateResult"></p>
            </div>
          </div>
          <div id="vprEditPanel" class="sheet hidden" style="margin-top:16px">
            <div class="sheet-head"><h2>Edit rule</h2><button type="button" class="btn-outline" id="vprEditCancel">Close</button></div>
            <div style="padding:16px 20px;max-width:560px">
              <input type="hidden" id="vprEditId" />
              <div class="form-section"><label for="vprEditName">Name</label><input type="text" id="vprEditName" maxlength="200" /></div>
              <div class="form-section"><label for="vprEditDesc">Description</label><textarea id="vprEditDesc" maxlength="2000"></textarea></div>
              <div class="form-row-2">
                <div class="form-section"><label for="vprEditTrigger">Trigger</label>
                  <select id="vprEditTrigger">
                    <option value="NEWCOMER">Newcomer</option>
                    <option value="TOPUP_THRESHOLD">Top-up threshold</option>
                    <option value="REFERRAL">Referral</option>
                    <option value="BIRTHDAY">Birthday</option>
                    <option value="REENGAGEMENT">Re-engagement</option>
                  </select>
                </div>
                <div class="form-section"><label for="vprEditVoucherId">Voucher definition ID</label><input type="text" id="vprEditVoucherId" /></div>
              </div>
              <div class="form-section"><label for="vprEditConfig">Config JSON</label><textarea id="vprEditConfig" rows="4"></textarea></div>
              <div class="form-row-2">
                <div class="form-section"><label for="vprEditSort">Sort</label><input type="number" id="vprEditSort" step="1" /></div>
                <div class="form-section"><label for="vprEditMax">Max / customer</label><input type="number" id="vprEditMax" min="1" step="1" /></div>
              </div>
              <div class="form-section"><label for="vprEditCooldown">Cooldown days</label><input type="number" id="vprEditCooldown" min="0" step="1" /></div>
              <div class="form-section"><label><input type="checkbox" id="vprEditActive" style="width:auto;margin-right:8px" /> Active</label></div>
              <button type="button" class="btn-primary" id="vprSaveBtn">Save rule</button>
              <p class="field-hint" id="vprSaveResult"></p>
            </div>
          </div>
        </section>

        <section id="vouchers-list" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Voucher definitions</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="toggleVoucherCreateBtn">Create definition</button>
                <button type="button" class="btn-outline" id="refreshVouchersBtn">Refresh</button>
              </div>
            </div>
            <div id="voucherCreatePanel" class="hidden" style="padding:16px 20px;border-bottom:1px solid rgba(0,0,0,0.08);max-width:520px">
              <div class="form-section">
                <label for="vcCode">Code</label>
                <input type="text" id="vcCode" maxlength="64" />
              </div>
              <div class="form-section">
                <label for="vcTitle">Title</label>
                <input type="text" id="vcTitle" maxlength="200" />
              </div>
              <div class="form-section">
                <label for="vcDescription">Description (optional)</label>
                <textarea id="vcDescription" maxlength="2000"></textarea>
              </div>
              <div class="form-section">
                <label for="vcPoints">Points cost (optional)</label>
                <input type="number" id="vcPoints" min="0" step="1" />
              </div>
              <button type="button" class="btn-primary" id="vcCreateBtn">Create definition</button>
              <p class="field-hint" id="vcCreateResult" style="margin-top:12px"></p>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Code</th><th>Title</th><th>Points cost</th><th>Status</th></tr></thead>
                <tbody id="voucherBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="vouchers-templates" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Voucher templates</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshVoucherTemplatesBtn">Refresh</button></div></div>
            <p class="muted-hint" style="padding:12px 20px 0;margin:0">Templates are the same catalog as voucher definitions (reusable offers).</p>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Code</th><th>Title</th><th>Points cost</th><th>Status</th></tr></thead>
                <tbody id="voucherTemplateBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="vouchers-assigned" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Assigned vouchers</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshAssignedVouchersBtn">Refresh</button></div></div>
            <p class="muted-hint" style="padding:12px 20px 0;margin:0">Recent activity from overview feed.</p>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Member</th><th>Code</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody id="voucherAssignedBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="vouchers-redemption" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Redemption overview</h2>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Issued (active)</div><div class="kpi-value" id="vrIssued">-</div></div>
              <div class="kpi"><div class="kpi-label">Redeemed</div><div class="kpi-value" id="vrRedeemed">-</div></div>
              <div class="kpi"><div class="kpi-label">Expired</div><div class="kpi-value" id="vrExpired">-</div></div>
              <div class="kpi"><div class="kpi-label">Void</div><div class="kpi-value" id="vrVoid">-</div></div>
              <div class="kpi"><div class="kpi-label">Redemption rate</div><div class="kpi-value" id="vrRate">-</div></div>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Export &amp; detail</h2></div>
            <div class="muted-box">Use <code>POST /admin/export/run</code> with kind <code>VOUCHERS_ISSUED</code> or <code>VOUCHERS_REDEEMED</code> for full extracts. Deeper campaign-level redemption reports can be added here later.</div>
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
                <label for="saBucket">Bucket</label>
                <select id="saBucket" aria-label="Time bucket">
                  <option value="day">Days</option>
                  <option value="week">Weeks</option>
                  <option value="month">Months</option>
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
                <div class="sa-kpi-card-title">GMV (completed)</div>
                <div class="sa-kpi-card-value" id="saValGmv">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaGmv">—</div>
              </button>
              <button type="button" class="sa-kpi-card" data-sa-metric="orders" id="saCardOrders">
                <div class="sa-kpi-card-title">Completed orders</div>
                <div class="sa-kpi-card-value" id="saValOrders">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaOrders">—</div>
              </button>
              <button type="button" class="sa-kpi-card" data-sa-metric="aov" id="saCardAov">
                <div class="sa-kpi-card-title">Avg order value</div>
                <div class="sa-kpi-card-value" id="saValAov">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaAov">—</div>
              </button>
              <button type="button" class="sa-kpi-card" data-sa-metric="wallet" id="saCardWallet">
                <div class="sa-kpi-card-title">Wallet spend</div>
                <div class="sa-kpi-card-value" id="saValWallet">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaWallet">—</div>
              </button>
              <button type="button" class="sa-kpi-card" data-sa-metric="points" id="saCardPts">
                <div class="sa-kpi-card-title">Points redeemed</div>
                <div class="sa-kpi-card-value" id="saValPts">—</div>
                <div class="sa-kpi-card-delta" id="saDeltaPts">—</div>
              </button>
            </div>

            <p class="sa-substats" id="saSubstats">
              <strong>Scope:</strong> completed orders use <code>COALESCE(completed_at, placed_at)</code> (UTC). Wallet &amp; loyalty totals are ledger activity in the same date window. <strong>Open orders (placed in range):</strong> <span id="saOpen">—</span>
              · <strong>Points issued:</strong> <span id="saPtsIn">—</span>
              · <strong>Wallet top-up:</strong> <span id="saWalTop">—</span>
              · <strong>Vouchers issued / redeemed:</strong> <span id="saVIss">—</span> / <span id="saVRed">—</span>
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
                <div class="sa-panel-head">Top products (quantity)</div>
                <div class="table-wrap">
                  <table class="data">
                    <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Revenue</th><th>Orders</th></tr></thead>
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

            <div class="sa-export-block sa-panel" style="margin-top:20px">
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

        <section id="reports-vouchers" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Voucher reports</h2>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Issued</div><div class="kpi-value" id="rpVIssued">-</div></div>
              <div class="kpi"><div class="kpi-label">Redeemed</div><div class="kpi-value" id="rpVRedeemed">-</div></div>
              <div class="kpi"><div class="kpi-label">Redemption rate</div><div class="kpi-value" id="rpVRate">-</div></div>
            </div>
          </div>
        </section>

        <section id="reports-loyalty" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Loyalty reports</h2>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Points issued</div><div class="kpi-value" id="rpPtsIssued">-</div></div>
              <div class="kpi"><div class="kpi-label">Points redeemed</div><div class="kpi-value" id="rpPtsRedeemed">-</div></div>
            </div>
          </div>
        </section>

        <section id="settings-roles" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Roles &amp; permissions</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshAdminUsersBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Permissions</th></tr></thead>
                <tbody id="adminUsersBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="settings-master-data" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Master data</h2></div>
            <div class="coming-soon">
              Master entries and business rules are managed through <code>/admin/master/entries</code> and <code>/admin/master/rules</code>. UI workflow will include staged edits, validation, and rollback-friendly audit trails.
            </div>
          </div>
        </section>

        <section id="settings-notifications" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Notification templates</h2></div>
            <div class="coming-soon">
              Notification templates are not yet wired in this dashboard. Planned controls include variable previews, test-send to admin-only numbers, and approval checkpoints before activation.
            </div>
          </div>
        </section>

        <section id="settings-system" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>System config</h2></div>
            <div class="coming-soon">
              System configuration (feature flags and sensitive runtime settings) should be read-only by default, with explicit privileged edit mode and full audit logging for each change.
            </div>
          </div>
        </section>

        <section id="settings-shopping-catalog" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Shopping catalog</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshShopCatalogBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Sort</th><th>Visible</th><th>Edit</th></tr></thead>
                <tbody id="shopCatalogBody"></tbody>
              </table>
            </div>
          </div>
          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Edit product</h2></div>
            <div style="padding:16px 20px;max-width:640px">
              <input type="hidden" id="scId" />
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
              <div class="form-section"><label for="scImageUrl">Image URL</label><input type="text" id="scImageUrl" placeholder="https://..." /></div>
              <div class="form-row-2">
                <div class="form-section"><label for="scPrice">Base price (cents)</label><input type="number" id="scPrice" min="0" step="1" /></div>
                <div class="form-section"><label for="scSort">Sort order</label><input type="number" id="scSort" step="1" value="0" /></div>
              </div>
              <div class="form-section"><label><input type="checkbox" id="scActive" style="width:auto;margin-right:8px" /> Show in client app</label></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn-primary" id="scSaveBtn">Save product</button>
                <button type="button" class="btn-outline" id="scNewBtn">New product</button>
              </div>
              <p class="field-hint" id="scSaveResult"></p>
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

  <div id="editMemberBackdrop" class="modal-backdrop hidden" aria-hidden="true"></div>
  <div id="authBackdrop" class="modal-backdrop hidden" aria-hidden="true"></div>
  <div id="authModal" class="modal-panel hidden" role="dialog" aria-modal="true" aria-labelledby="authTitle">
    <div class="modal-head">
      <h2 id="authTitle">Connect to Admin API</h2>
      <button type="button" class="icon-btn" id="authClose" aria-label="Close" style="margin:0">&times;</button>
    </div>
    <div class="modal-body">
      <div class="auth-form-grid">
        <div class="auth-mode-tabs">
          <button type="button" class="auth-mode-btn active" id="authTabKey">API key</button>
          <button type="button" class="auth-mode-btn" id="authTabJwt">Email &amp; password</button>
        </div>
        <div id="authKeyPanel">
          <div class="form-section" style="margin-top:0">
            <label for="apiKey">Admin API key</label>
            <input id="apiKey" type="password" placeholder="x-admin-api-key header value" autocomplete="off" />
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
        <p class="muted-hint" id="authHelpText">Use API key for service access, or sign in to get JWT.</p>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn-outline" id="authCancel">Cancel</button>
      <button type="button" class="btn-primary" id="authSubmit">Connect</button>
    </div>
  </div>
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
            <p class="field-hint">Leave blank to leave the stored email unchanged.</p>
          </div>
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

  <script>
    const navButtons = () => document.querySelectorAll('.nav-btn');
    const views = [
      'dashboard-overview', 'dashboard-activity', 'dashboard-employees',
      'customers-list', 'customer-orders', 'customers-segments', 'customers-merge',
      'wallet-balances', 'wallet-transactions', 'wallet-adjustment', 'wallet-rules',
      'loyalty-balances', 'loyalty-transactions', 'loyalty-rules', 'loyalty-campaigns',
      'loyalty-rewards-catalog', 'loyalty-voucher-push-rules',
      'vouchers-list', 'vouchers-templates', 'vouchers-assigned', 'vouchers-redemption',
      'campaigns-segments', 'campaigns-push-voucher', 'campaigns-push-points', 'campaigns-push-wallet', 'campaigns-history',
      'data-import', 'data-export', 'data-templates', 'data-import-history',
      'reports-customers', 'reports-sales', 'reports-vouchers', 'reports-loyalty',
      'settings-roles', 'settings-master-data', 'settings-notifications', 'settings-system', 'settings-shopping-catalog',
      'audit', 'audit-logins',
    ];
    let hiddenViews = new Set();
    const title = document.getElementById('title');
    const titleIcon = document.getElementById('titleIcon');
    const statusPanel = document.getElementById('statusPanel');
    const apiKeyInput = document.getElementById('apiKey');
    const connectBtn = document.getElementById('connectBtn');
    const refreshDataBtn = document.getElementById('refreshDataBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const connectionDot = document.getElementById('connectionDot');
    const connectionStateText = document.getElementById('connectionStateText');
    const connectionMeta = document.getElementById('connectionMeta');
    const authBackdrop = document.getElementById('authBackdrop');
    const authModal = document.getElementById('authModal');
    const authClose = document.getElementById('authClose');
    const authCancel = document.getElementById('authCancel');
    const authSubmit = document.getElementById('authSubmit');
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
      'loyalty-rewards-catalog': iconLoyalty,
      'loyalty-voucher-push-rules': iconLoyalty,
      'vouchers-list': iconVoucher,
      'vouchers-templates': iconVoucher,
      'vouchers-assigned': iconVoucher,
      'vouchers-redemption': iconVoucher,
      'campaigns-segments': iconUsers,
      'campaigns-push-voucher': iconVoucher,
      'campaigns-push-points': iconLoyalty,
      'campaigns-push-wallet': iconWallet,
      'campaigns-history': '<path d="M3 3v5h5"/><path d="M3.05 13a9 9 0 1 0 .5-4"/><polyline points="12 7 12 12 15 15"/>',
      'data-import': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
      'data-export': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
      'data-templates': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><line x1="7" y1="10" x2="17" y2="10"/>',
      'data-import-history': iconAudit,
      'reports-customers': iconUsers,
      'reports-sales': '<path d="M3 3v18h18"/><path d="M7 16l4-6 3 4 5-8"/>',
      'reports-vouchers': iconVoucher,
      'reports-loyalty': iconLoyalty,
      'settings-roles': iconUsers,
      'settings-master-data': iconAudit,
      'settings-notifications': iconAudit,
      'settings-system': iconAudit,
      'settings-shopping-catalog': iconVoucher,
      audit: iconAudit,
      'audit-logins': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
    };
    const viewTitles = {
      'dashboard-overview': 'Dashboard · Overview',
      'dashboard-activity': 'Dashboard · Activity feed',
      'dashboard-employees': 'Dashboard · Employee management',
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
      'loyalty-rewards-catalog': 'Loyalty · Rewards catalog',
      'loyalty-voucher-push-rules': 'Loyalty · Voucher push rules',
      'vouchers-list': 'Loyalty · Voucher definitions',
      'vouchers-templates': 'Vouchers · Templates',
      'vouchers-assigned': 'Vouchers · Assigned',
      'vouchers-redemption': 'Vouchers · Redemption tracking',
      'campaigns-segments': 'Campaigns · Customer segments',
      'campaigns-push-voucher': 'Campaigns · Push voucher',
      'campaigns-push-points': 'Campaigns · Push points',
      'campaigns-push-wallet': 'Campaigns · Push wallet bonus',
      'campaigns-history': 'Campaigns · History',
      'data-import': 'Data Tools · Import data',
      'data-export': 'Data Tools · Export data',
      'data-templates': 'Data Tools · Template downloads',
      'data-import-history': 'Data Tools · Import history',
      'reports-customers': 'Reports · Customer reports',
      'reports-sales': 'Customers · Sales & transactions',
      'reports-vouchers': 'Reports · Voucher reports',
      'reports-loyalty': 'Reports · Loyalty reports',
      'settings-roles': 'Settings · Roles & permissions',
      'settings-master-data': 'Settings · Master data',
      'settings-notifications': 'Settings · Notification templates',
      'settings-system': 'Settings · System config',
      'settings-shopping-catalog': 'Settings · Shopping catalog',
      audit: 'Audit · Audit logs',
      'audit-logins': 'Audit · Admin login logs',
    };

    let lastVoucherDefinitions = [];
    let lastPushRules = [];
    let lastShopCatalogProducts = [];
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
      return (
        'from=' +
        encodeURIComponent(fromIso) +
        '&to=' +
        encodeURIComponent(toIso) +
        '&bucket=' +
        encodeURIComponent(bucket)
      );
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
          '<p class="muted-hint" style="margin:0;padding:48px 16px;text-align:center">No completed orders in this range.</p>';
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
        tb.innerHTML = rows.join('') || '<tr><td colspan="5">No products</td></tr>';
        const best = document.getElementById('saBestSeller');
        if (data.bestSeller) {
          const b = data.bestSeller;
          best.innerHTML =
            '<strong>' +
            fmt(b.name) +
            '</strong> <span class="muted-hint">(' +
            fmt(b.productId) +
            ')</span><br/>Qty sold: ' +
            fmt(b.qtySold) +
            ' · Revenue: ' +
            moneyFromCents(b.revenueCents) +
            ' · Orders: ' +
            fmt(b.orders);
        } else {
          best.innerHTML = '<span class="muted-hint">No completed order lines in this range.</span>';
        }
        if (hint) {
          hint.textContent =
            'Loaded · ' +
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
      authSubmit.textContent = jwt ? 'Sign in & connect' : 'Use API key';
    }
    setAuthTab(currentAuthMode);

    function updateConnectionUi() {
      connectionDot.classList.toggle('connected', isConnected);
      if (isConnected) {
        connectionStateText.textContent = 'Connected';
        connectionMeta.textContent = currentAuthMode === 'jwt'
          ? 'Authenticated with email/password (JWT).'
          : 'Authenticated with API key.';
        connectBtn.textContent = 'Manage connection';
      } else {
        connectionStateText.textContent = 'Not connected';
        const hasJwt = !!localStorage.getItem('moja_admin_jwt');
        const hasKey = !!normalizeKey(apiKeyInput.value);
        connectionMeta.textContent = (hasJwt || hasKey)
          ? 'Credentials saved locally. Click Refresh data to verify connectivity.'
          : 'Authenticate with API key or email/password to load data.';
        connectBtn.textContent = 'Connect';
      }
    }

    function openAuthModal() {
      setAuthTab(currentAuthMode);
      authBackdrop.classList.remove('hidden');
      authModal.classList.remove('hidden');
    }

    function closeAuthModal() {
      authBackdrop.classList.add('hidden');
      authModal.classList.add('hidden');
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

    async function loadCustomers() {
      const sortBy = document.getElementById('customerSortBy')
        ? document.getElementById('customerSortBy').value
        : customerSortBy;
      const sortDir = document.getElementById('customerSortDir')
        ? document.getElementById('customerSortDir').value
        : customerSortDir;
      customerSortBy = sortBy;
      customerSortDir = sortDir;
      const q =
        '/admin/customers?page=1&pageSize=20&sortBy=' +
        encodeURIComponent(sortBy) +
        '&sortDir=' +
        encodeURIComponent(sortDir);
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
      const lr = document.getElementById('loyaltyRewardsCatalogBody');
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
          '</td><td>' + fmt(v.pointsCost) + '</td><td>' + fmt(v.rewardCategory) + '</td><td>' +
          (v.showInRewardsCatalog ? statusPill('YES') : statusPill('NO')) + '</td><td>' + formatRewardWindow(v) + '</td><td>' + fmt(v.rewardSortOrder) + '</td><td>' +
          fmt(v.maxTotalIssued) + '</td><td>' + statusPill(v.isActive ? 'ACTIVE' : 'INACTIVE') + '</td><td class="td-actions">' +
          '<button type="button" class="icon-btn reward-def-edit-btn" data-id="' + v.id + '" title="Edit">' + editSvg + '</button></td></tr>'
        ).join('') || '<tr><td colspan="12">No data</td></tr>';
      }
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

    async function loadVoucherPushRules() {
      const data = await api('/admin/voucher-push-rules');
      lastPushRules = data || [];
      const editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      const body = document.getElementById('voucherPushRulesBody');
      if (!body) return;
      body.innerHTML = (data || []).map((r) => {
        var vd = r.voucherDefinition || {};
        var lim = (r.maxGrantsPerCustomer != null ? 'max ' + r.maxGrantsPerCustomer : '—') + ' · cd ' + (r.cooldownDays != null ? r.cooldownDays + 'd' : '—');
        return '<tr><td>' + fmt(r.name) + '</td><td>' + fmt(r.triggerType) + '</td><td>' + fmt(vd.code) + '</td><td>' +
          (r.isActive ? statusPill('ACTIVE') : statusPill('OFF')) + '</td><td>' + fmt(r.sortOrder) + '</td><td>' + lim + '</td><td class="td-actions">' +
          '<button type="button" class="icon-btn vpr-edit-btn" data-id="' + r.id + '" title="Edit">' + editSvg + '</button></td></tr>';
      }).join('') || '<tr><td colspan="7">No rules yet</td></tr>';
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
      document.getElementById('rpVIssued').textContent = fmt(data.overview?.vouchers?.issued);
      document.getElementById('rpVRedeemed').textContent = fmt(data.overview?.vouchers?.redeemed);
      const rr = data.overview?.vouchers?.redemptionRate;
      document.getElementById('rpVRate').textContent = rr != null ? (Math.round(rr * 10000) / 100) + '%' : '-';
      document.getElementById('rpPtsIssued').textContent = fmt(data.overview?.loyalty?.pointsIssued);
      document.getElementById('rpPtsRedeemed').textContent = fmt(data.overview?.loyalty?.pointsRedeemed);
      lastRpMarketing = data.marketing || null;
      paintMarketing(lastRpMarketing, 'mkRp');
      const rpSp = document.getElementById('mkRpSpenderPeriod');
      paintSpenderPeriod('mkRp', lastRpMarketing, rpSp ? rpSp.value : 'all');
    }

    async function loadAdminUsers() {
      const data = await api('/admin/users');
      const rows = (data || []).map((u) =>
        '<tr><td>' + fmt(u.email) + '</td><td>' + fmt(u.displayName) + '</td><td>' + statusPill(u.isActive ? 'ACTIVE' : 'INACTIVE') + '</td><td>' + fmt((u.permissions || []).join(', ')) + '</td></tr>'
      );
      document.getElementById('adminUsersBody').innerHTML = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    async function loadShopCatalog() {
      const data = await api('/admin/shop-catalog/products');
      lastShopCatalogProducts = data || [];
      const editSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      document.getElementById('shopCatalogBody').innerHTML = (data || []).map(function (p) {
        return '<tr><td>' + fmt(p.name) + '</td><td>' + fmt(p.category) + '</td><td>' + fmt(p.basePriceCents) + '</td><td>' + fmt(p.sortOrder) + '</td><td>' +
          (p.isActive ? statusPill('YES') : statusPill('NO')) + '</td><td class="td-actions"><button type="button" class="icon-btn sc-edit-btn" data-id="' + fmt(p.id) + '">' + editSvg + '</button></td></tr>';
      }).join('') || '<tr><td colspan="6">No products</td></tr>';
    }

    let lastEmployeesList = [];

    function emEscapeAttr(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
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
      document.getElementById('emStdMin').value = String(s.standardWorkdayMinutes);
      document.getElementById('emOtBps').value = String(s.overtimeMultiplierBps);
      document.getElementById('emPhBps').value = String(s.publicHolidayMultiplierBps);
      document.getElementById('emOffBps').value = String(s.offDayWorkedMultiplierBps);
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
              Number(e.hourlyRateCents || 0) +
              '" style="width:90px"/></td><td><input type="number" class="em-inp-comm" min="0" step="1" value="' +
              Number(e.commissionRateBps || 0) +
              '" style="width:80px"/></td><td><input type="checkbox" class="em-inp-active" ' +
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

    async function loadAll() {
      statusPanel.innerHTML = 'Loading&hellip;';
      const tasks = [
        loadOverview(),
        loadCustomers(),
        loadLoyalty(),
        loadVouchers(),
        loadWalletLedger(),
        loadAudit(),
        loadLoginAudit(),
        loadCampaignSegments(),
        loadCampaignHistory(),
        loadCampaignVoucherInsights(),
        loadImportHistory(),
        loadExportJobs(),
        loadReporting(),
        loadAdminUsers(),
        loadVoucherPushRules(),
        loadShopCatalog(),
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

    connectBtn.addEventListener('click', openAuthModal);
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
      statusPanel.textContent = 'Disconnected. Open Connect to authenticate again.';
    });
    authTabKey.addEventListener('click', () => setAuthTab('key'));
    authTabJwt.addEventListener('click', () => setAuthTab('jwt'));
    authClose.addEventListener('click', closeAuthModal);
    authCancel.addEventListener('click', closeAuthModal);
    authBackdrop.addEventListener('click', closeAuthModal);
    authSubmit.addEventListener('click', async () => {
      if (currentAuthMode === 'jwt') {
        const email = adminEmail.value.trim();
        const password = adminPassword.value;
        if (!email || !password) {
          statusPanel.textContent = 'Enter email and password.';
          return;
        }
        statusPanel.textContent = 'Signing in…';
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
          closeAuthModal();
          statusPanel.textContent = 'Connected with JWT.';
        } catch (err) {
          isConnected = false;
          updateConnectionUi();
          statusPanel.textContent = err.message || String(err);
        }
        return;
      }
      const key = normalizeKey(apiKeyInput.value);
      if (!key) {
        statusPanel.textContent = 'Please enter API key.';
        return;
      }
      apiKeyInput.value = key;
      localStorage.setItem('moja_admin_api_key', key);
      try {
        await loadAll();
        closeAuthModal();
        statusPanel.textContent = 'Connected with API key.';
      } catch (err) {
        isConnected = false;
        updateConnectionUi();
        statusPanel.textContent = err.message || String(err);
      }
    });
    [apiKeyInput, adminEmail, adminPassword].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          authSubmit.click();
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
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !authModal.classList.contains('hidden')) {
        closeAuthModal();
      }
      if (e.key === 'Escape' && !document.getElementById('editMemberModal').classList.contains('hidden')) {
        closeEditMemberModal();
      }
    });
    document.getElementById('refreshCustomersBtn').addEventListener('click', () => loadCustomers().catch((e) => { statusPanel.textContent = e.message; }));
    const customerSortByEl = document.getElementById('customerSortBy');
    const customerSortDirEl = document.getElementById('customerSortDir');
    if (customerSortByEl) {
      customerSortByEl.addEventListener('change', () => loadCustomers().catch((e) => { statusPanel.textContent = e.message; }));
    }
    if (customerSortDirEl) {
      customerSortDirEl.addEventListener('change', () => loadCustomers().catch((e) => { statusPanel.textContent = e.message; }));
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
    document.getElementById('refreshVouchersBtn').addEventListener('click', () => loadVouchers().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshVoucherTemplatesBtn').addEventListener('click', () => loadVouchers().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshAssignedVouchersBtn').addEventListener('click', () => loadOverview().catch((e) => { statusPanel.textContent = e.message; }));
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
    document.getElementById('refreshAdminUsersBtn').addEventListener('click', () => loadAdminUsers().catch((e) => { statusPanel.textContent = e.message; }));

    function saBind(id, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    }
    saBind('saRefreshBtn', () => {
      loadSalesAnalytics().catch((e) => {
        statusPanel.textContent = e.message || String(e);
      });
    });
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
    document.getElementById('toggleVoucherCreateBtn').addEventListener('click', () => {
      const p = document.getElementById('voucherCreatePanel');
      if (p) p.classList.toggle('hidden');
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

    document.getElementById('refreshLoyaltyRewardsBtn').addEventListener('click', () => loadVouchers().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshVoucherPushRulesBtn').addEventListener('click', () => loadVoucherPushRules().catch((e) => { statusPanel.textContent = e.message; }));
    document.getElementById('refreshShopCatalogBtn').addEventListener('click', () => loadShopCatalog().catch((e) => { statusPanel.textContent = e.message; }));

    function isoDateOnly(d) {
      if (!d) return '';
      var x = new Date(d);
      if (Number.isNaN(x.getTime())) return '';
      return x.toISOString().slice(0, 10);
    }

    document.getElementById('loyaltyRewardsCatalogBody').addEventListener('click', (e) => {
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
      document.getElementById('rdCategory').value = v.rewardCategory || '';
      document.getElementById('rdImageUrl').value = v.imageUrl || '';
      document.getElementById('rdValidFrom').value = isoDateOnly(v.rewardValidFrom);
      document.getElementById('rdValidUntil').value = isoDateOnly(v.rewardValidUntil);
      document.getElementById('rdSort').value = v.rewardSortOrder != null ? String(v.rewardSortOrder) : '0';
      document.getElementById('rdMaxIssued').value = v.maxTotalIssued != null ? String(v.maxTotalIssued) : '';
      document.getElementById('rdShowCatalog').checked = !!v.showInRewardsCatalog;
      document.getElementById('rdActive').checked = !!v.isActive;
      document.getElementById('rewardDefEditor').classList.remove('hidden');
      document.getElementById('rdSaveResult').textContent = '';
    });

    document.getElementById('rewardDefEditorCancel').addEventListener('click', () => {
      document.getElementById('rewardDefEditor').classList.add('hidden');
    });

    document.getElementById('rdSaveBtn').addEventListener('click', () => {
      var id = document.getElementById('rdEditId').value;
      var out = document.getElementById('rdSaveResult');
      if (!id) return;
      var pcVal = document.getElementById('rdPoints').value;
      var body = {
        title: document.getElementById('rdTitle').value.trim(),
        description: document.getElementById('rdDescription').value.trim() || null,
        pointsCost: pcVal === '' ? undefined : parseInt(pcVal, 10),
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
          return loadVouchers();
        })
        .catch(function (err) { out.textContent = err.message; });
    });

    document.getElementById('voucherPushRulesBody').addEventListener('click', (e) => {
      var btn = e.target.closest('.vpr-edit-btn');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var r = lastPushRules.find(function (x) { return x.id === id; });
      if (!r) return;
      document.getElementById('vprEditId').value = r.id;
      document.getElementById('vprEditName').value = r.name || '';
      document.getElementById('vprEditDesc').value = r.description || '';
      document.getElementById('vprEditTrigger').value = r.triggerType || 'NEWCOMER';
      document.getElementById('vprEditVoucherId').value = r.voucherDefinitionId || (r.voucherDefinition && r.voucherDefinition.id) || '';
      document.getElementById('vprEditConfig').value = JSON.stringify(r.triggerConfig || {}, null, 2);
      document.getElementById('vprEditSort').value = r.sortOrder != null ? String(r.sortOrder) : '0';
      document.getElementById('vprEditMax').value = r.maxGrantsPerCustomer != null ? String(r.maxGrantsPerCustomer) : '';
      document.getElementById('vprEditCooldown').value = r.cooldownDays != null ? String(r.cooldownDays) : '';
      document.getElementById('vprEditActive').checked = !!r.isActive;
      document.getElementById('vprEditPanel').classList.remove('hidden');
      document.getElementById('vprSaveResult').textContent = '';
    });

    document.getElementById('vprEditCancel').addEventListener('click', () => {
      document.getElementById('vprEditPanel').classList.add('hidden');
    });

    document.getElementById('vprCreateBtn').addEventListener('click', () => {
      var out = document.getElementById('vprCreateResult');
      var name = document.getElementById('vprName').value.trim();
      var vid = document.getElementById('vprVoucherDefId').value.trim();
      var raw = document.getElementById('vprConfigJson').value.trim();
      if (!name || !vid) {
        out.textContent = 'Name and voucher definition ID are required.';
        return;
      }
      var cfg = {};
      try {
        cfg = raw ? JSON.parse(raw) : {};
      } catch (err) {
        out.textContent = 'Invalid JSON in trigger config.';
        return;
      }
      out.textContent = 'Creating…';
      apiPost('/admin/voucher-push-rules', {
        name: name,
        description: document.getElementById('vprDesc').value.trim() || undefined,
        triggerType: document.getElementById('vprTrigger').value,
        triggerConfig: cfg,
        voucherDefinitionId: vid,
        sortOrder: parseInt(document.getElementById('vprSort').value, 10) || 0,
        maxGrantsPerCustomer: document.getElementById('vprMaxGrants').value === '' ? undefined : parseInt(document.getElementById('vprMaxGrants').value, 10),
        cooldownDays: document.getElementById('vprCooldown').value === '' ? undefined : parseInt(document.getElementById('vprCooldown').value, 10),
      })
        .then(function () {
          out.textContent = 'Created.';
          document.getElementById('vprName').value = '';
          document.getElementById('vprDesc').value = '';
          document.getElementById('vprVoucherDefId').value = '';
          document.getElementById('vprConfigJson').value = '';
          return loadVoucherPushRules();
        })
        .catch(function (err) { out.textContent = err.message; });
    });

    document.getElementById('vprSaveBtn').addEventListener('click', () => {
      var id = document.getElementById('vprEditId').value;
      var out = document.getElementById('vprSaveResult');
      if (!id) return;
      var raw = document.getElementById('vprEditConfig').value.trim();
      var cfg;
      try {
        cfg = raw ? JSON.parse(raw) : {};
      } catch (err) {
        out.textContent = 'Invalid JSON.';
        return;
      }
      out.textContent = 'Saving…';
      apiPatch('/admin/voucher-push-rules/' + encodeURIComponent(id), {
        name: document.getElementById('vprEditName').value.trim(),
        description: document.getElementById('vprEditDesc').value.trim() || null,
        triggerType: document.getElementById('vprEditTrigger').value,
        voucherDefinitionId: document.getElementById('vprEditVoucherId').value.trim(),
        triggerConfig: cfg,
        sortOrder: parseInt(document.getElementById('vprEditSort').value, 10) || 0,
        maxGrantsPerCustomer: document.getElementById('vprEditMax').value === '' ? null : parseInt(document.getElementById('vprEditMax').value, 10),
        cooldownDays: document.getElementById('vprEditCooldown').value === '' ? null : parseInt(document.getElementById('vprEditCooldown').value, 10),
        isActive: document.getElementById('vprEditActive').checked,
      })
        .then(function () {
          out.textContent = 'Saved.';
          return loadVoucherPushRules();
        })
        .catch(function (err) { out.textContent = err.message; });
    });

    document.getElementById('shopCatalogBody').addEventListener('click', (e) => {
      var btn = e.target.closest('.sc-edit-btn');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var p = lastShopCatalogProducts.find(function (x) { return x.id === id; });
      if (!p) return;
      document.getElementById('scId').value = p.id || '';
      document.getElementById('scName').value = p.name || '';
      document.getElementById('scCategory').value = p.category || 'specials';
      document.getElementById('scShort').value = p.shortDescription || '';
      document.getElementById('scDesc').value = p.description || '';
      document.getElementById('scImageUrl').value = p.imageUrl || '';
      document.getElementById('scPrice').value = p.basePriceCents != null ? String(p.basePriceCents) : '0';
      document.getElementById('scSort').value = p.sortOrder != null ? String(p.sortOrder) : '0';
      document.getElementById('scActive').checked = !!p.isActive;
      document.getElementById('scSaveResult').textContent = '';
    });

    document.getElementById('scNewBtn').addEventListener('click', () => {
      document.getElementById('scId').value = '';
      document.getElementById('scName').value = '';
      document.getElementById('scCategory').value = 'specials';
      document.getElementById('scShort').value = '';
      document.getElementById('scDesc').value = '';
      document.getElementById('scImageUrl').value = '';
      document.getElementById('scPrice').value = '0';
      document.getElementById('scSort').value = '0';
      document.getElementById('scActive').checked = true;
      document.getElementById('scSaveResult').textContent = '';
    });

    document.getElementById('scSaveBtn').addEventListener('click', () => {
      var id = document.getElementById('scId').value.trim();
      var out = document.getElementById('scSaveResult');
      var body = {
        name: document.getElementById('scName').value.trim(),
        category: document.getElementById('scCategory').value,
        shortDescription: document.getElementById('scShort').value.trim(),
        description: document.getElementById('scDesc').value.trim(),
        imageUrl: document.getElementById('scImageUrl').value.trim(),
        basePriceCents: parseInt(document.getElementById('scPrice').value, 10) || 0,
        sortOrder: parseInt(document.getElementById('scSort').value, 10) || 0,
        isActive: document.getElementById('scActive').checked,
      };
      if (!body.name) {
        out.textContent = 'Name is required.';
        return;
      }
      out.textContent = 'Saving…';
      var req = id
        ? apiPatch('/admin/shop-catalog/products/' + encodeURIComponent(id), body)
        : apiPost('/admin/shop-catalog/products', body);
      req
        .then(function () {
          out.textContent = id ? 'Updated.' : 'Created.';
          return loadShopCatalog();
        })
        .catch(function (err) { out.textContent = err.message; });
    });

    document.getElementById('vcCreateBtn').addEventListener('click', () => {
      const code = document.getElementById('vcCode').value.trim();
      const title = document.getElementById('vcTitle').value.trim();
      const description = document.getElementById('vcDescription').value.trim();
      const pc = document.getElementById('vcPoints').value;
      const out = document.getElementById('vcCreateResult');
      if (!code || !title) {
        out.textContent = 'Code and title are required.';
        return;
      }
      out.textContent = 'Creating…';
      const body = { code, title };
      if (description) body.description = description;
      if (pc !== '') body.pointsCost = parseInt(pc, 10);
      apiPost('/admin/voucher-definitions', body)
        .then(() => {
          out.textContent = 'Created. Refreshing lists.';
          return loadVouchers();
        })
        .catch((e) => { out.textContent = e.message; });
    });

    document.getElementById('emPayrollReloadBtn').addEventListener('click', function () {
      loadEmPayrollSettingsForm().catch(function (e) { statusPanel.textContent = e.message; });
    });
    document.getElementById('emPayrollSaveBtn').addEventListener('click', function () {
      var h = document.getElementById('emPayrollSaveHint');
      h.textContent = 'Saving…';
      apiPatch('/admin/employees/payroll-settings', {
        standardWorkdayMinutes: parseInt(document.getElementById('emStdMin').value, 10) || 480,
        overtimeMultiplierBps: parseInt(document.getElementById('emOtBps').value, 10) || 0,
        publicHolidayMultiplierBps: parseInt(document.getElementById('emPhBps').value, 10) || 0,
        offDayWorkedMultiplierBps: parseInt(document.getElementById('emOffBps').value, 10) || 0,
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
        hourlyRateCents: parseInt(document.getElementById('emNewRate').value, 10) || 0,
        commissionRateBps: parseInt(document.getElementById('emNewComm').value, 10) || 0,
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
        hourlyRateCents: parseInt(tr.querySelector('.em-inp-rate').value, 10) || 0,
        commissionRateBps: parseInt(tr.querySelector('.em-inp-comm').value, 10) || 0,
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
      var out = document.getElementById('emPayrollOut');
      if (!id || !from || !to) {
        out.textContent = 'Select employee and date range.';
        return;
      }
      out.textContent = 'Calculating…';
      apiPost('/admin/employees/payroll-preview', {
        employeeId: id,
        from: from,
        to: to,
        manualCommissionCents: parseInt(document.getElementById('emPayManual').value, 10) || 0,
      })
        .then(function (r) {
          out.textContent = JSON.stringify(r, null, 2);
        })
        .catch(function (e) { out.textContent = e.message; });
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
        });
      });
    }
    applyDashboardConfig().then(function () {
      wireNav();
    });
  </script>
</body>
</html>`;
  }
}
