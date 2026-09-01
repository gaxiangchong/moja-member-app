import { useEffect, useState, type ReactNode } from 'react';
import {
  fetchOverview,
  fetchReportingDashboard,
  type OverviewStats,
  type ReportingDashboard,
  type TopSpender,
} from '../api';

function formatRm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const ICON_MEMBERS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const ICON_CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const ICON_CALENDAR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const ICON_BAG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 2h12l1.5 4H4.5z" />
    <path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M9 11h6" />
  </svg>
);
const ICON_COIN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const ICON_WALLET = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);
const ICON_TICKET = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);
const ICON_GIFT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 12v10H4V12" />
    <path d="M2 7h20v5H2z" />
    <path d="M12 22V7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone?: 'green' | 'amber' | 'violet' | 'teal' | 'red';
}) {
  return (
    <div className="statCard">
      <span className={`statCardIcon${tone ? ` statCardIcon--${tone}` : ''}`} aria-hidden>
        {icon}
      </span>
      <span className="statCardLabel">{label}</span>
      <span className="statCardValue">{value}</span>
      {hint ? <span className="statCardHint">{hint}</span> : null}
    </div>
  );
}

function SignupsChart({ data }: { data: ReportingDashboard['marketing']['signupsByDay'] }) {
  if (data.length === 0) {
    return <p className="viewMuted">No signups in the last 30 days.</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.newMembers));
  const total = data.reduce((sum, d) => sum + d.newMembers, 0);
  const totalReferred = data.reduce((sum, d) => sum + d.referredSignups, 0);
  const chartHeight = 140;
  const baseline = 150;
  const barWidth = 640 / data.length;

  return (
    <>
      <p className="chartTotal">{total.toLocaleString()}</p>
      <p className="chartSubtitle">
        New members, last 30 days · {totalReferred.toLocaleString()} via referral
      </p>
      <div className="chartLegend">
        <span className="chartLegendItem">
          <span className="chartSwatch chartSwatch--organic" aria-hidden /> Direct / other
        </span>
        <span className="chartLegendItem">
          <span className="chartSwatch chartSwatch--referred" aria-hidden /> Referral
        </span>
      </div>
      <svg viewBox="0 0 640 160" className="areaChart" preserveAspectRatio="none" aria-hidden>
        {data.map((d, i) => {
          const x = i * barWidth + barWidth * 0.22;
          const w = Math.max(1, barWidth * 0.56);
          const organicH = (d.organicSignups / max) * chartHeight;
          const referredH = (d.referredSignups / max) * chartHeight;
          const yOrganic = baseline - organicH;
          const yReferred = yOrganic - referredH;
          return (
            <g key={d.date}>
              {organicH > 0 ? (
                <rect x={x} y={yOrganic} width={w} height={organicH} rx="2" className="chartBarOrganic" />
              ) : null}
              {referredH > 0 ? (
                <rect x={x} y={yReferred} width={w} height={referredH} rx="2" className="chartBarReferred" />
              ) : null}
            </g>
          );
        })}
        <line x1="0" y1={baseline} x2="640" y2={baseline} className="chartBaseline" />
      </svg>
      <div className="areaChartAxis">
        <span>{formatShortDate(data[0].date)}</span>
        <span>{formatShortDate(data[data.length - 1].date)}</span>
      </div>
    </>
  );
}

const SPENDER_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
] as const;
type SpenderPeriod = (typeof SPENDER_PERIODS)[number]['id'];

