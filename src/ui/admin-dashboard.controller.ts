import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class AdminDashboardController {
  @Get('admin-dashboard')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getDashboard(): string {
    return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Moja Admin Dashboard</title>
  <style>
    :root { --bg:#0f172a; --panel:#111827; --panel2:#1f2937; --text:#e5e7eb; --muted:#9ca3af; --accent:#22c55e; --line:#334155; }
    * { box-sizing:border-box; }
    body { margin:0; font-family: Inter, Arial, sans-serif; color:var(--text); background:var(--bg); }
    .layout { display:grid; grid-template-columns:260px 1fr; min-height:100vh; }
    .sidebar { border-right:1px solid var(--line); background:var(--panel); padding:20px 14px; }
    .brand { font-size:18px; font-weight:700; margin:4px 10px 20px; }
    .menu { display:flex; flex-direction:column; gap:8px; }
    .menu button { text-align:left; background:transparent; border:1px solid transparent; color:var(--text); padding:10px 12px; border-radius:10px; cursor:pointer; }
    .menu button:hover { background:#0b1220; border-color:var(--line); }
    .menu button.active { background:#0b1220; border-color:#14532d; color:#86efac; }
    .content { padding:22px; }
    .heading { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
    .heading h1 { margin:0; font-size:22px; }
    .badge { font-size:12px; border:1px solid #14532d; color:#86efac; padding:5px 9px; border-radius:999px; }
    .toolbar { display:flex; gap:8px; margin-bottom:14px; }
    .toolbar input { background:#0b1220; color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 10px; min-width:260px; }
    .toolbar button { background:#0b1220; color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 12px; cursor:pointer; }
    .toolbar button:hover { border-color:#14532d; color:#86efac; }
    .note { color:var(--muted); font-size:12px; margin-bottom:14px; }
    .cards { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); margin-bottom:18px; }
    .card { background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:14px; }
    .card .label { color:var(--muted); font-size:12px; margin-bottom:5px; }
    .card .value { font-size:24px; font-weight:700; }
    .panel { background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:14px; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th, td { padding:10px 8px; border-bottom:1px solid var(--line); font-size:14px; }
    th { text-align:left; color:var(--muted); font-weight:600; }
    .pill { font-size:12px; padding:3px 8px; border-radius:999px; border:1px solid var(--line); }
    .pill.ok { color:#86efac; border-color:#14532d; }
    .pill.warn { color:#facc15; border-color:#713f12; }
    .hidden { display:none; }
    @media (max-width: 900px) { .layout { grid-template-columns:1fr; } .sidebar { border-right:none; border-bottom:1px solid var(--line); } }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">Moja Admin</div>
      <nav class="menu" id="menu">
        <button class="active" data-view="overview">Overview</button>
        <button data-view="customers">Customers</button>
        <button data-view="loyalty">Loyalty Ledger</button>
        <button data-view="vouchers">Voucher Definitions</button>
        <button data-view="audit">Audit Logs</button>
      </nav>
    </aside>

    <main class="content">
      <div class="heading">
        <h1 id="title">Overview</h1>
        <span class="badge">Phase 1 Foundation</span>
      </div>
      <div class="toolbar">
        <input id="apiKey" type="password" placeholder="Enter x-admin-api-key" />
        <button id="connectBtn">Connect</button>
      </div>
      <div class="note">Dashboard reads live data from <code>/admin/*</code> APIs using your admin key header.</div>

      <section id="overview">
        <div class="cards">
          <div class="card"><div class="label">Members</div><div class="value" id="membersValue">-</div></div>
          <div class="card"><div class="label">Active Vouchers</div><div class="value" id="vouchersValue">-</div></div>
          <div class="card"><div class="label">Points Issued (net)</div><div class="value" id="pointsValue">-</div></div>
          <div class="card"><div class="label">OTP Verified Count</div><div class="value" id="otpValue">-</div></div>
        </div>
        <div class="panel" id="statusPanel">Connect with admin key to load real data.</div>
      </section>

      <section id="customers" class="hidden panel">
        <strong>Recent Customers</strong>
        <table>
          <thead><tr><th>Phone</th><th>Status</th><th>Points</th><th>Last Updated</th></tr></thead>
          <tbody id="customersBody"></tbody>
        </table>
      </section>

      <section id="loyalty" class="hidden panel">
        <strong>Latest Ledger Entries</strong>
        <table>
          <thead><tr><th>Customer</th><th>Delta</th><th>Balance After</th><th>Reference</th></tr></thead>
          <tbody id="loyaltyBody"></tbody>
        </table>
      </section>

      <section id="vouchers" class="hidden panel">
        <strong>Voucher Definitions</strong>
        <table>
          <thead><tr><th>Code</th><th>Title</th><th>Points Cost</th><th>Status</th></tr></thead>
          <tbody id="voucherBody"></tbody>
        </table>
      </section>

      <section id="audit" class="hidden panel">
        <strong>Audit Activity</strong>
        <table>
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
          <tbody id="auditBody"></tbody>
        </table>
      </section>
    </main>
  </div>

  <script>
    const buttons = document.querySelectorAll('#menu button');
    const views = ['overview', 'customers', 'loyalty', 'vouchers', 'audit'];
    const title = document.getElementById('title');
    const statusPanel = document.getElementById('statusPanel');
    const apiKeyInput = document.getElementById('apiKey');
    const connectBtn = document.getElementById('connectBtn');

    const fmt = (value) => value === null || value === undefined || value === '' ? '-' : value;
    const dateFmt = (iso) => {
      if (!iso) return '-';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleString();
    };
    const statusPill = (status) => {
      const cls = status === 'ACTIVE' || status === 'ISSUED' ? 'ok' : 'warn';
      return '<span class="pill ' + cls + '">' + status + '</span>';
    };

    async function api(path) {
      const key = apiKeyInput.value.trim();
      if (!key) throw new Error('Please enter x-admin-api-key first.');
      const res = await fetch(path, { headers: { 'x-admin-api-key': key } });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('API ' + path + ' failed: ' + res.status + ' ' + txt);
      }
      return res.json();
    }

    async function loadOverview() {
      const data = await api('/admin/overview');
      document.getElementById('membersValue').textContent = fmt(data.members);
      document.getElementById('vouchersValue').textContent = fmt(data.activeVouchers);
      document.getElementById('pointsValue').textContent = fmt(data.pointsIssued);
      document.getElementById('otpValue').textContent = fmt(data.otpVerifiedCount);
    }

    async function loadCustomers() {
      const data = await api('/admin/customers?page=1&pageSize=20');
      const rows = (data.items || []).map((c) =>
        '<tr><td>' + fmt(c.phoneE164) + '</td><td>' + statusPill(fmt(c.status)) + '</td><td>' + fmt(c.pointsBalance) + '</td><td>' + dateFmt(c.updatedAt) + '</td></tr>'
      );
      document.getElementById('customersBody').innerHTML = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    async function loadLoyalty() {
      const data = await api('/admin/loyalty-ledger?limit=50');
      const rows = (data || []).map((r) =>
        '<tr><td>' + fmt(r.customerPhone) + '</td><td>' + fmt(r.deltaPoints) + '</td><td>' + fmt(r.balanceAfter) + '</td><td>' + fmt(r.referenceType || r.reason) + '</td></tr>'
      );
      document.getElementById('loyaltyBody').innerHTML = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    async function loadVouchers() {
      const data = await api('/admin/voucher-definitions');
      const rows = (data || []).map((v) =>
        '<tr><td>' + fmt(v.code) + '</td><td>' + fmt(v.title) + '</td><td>' + fmt(v.pointsCost) + '</td><td>' + statusPill(v.isActive ? 'ACTIVE' : 'INACTIVE') + '</td></tr>'
      );
      document.getElementById('voucherBody').innerHTML = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    async function loadAudit() {
      const data = await api('/admin/audit-logs?limit=50');
      const rows = (data || []).map((a) =>
        '<tr><td>' + dateFmt(a.createdAt) + '</td><td>' + fmt(a.actorType + (a.actorId ? ':' + a.actorId : '')) + '</td><td>' + fmt(a.action) + '</td><td>' + fmt(a.entityType) + '</td></tr>'
      );
      document.getElementById('auditBody').innerHTML = rows.join('') || '<tr><td colspan="4">No data</td></tr>';
    }

    async function loadAll() {
      statusPanel.textContent = 'Loading...';
      try {
        await Promise.all([loadOverview(), loadCustomers(), loadLoyalty(), loadVouchers(), loadAudit()]);
        statusPanel.textContent = 'Connected. Data loaded from live admin APIs.';
      } catch (err) {
        statusPanel.textContent = err.message;
      }
    }

    connectBtn.addEventListener('click', loadAll);
    apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadAll(); });

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        views.forEach(v => document.getElementById(v).classList.add('hidden'));
        document.getElementById(view).classList.remove('hidden');
        title.textContent = btn.textContent;
      });
    });
  </script>
</body>
</html>`;
  }
}
