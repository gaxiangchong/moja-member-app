import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createCampaign,
  downloadCustomersCsv,
  fetchActivitySummary,
  fetchCampaigns,
  fetchCustomerIds,
  fetchCustomers,
  issueCampaignToCustomers,
  type ActivitySummary,
  type AwardState,
  type CampaignSummary,
  type CustomerActivity,
  type CustomerFilters,
  type CustomerSortBy,
  type CustomersPage,
} from '../api';
import { MemberVouchersDrawer } from './MemberVouchersDrawer';

const PAGE_SIZES = [20, 50, 100];
/** Wait this long after the last keystroke before querying. */
const FILTER_DEBOUNCE_MS = 350;

/** What "active" means by default: bought (online or in store) within this many days. */
const DEFAULT_ACTIVE_DAYS = '60';
const ACTIVE_DAYS_CHOICES = ['30', '60', '90', '180'];

const EMPTY_FILTERS: CustomerFilters = { activeDays: DEFAULT_ACTIVE_DAYS };

/** Filters that change what a member is *shown as* rather than who is listed. */
const NON_FILTER_KEYS = new Set(['activeDays']);

const AWARD_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'none', label: 'Not given' },
  { value: 'issued', label: 'Given' },
  { value: 'available', label: 'Unused' },
  { value: 'used', label: 'Used' },
  { value: 'expired', label: 'Expired' },
];

const ACTIVITY_LABEL: Record<CustomerActivity, string> = {
  active: 'Active',
  lapsed: 'Lapsed',
  never: 'Never bought',
};

const ACTIVITY_TONE: Record<CustomerActivity, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  lapsed: 'warning',
  never: 'neutral',
};

/** One of the automatic vouchers (welcome / birthday) for one member. */
function AwardBadge({ state }: { state: AwardState | undefined }) {
  switch (state) {
    case 'available':
      return <span className="badge badge--success">Unused</span>;
    case 'used':
      return <span className="badge badge--neutral">Used</span>;
    case 'expired':
      return <span className="badge badge--danger">Expired</span>;
    default:
      return <span className="dataTableMuted">—</span>;
  }
}

function ReferralAward({ referral }: { referral: { earned: number; used: number; available: number } | undefined }) {
  if (!referral || referral.earned === 0) return <span className="dataTableMuted">—</span>;
  return (
    <span>
      {referral.earned} earned
      <span className="dataTableMuted">
        {' · '}
        {referral.used} used
        {referral.available > 0 ? ` · ${referral.available} unused` : ''}
      </span>
    </span>
  );
}

/**
 * Push a campaign's voucher to every member matching the grid's current
 * filters — the win-back flow: filter to "Lapsed", then send. Members already
 * holding an unused voucher from the campaign are skipped, so it is safe to
 * press twice.
 */