function TopSpendersPanel({ marketing }: { marketing: ReportingDashboard['marketing'] }) {
  const [period, setPeriod] = useState<SpenderPeriod>('today');
  const byPeriod: Record<SpenderPeriod, TopSpender[]> = {
    today: marketing.topSpendersToday,
    month: marketing.topSpendersThisMonth,
    year: marketing.topSpendersThisYear,
    all: marketing.topSpenders,
  };
  const rows = byPeriod[period].slice(0, 8);
  const max = Math.max(1, ...rows.map((r) => r.lifetimeSpentCents));

  return (
    <section className="panel">
      <div className="panelHead">
        <h2 className="panelTitle">Top spenders</h2>
        <div className="periodTabs">
          {SPENDER_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`periodTab${period === p.id ? ' active' : ''}`}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="viewMuted">No orders in this period.</p>
      ) : (
        <div className="hbarPanel">
          {rows.map((r) => (
            <div className="hbarRow" key={r.id}>
              <span className="hbarLabel">{r.displayName || r.phoneE164}</span>
              <span className="hbarValue">{formatRm(r.lifetimeSpentCents)}</span>
              <div className="hbarTrack">
                <div
                  className="hbarFill"
                  style={{ width: `${Math.max(4, (r.lifetimeSpentCents / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function DashboardOverview() {
  const [data, setData] = useState<OverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState<ReportingDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before each fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    fetchOverview()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load overview');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Chart/report panels need REPORT_VIEW, which not every admin role has —
    // treat a failure here as "panels unavailable", not a page-level error.
    fetchReportingDashboard()
      .then((res) => {
        if (!cancelled) setReporting(res);
      })
      .catch(() => {
        if (!cancelled) setReporting(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="viewMuted">Loading…</p>;
  if (error) return <p className="viewError">{error}</p>;
  if (!data) return null;

  return (
    <div className="viewStack">
      <div className="statGrid">
        <StatCard label="Total members" value={data.members.toLocaleString()} icon={ICON_MEMBERS} />
        <StatCard
          label="Active members"
          value={data.activeMembers.toLocaleString()}
          icon={ICON_CHECK}
          tone="green"
        />
        <StatCard
          label="New this month"
          value={data.newMembers.thisMonth.toLocaleString()}
          hint={`${data.newMembers.today} today · ${data.newMembers.thisWeek} this week`}
          icon={ICON_CALENDAR}
          tone="violet"
        />
        <StatCard
          label="Orders (30d)"
          value={data.commerce.ordersLast30Days.toLocaleString()}
          hint={`${formatRm(data.commerce.gmvLast30DaysCents)} GMV`}
          icon={ICON_BAG}
        />
        <StatCard
          label="Points issued"
          value={data.loyalty.pointsIssued.toLocaleString()}
          hint={`${data.loyalty.pointsRedeemed.toLocaleString()} redeemed`}
          icon={ICON_COIN}
          tone="amber"
        />
        <StatCard
          label="Wallet top-ups"
          value={formatRm(data.loyalty.walletTopUpTotal)}
          icon={ICON_WALLET}
          tone="teal"
        />
        <StatCard
          label="Vouchers issued"
          value={data.vouchers.issued.toLocaleString()}
          hint={`${(data.vouchers.redemptionRate * 100).toFixed(1)}% redeemed`}
          icon={ICON_TICKET}
          tone="violet"
        />
        <StatCard
          label="Birthdays this month"
          value={data.birthdayMembersThisMonth.toLocaleString()}
          icon={ICON_GIFT}
          tone="red"
        />
      </div>

      {reporting ? (
        <>
          <div className="panelGrid panelGrid--2">
            <section className="panel">
              <div className="panelHead">
                <h2 className="panelTitle">Signups</h2>
              </div>
              <SignupsChart data={reporting.marketing.signupsByDay} />
            </section>
            <TopSpendersPanel marketing={reporting.marketing} />
          </div>

          <div className="panelGrid panelGrid--2">
            <section className="panel">
              <h2 className="panelTitle">Top referrers</h2>
              <table className="dataTable dataTable--mini">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Referrals</th>
                  </tr>
                </thead>
                <tbody>
                  {reporting.marketing.topReferrers.map((r) => (
                    <tr key={r.id}>
                      <td>{r.displayName || r.phoneE164}</td>
                      <td>{r.referralsSignedUp}</td>
                    </tr>
                  ))}
                  {reporting.marketing.topReferrers.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="dataTableEmpty">No referrals yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>

            <section className="panel">
              <h2 className="panelTitle">Top products (30d)</h2>
              <table className="dataTable dataTable--mini">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty sold</th>
                  </tr>
                </thead>
                <tbody>
                  {reporting.marketing.topProducts.map((p) => (
                    <tr key={p.productId}>
                      <td>{p.name}</td>
                      <td>{p.qtySold.toLocaleString()}</td>
                    </tr>
                  ))}
                  {reporting.marketing.topProducts.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="dataTableEmpty">No sales yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          </div>
        </>
      ) : null}

      <div className="panelGrid">
        <section className="panel">
          <h2 className="panelTitle">Recent registrations</h2>
          <table className="dataTable">
            <thead>
              <tr>
                <th>Member</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRegistrations.map((c) => (
                <tr key={c.id}>
                  <td>{c.displayName || '—'}</td>
                  <td>{c.phoneE164}</td>
                  <td>{c.status}</td>
                  <td>{formatDate(c.createdAt)}</td>
                </tr>
              ))}
              {data.recentRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="dataTableEmpty">No registrations yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2 className="panelTitle">Recent voucher activity</h2>
          <table className="dataTable">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Member</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.recentVoucherActivity.map((v) => (
                <tr key={v.id}>
                  <td>{v.title} <span className="dataTableMuted">({v.code})</span></td>
                  <td>{v.memberPhone}</td>
                  <td>{v.status}</td>
                  <td>{formatDate(v.updatedAt)}</td>
                </tr>
              ))}
              {data.recentVoucherActivity.length === 0 ? (
                <tr>
                  <td colSpan={4} className="dataTableEmpty">No voucher activity yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2 className="panelTitle">Recent wallet activity</h2>
          <table className="dataTable">
            <thead>
              <tr>
                <th>Member</th>
                <th>Change</th>
                <th>Balance after</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recentWalletActivity.map((e) => (
                <tr key={e.id}>
                  <td>{e.memberPhone}</td>
                  <td className={e.deltaPoints >= 0 ? 'dataTablePositive' : 'dataTableNegative'}>
                    {e.deltaPoints >= 0 ? '+' : ''}
                    {e.deltaPoints.toLocaleString()}
                  </td>
                  <td>{e.balanceAfter.toLocaleString()}</td>
                  <td>{e.reason}</td>
                  <td>{formatDate(e.createdAt)}</td>
                </tr>
              ))}
              {data.recentWalletActivity.length === 0 ? (
                <tr>
                  <td colSpan={5} className="dataTableEmpty">No wallet activity yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