function VoucherPushPanel({
  filters,
  onClose,
}: {
  filters: CustomerFilters;
  onClose: () => void;
}) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({ name: 'We miss you', amountRM: '8', validDays: '14' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchCampaigns()
      .then((all) => {
        // Only live campaigns can be issued; win-back ones first, since that is the point.
        const live = all
          .filter((c) => c.status === 'active')
          .sort((a, b) => Number(b.template === 'WINBACK') - Number(a.template === 'WINBACK'));
        setCampaigns(live);
        setCampaignId(live[0]?.id ?? '');
      })
      .catch((err) =>
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load campaigns' }),
      );
  }, []);

  async function send() {
    const campaign = campaigns?.find((c) => c.id === campaignId);
    if (!campaign) return;
    setBusy(true);
    setMessage(null);
    try {
      // Only people who have actually joined; unactivated sign-ups are not members yet.
      const { ids, capped } = await fetchCustomerIds({ ...filters, status: 'ACTIVE' });
      if (ids.length === 0) {
        setMessage({ tone: 'error', text: 'No active members match these filters.' });
        return;
      }
      const ok = window.confirm(
        `Send “${campaign.name}” (${campaign.discountDisplay}) to ${ids.length.toLocaleString()} member${ids.length === 1 ? '' : 's'}?` +
          `${capped ? ' (Capped at 20,000 — narrow the filters to reach everyone.)' : ''}\n\nAnyone who already holds an unused one is skipped.`,
      );
      if (!ok) return;
      const r = await issueCampaignToCustomers(campaign.id, ids, 'manual_from_member_list');
      setMessage({
        tone: 'ok',
        text: `Sent to ${r.issued.toLocaleString()} member${r.issued === 1 ? '' : 's'}${
          r.skippedHolding ? `; ${r.skippedHolding.toLocaleString()} already had one` : ''
        }${
          r.skippedBirthday
            ? `; ${r.skippedBirthday.toLocaleString()} not sent because their birthday isn’t close`
            : ''
        }${r.failed ? `; ${r.failed} failed` : ''}.`,
      });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not send vouchers' });
    } finally {
      setBusy(false);
    }
  }

  async function createWinback() {
    const amount = Number(form.amountRM);
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage({ tone: 'error', text: 'Give the campaign a name and a discount above RM0.' });
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const created = await createCampaign({
        template: 'WINBACK',
        name: form.name.trim(),
        voucherType: 'FIXED_AMOUNT',
        discountAmountRM: amount,
        // Manual: it goes only to who you send it to here, never on its own.
        trigger: { type: 'MANUAL' },
        startsAt: new Date().toISOString(),
        voucherValidDays: Number(form.validDays) || 14,
      });
      // The create call returns the raw record; the list view has the display
      // fields (discount label, status) the dropdown needs, so re-read it.
      const all = await fetchCampaigns();
      const live = all
        .filter((c) => c.status === 'active')
        .sort((a, b) => Number(b.template === 'WINBACK') - Number(a.template === 'WINBACK'));
      setCampaigns(live);
      setCampaignId(created.id);
      setMessage({ tone: 'ok', text: `Created “${created.name}”. Now choose Send.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not create the campaign' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="panel">
      <div className="panelHead">
        <div>
          <h2 className="panelTitle">Send a voucher to these members</h2>
          <p className="viewMuted" style={{ margin: '4px 0 0' }}>
            Goes to everyone the filters above match, not just this page. For win-back, filter to{' '}
            <strong>Lapsed</strong> first.
          </p>
        </div>
        <button type="button" className="toolbarButton" onClick={onClose}>
          Close
        </button>
      </div>

      {campaigns === null && !message ? <p className="viewMuted">Loading campaigns…</p> : null}

      {campaigns && campaigns.length > 0 ? (
        <div className="gridToolbar" style={{ marginTop: 12 }}>
          <select
            className="gridFilterInput"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            aria-label="Campaign to send"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.discountDisplay}
                {c.template === 'WINBACK' ? ' (win-back)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="toolbarButton toolbarButton--primary"
            onClick={send}
            disabled={busy || !campaignId}
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      ) : null}

      {campaigns && campaigns.length === 0 ? (
        <p className="viewMuted" style={{ marginTop: 12 }}>
          No live voucher campaign yet — create a win-back one below.
        </p>
      ) : null}

      <details style={{ marginTop: 12 }} open={campaigns?.length === 0}>
        <summary>Create a win-back campaign</summary>
        <div className="gridToolbar" style={{ marginTop: 8 }}>
          <input
            className="gridFilterInput"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            aria-label="Campaign name"
          />
          <input
            className="gridFilterInput"
            type="number"
            min={0}
            step="0.01"
            placeholder="RM off"
            value={form.amountRM}
            onChange={(e) => setForm((f) => ({ ...f, amountRM: e.target.value }))}
            aria-label="Amount off in RM"
          />
          <input
            className="gridFilterInput"
            type="number"
            min={1}
            placeholder="Valid days"
            value={form.validDays}
            onChange={(e) => setForm((f) => ({ ...f, validDays: e.target.value }))}
            aria-label="Voucher valid for days"
          />
          <button type="button" className="toolbarButton" onClick={createWinback} disabled={creating}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
        <p className="viewMuted" style={{ margin: '4px 0 0' }}>
          This one only goes to the members you send it to. For a win-back that runs by itself, set one up under
          Vouchers with the “Win-back” trigger.
        </p>
      </details>

      {message ? (
        <p className={message.tone === 'error' ? 'viewError' : 'viewMuted'} style={{ marginTop: 12 }}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

function formatRm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const TIER_LABEL: Record<string, string> = {
  silver: 'Silver · 1×',
  gold: 'Gold · 1.5×',
  platinum: 'Platinum · 2×',
};

function tierLabel(tier: string | null): string {
  if (!tier) return '—';
  return TIER_LABEL[tier.toLowerCase()] ?? tier;
}

function statusBadgeTone(status: string): 'success' | 'danger' | 'neutral' {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return 'success';
  if (s === 'SUSPENDED') return 'danger';
  return 'neutral';
}

/** RM in the input, cents on the wire. */
function rmToCents(rm: string): string {
  const n = Number(rm);
  if (!rm.trim() || !Number.isFinite(n) || n < 0) return '';
  return String(Math.round(n * 100));
}

function centsToRm(cents: string | undefined): string {
  if (!cents) return '';
  const n = Number(cents);
  return Number.isFinite(n) ? String(n / 100) : '';
}

type SortState = { by: CustomerSortBy; dir: 'asc' | 'desc' };

/** Columns the API can sort on, keyed by the header they sit under. */
const SORTABLE: Partial<Record<string, CustomerSortBy>> = {
  name: 'name',
  points: 'points',
  spend: 'spent',
  joined: 'createdAt',
  lastLogin: 'lastLoginAt',
};

export function CustomersList() {
  /** The member whose vouchers are open in the side panel. */
  const [voucherMemberId, setVoucherMemberId] = useState<string | null>(null);
  // `draft` is what the inputs show; `applied` is what the API is queried with.
  // They are separated so typing does not fire a request per keystroke.
  const [draft, setDraft] = useState<CustomerFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<CustomerFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>({ by: 'createdAt', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [data, setData] = useState<CustomersPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const firstRender = useRef(true);

  // Debounce the draft into `applied`, and reset to page 1 whenever the
  // filter set actually changes (staying on page 7 of a new result set is
  // almost never what you want).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      setApplied(draft);
      setPage(1);
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [draft]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before each fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    fetchCustomers({
      page,
      pageSize,
      sortBy: sort.by,
      sortDir: sort.dir,
      filters: applied,
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load customers',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, sort, applied]);

  // The active / lapsed / never-bought glance follows the "active within" window.
  const activeDaysApplied = applied.activeDays || DEFAULT_ACTIVE_DAYS;
  useEffect(() => {
    let cancelled = false;
    fetchActivitySummary(Number(activeDaysApplied))
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        // The glance is a convenience; the grid still works without it.
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDaysApplied]);

  const set = (patch: Partial<CustomerFilters>) =>
    setDraft((f) => ({ ...f, ...patch }));

  const activeFilterCount = useMemo(
    () =>
      Object.entries(applied).filter(
        ([k, v]) => !NON_FILTER_KEYS.has(k) && v && String(v).trim(),
      ).length,
    [applied],
  );

  const toggleSort = (key: string) => {
    const by = SORTABLE[key];
    if (!by) return;
    setSort((s) =>
      s.by === by
        ? { by, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { by, dir: 'desc' },
    );
    setPage(1);
  };

  const sortMark = (key: string) => {
    const by = SORTABLE[key];
    if (!by || sort.by !== by) return '';
    return sort.dir === 'asc' ? ' ▲' : ' ▼';
  };

  const clearAll = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const onExport = () => {
    setExporting(true);
    setError(null);
    downloadCustomersCsv({
      sortBy: sort.by,
      sortDir: sort.dir,
      filters: applied,
    })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Export failed'),
      )
      .finally(() => setExporting(false));
  };

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;
  const neverLoggedIn = draft.neverLoggedIn === 'true';

  return (
    <div className="viewStack">
      <div className="gridToolbar">
        <span className="viewMuted">Buying:</span>
        {(
          [
            ['', 'All', summary ? summary.total : null],
            ['active', 'Active', summary?.active ?? null],
            ['lapsed', 'Lapsed', summary?.lapsed ?? null],
            ['never', 'Never bought', summary?.never ?? null],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value || 'all'}
            type="button"
            className={`toolbarButton${(draft.activity ?? '') === value ? ' toolbarButton--primary' : ''}`}
            onClick={() => set({ activity: value })}
            title={
              value === 'active'
                ? `Bought within the last ${activeDaysApplied} days`
                : value === 'lapsed'
                  ? `Bought before, but not in the last ${activeDaysApplied} days`
                  : value === 'never'
                    ? 'Signed up but has never made a purchase'
                    : 'Every activated member'
            }
          >
            {label}
            {count !== null ? ` · ${count.toLocaleString()}` : ''}
          </button>
        ))}
        <label className="viewMuted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          active = bought within
          <select
            className="gridFilterInput"
            value={draft.activeDays ?? DEFAULT_ACTIVE_DAYS}
            onChange={(e) => set({ activeDays: e.target.value })}
            aria-label="Active means bought within this many days"
          >
            {ACTIVE_DAYS_CHOICES.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="gridToolbar">
        <input
          type="search"
          className="toolbarInput gridToolbarSearch"
          placeholder="Search name, phone or email…"
          value={draft.search ?? ''}
          onChange={(e) => set({ search: e.target.value })}
        />
        <select
          className="gridFilterInput"
          value={draft.tag ?? ''}
          onChange={(e) => set({ tag: e.target.value })}
          aria-label="Interest tag"
        >
          <option value="">Any interest</option>
          <option value="cake">Cake</option>
          <option value="bento">Bento</option>
        </select>
        <select
          className="gridFilterInput"
          value={draft.signupSource ?? ''}
          onChange={(e) => set({ signupSource: e.target.value })}
          aria-label="Signup source"
        >
          <option value="">Any source</option>
          <option value="otp">App signup</option>
          <option value="counter">Counter</option>
        </select>
        <select
          className="gridFilterInput"
          value={draft.marketingConsent ?? ''}
          onChange={(e) => set({ marketingConsent: e.target.value })}
          aria-label="Marketing consent"
        >
          <option value="">Any consent</option>
          <option value="true">Opted in</option>
          <option value="false">Not opted in</option>
        </select>
        <select
          className="gridFilterInput"
          value={draft.hasActiveVoucher ?? ''}
          onChange={(e) => set({ hasActiveVoucher: e.target.value })}
          aria-label="Active voucher"
        >
          <option value="">Any voucher</option>
          <option value="true">Has active voucher</option>
          <option value="false">No active voucher</option>
        </select>
        <span className="gridToolbarSpacer" />
        <button
          type="button"
          className="toolbarButton toolbarButton--primary"
          onClick={() => setPushOpen((o) => !o)}
          disabled={!data || data.total === 0}
          title="Send a voucher to every member the filters match"
        >
          Send voucher to {data ? data.total.toLocaleString() : '…'}
        </button>
        {activeFilterCount > 0 ? (
          <button type="button" className="toolbarButton" onClick={clearAll}>
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
          </button>
        ) : null}
        <button
          type="button"
          className="toolbarButton"
          onClick={onExport}
          disabled={exporting}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error ? <p className="viewError">{error}</p> : null}

      {pushOpen ? <VoucherPushPanel filters={applied} onClose={() => setPushOpen(false)} /> : null}

      <section className="panel">
        <div className="gridScroll">
          <table className="dataTable dataGrid">
            <thead>
              <tr>
                <th
                  className="gridSortable"
                  onClick={() => toggleSort('name')}
                  aria-sort={
                    sort.by === 'name'
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  Name{sortMark('name')}
                </th>
                <th>Phone</th>
                <th>Email</th>
                <th>Status</th>
                <th>Buying</th>
                <th>Last purchase</th>
                <th>Tier</th>
                <th
                  className="gridSortable"
                  onClick={() => toggleSort('points')}
                >
                  Points{sortMark('points')}
                </th>
                <th
                  className="gridSortable"
                  onClick={() => toggleSort('spend')}
                >
                  Lifetime spend{sortMark('spend')}
                </th>
                <th
                  className="gridSortable"
                  onClick={() => toggleSort('joined')}
                >
                  Joined{sortMark('joined')}
                </th>
                <th
                  className="gridSortable"
                  onClick={() => toggleSort('lastLogin')}
                >
                  Last login{sortMark('lastLogin')}
                </th>
                <th>Welcome voucher</th>
                <th>Birthday voucher</th>
                <th>Referral vouchers</th>
              </tr>
              {/* Filter row — one control per column. */}
              <tr className="gridFilterRow">
                <th>
                  <input
                    className="gridFilterInput"
                    placeholder="Contains…"
                    value={draft.name ?? ''}
                    onChange={(e) => set({ name: e.target.value })}
                    aria-label="Filter by name"
                  />
                </th>
                <th>
                  <input
                    className="gridFilterInput"
                    placeholder="Contains…"
                    value={draft.phone ?? ''}
                    onChange={(e) => set({ phone: e.target.value })}
                    aria-label="Filter by phone"
                  />
                </th>
                <th>
                  <div className="gridFilterStack">
                    <input
                      className="gridFilterInput"
                      placeholder="Contains…"
                      value={draft.email ?? ''}
                      onChange={(e) => set({ email: e.target.value })}
                      aria-label="Filter by email"
                    />
                    <select
                      className="gridFilterInput"
                      value={draft.hasEmail ?? ''}
                      onChange={(e) => set({ hasEmail: e.target.value })}
                      aria-label="Has email on file"
                    >
                      <option value="">Any</option>
                      <option value="true">On file</option>
                      <option value="false">Missing</option>
                    </select>
                  </div>
                </th>
                <th>
                  <select
                    className="gridFilterInput"
                    value={draft.status ?? ''}
                    onChange={(e) => set({ status: e.target.value })}
                    aria-label="Filter by status"
                  >
                    <option value="">Any</option>
                    <option value="ACTIVE">Active</option>
                    <option value="DRAFT">Draft</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </th>
                <th>
                  <select
                    className="gridFilterInput"
                    value={draft.activity ?? ''}
                    onChange={(e) => set({ activity: e.target.value })}
                    aria-label="Filter by buying activity"
                  >
                    <option value="">Any</option>
                    <option value="active">Active</option>
                    <option value="lapsed">Lapsed</option>
                    <option value="never">Never bought</option>
                  </select>
                </th>
                <th></th>
                <th>
                  <input
                    className="gridFilterInput"
                    placeholder="e.g. gold"
                    value={draft.memberTier ?? ''}
                    onChange={(e) => set({ memberTier: e.target.value })}
                    aria-label="Filter by tier"
                  />
                </th>
                <th>
                  <div className="gridFilterPair">
                    <input
                      className="gridFilterInput"
                      type="number"
                      min={0}
                      placeholder="Min"
                      value={draft.minPoints ?? ''}
                      onChange={(e) => set({ minPoints: e.target.value })}
                      aria-label="Minimum points"
                    />
                    <input
                      className="gridFilterInput"
                      type="number"
                      min={0}
                      placeholder="Max"
                      value={draft.maxPoints ?? ''}
                      onChange={(e) => set({ maxPoints: e.target.value })}
                      aria-label="Maximum points"
                    />
                  </div>
                </th>
                <th>
                  <div className="gridFilterPair">
                    <input
                      className="gridFilterInput"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Min RM"
                      value={centsToRm(draft.minSpentCents)}
                      onChange={(e) =>
                        set({ minSpentCents: rmToCents(e.target.value) })
                      }
                      aria-label="Minimum lifetime spend"
                    />
                    <input
                      className="gridFilterInput"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Max RM"
                      value={centsToRm(draft.maxSpentCents)}
                      onChange={(e) =>
                        set({ maxSpentCents: rmToCents(e.target.value) })
                      }
                      aria-label="Maximum lifetime spend"
                    />
                  </div>
                </th>
                <th>
                  <div className="gridFilterPair">
                    <input
                      className="gridFilterInput"
                      type="date"
                      value={draft.joinedFrom ?? ''}
                      onChange={(e) => set({ joinedFrom: e.target.value })}
                      aria-label="Joined from"
                    />
                    <input
                      className="gridFilterInput"
                      type="date"
                      value={draft.joinedTo ?? ''}
                      onChange={(e) => set({ joinedTo: e.target.value })}
                      aria-label="Joined to"
                    />
                  </div>
                </th>
                <th>
                  <div className="gridFilterStack">
                    <div className="gridFilterPair">
                      <input
                        className="gridFilterInput"
                        type="date"
                        value={draft.lastLoginFrom ?? ''}
                        onChange={(e) => set({ lastLoginFrom: e.target.value })}
                        disabled={neverLoggedIn}
                        aria-label="Last login from"
                      />
                      <input
                        className="gridFilterInput"
                        type="date"
                        value={draft.lastLoginTo ?? ''}
                        onChange={(e) => set({ lastLoginTo: e.target.value })}
                        disabled={neverLoggedIn}
                        aria-label="Last login to"
                      />
                    </div>
                    <label className="gridFilterCheck">
                      <input
                        type="checkbox"
                        checked={neverLoggedIn}
                        onChange={(e) =>
                          set({
                            neverLoggedIn: e.target.checked ? 'true' : '',
                            ...(e.target.checked
                              ? { lastLoginFrom: '', lastLoginTo: '' }
                              : {}),
                          })
                        }
                      />
                      Never signed in
                    </label>
                  </div>
                </th>
                {(
                  [
                    ['welcomeVoucher', 'Welcome voucher'],
                    ['birthdayVoucher', 'Birthday voucher'],
                    ['referralVoucher', 'Referral vouchers'],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key}>
                    <select
                      className="gridFilterInput"
                      value={draft[key] ?? ''}
                      onChange={(e) => set({ [key]: e.target.value })}
                      aria-label={`Filter by ${label.toLowerCase()}`}
                    >
                      {AWARD_FILTER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={14} className="dataTableEmpty">
                    Loading…
                  </td>
                </tr>
              ) : null}
              {data?.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.displayName || '—'}
                    <div>
                      <button
                        type="button"
                        className="toolbarButton"
                        style={{ marginTop: 4, padding: '2px 8px', fontSize: 12 }}
                        onClick={() => setVoucherMemberId(c.id)}
                      >
                        Vouchers
                      </button>
                    </div>
                  </td>
                  <td className="gridNumeric">{c.phoneE164}</td>
                  <td>{c.email || '—'}</td>
                  <td>
                    <span
                      className={`badge badge--${statusBadgeTone(c.status)}`}
                    >
                      {c.status.toLowerCase()}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge--${ACTIVITY_TONE[c.activity] ?? 'neutral'}`}>
                      {ACTIVITY_LABEL[c.activity] ?? '—'}
                    </span>
                  </td>
                  <td>{c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : '—'}</td>
                  <td>{tierLabel(c.memberTier)}</td>
                  <td className="gridNumeric">
                    {c.pointsBalance.toLocaleString()}
                  </td>
                  <td className="gridNumeric">
                    {formatRm(c.lifetimeSpentCents)}
                  </td>
                  <td>{formatDate(c.createdAt)}</td>
                  <td>{c.lastLoginAt ? formatDate(c.lastLoginAt) : 'Never'}</td>
                  <td>
                    <AwardBadge state={c.awards?.welcome} />
                  </td>
                  <td>
                    <AwardBadge state={c.awards?.birthday} />
                  </td>
                  <td>
                    <ReferralAward referral={c.awards?.referral} />
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={14} className="dataTableEmpty">
                    No customers match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button
            type="button"
            className="toolbarButton"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="pagerLabel">
            {data ? (
              <>
                Page {data.page} of {totalPages} · {data.total.toLocaleString()}{' '}
                match
                {data.total === 1 ? '' : 'es'}
                {loading ? ' · refreshing…' : ''}
              </>
            ) : (
              '—'
            )}
          </span>
          <select
            className="gridFilterInput"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          <button
            type="button"
            className="toolbarButton"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </section>
      {voucherMemberId ? (
        <MemberVouchersDrawer customerId={voucherMemberId} onClose={() => setVoucherMemberId(null)} />
      ) : null}
    </div>
  );
}
