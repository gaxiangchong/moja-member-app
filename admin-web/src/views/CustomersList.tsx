import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCampaign,
  downloadCustomersCsv,
  fetchActivitySummary,
  fetchCampaigns,
  fetchCustomerIds,
  fetchCommerceOrders,
  fetchCustomerDetail,
  fetchCustomers,
  issueCampaignToCustomers,
  type ActivitySummary,
  type AdminCustomer,
  type AdminCustomerDetail,
  type AdminOrder,
  type AwardState,
  type CampaignSummary,
  type CustomerActivity,
  type CustomerFilters,
  type CustomerSortBy,
  type CustomersPage,
} from '../api';
import { formatPhone, OPEN_MEMBER_EVENT, takePendingMember } from '../memberNav';
import { MemberLoginPinDrawer } from './MemberLoginPinDrawer';
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
  /** The member whose login PIN panel is open. */
  const [pinMemberId, setPinMemberId] = useState<string | null>(null);
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** The member whose profile panel is open; an order's "View member" can open it. */
  const [profileId, setProfileId] = useState<string | null>(() => takePendingMember());

  useEffect(() => {
    const onOpen = (e: Event) => setProfileId((e as CustomEvent<string>).detail ?? takePendingMember());
    window.addEventListener(OPEN_MEMBER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MEMBER_EVENT, onOpen);
  }, []);
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

  const ariaSort = (key: string): 'ascending' | 'descending' | 'none' => {
    const by = SORTABLE[key];
    if (!by || sort.by !== by) return 'none';
    return sort.dir === 'asc' ? 'ascending' : 'descending';
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
        <div className="segmented" role="group" aria-label="Buying">
          {(
            [
              ['', 'All', summary ? summary.total : null],
              ['active', 'Buying', summary?.active ?? null],
              ['lapsed', 'Lapsed', summary?.lapsed ?? null],
              ['never', 'Never bought', summary?.never ?? null],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value || 'all'}
              type="button"
              className={(draft.activity ?? '') === value ? 'segmentedItem segmentedItem--on' : 'segmentedItem'}
              aria-pressed={(draft.activity ?? '') === value}
              onClick={() => set({ activity: value })}
              title={
                value === 'active'
                  ? `Bought within the last ${activeDaysApplied} days`
                  : value === 'lapsed'
                    ? `Bought before, but not in the last ${activeDaysApplied} days`
                    : value === 'never'
                      ? 'Signed up but has never made a purchase'
                      : 'Every member'
              }
            >
              {label}
              {count !== null ? <b className="segmentedCount">{count.toLocaleString()}</b> : null}
            </button>
          ))}
        </div>
        <label className="viewMuted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Buying means within
          <select
            className="gridFilterInput"
            value={draft.activeDays ?? DEFAULT_ACTIVE_DAYS}
            onChange={(e) => set({ activeDays: e.target.value })}
            aria-label="Buying means bought within this many days"
          >
            {ACTIVE_DAYS_CHOICES.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <span className="gridToolbarSpacer" />
        <button type="button" className="toolbarButton" onClick={onExport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
        <button
          type="button"
          className="toolbarButton toolbarButton--primary"
          onClick={() => setPushOpen((o) => !o)}
          disabled={!data || data.total === 0}
          title="Send a voucher to every member the filters match"
        >
          Send voucher to {data ? data.total.toLocaleString() : '…'}
        </button>
      </div>

      <div className="gridToolbar">
        <input
          type="search"
          className="toolbarInput gridToolbarSearch"
          placeholder="Name, phone or email"
          value={draft.search ?? ''}
          onChange={(e) => set({ search: e.target.value })}
          aria-label="Search members"
        />
        <button
          type="button"
          className={filtersOpen || activeFilterCount > 0 ? 'chipButton chipButton--set' : 'chipButton'}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : '+ Filter'}
        </button>
        {activeFilterCount > 0 ? (
          <button type="button" className="linkButton" onClick={clearAll}>
            Clear filters
          </button>
        ) : null}
      </div>

      {filtersOpen ? (
        <section className="panel filterPanel" aria-label="Filters">
          <label className="filterField">
            Tier
            <select value={draft.memberTier ?? ''} onChange={(e) => set({ memberTier: e.target.value })}>
              <option value="">Any tier</option>
              <option value="member">Member</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
              <option value="platinum">Platinum</option>
            </select>
          </label>
          <label className="filterField">
            Points
            <span className="gridFilterPair">
              <input type="number" min={0} placeholder="Min" value={draft.minPoints ?? ''} onChange={(e) => set({ minPoints: e.target.value })} aria-label="Minimum points" />
              <input type="number" min={0} placeholder="Max" value={draft.maxPoints ?? ''} onChange={(e) => set({ maxPoints: e.target.value })} aria-label="Maximum points" />
            </span>
          </label>
          <label className="filterField">
            Spent (RM)
            <span className="gridFilterPair">
              <input type="number" min={0} step="0.01" placeholder="Min" value={centsToRm(draft.minSpentCents)} onChange={(e) => set({ minSpentCents: rmToCents(e.target.value) })} aria-label="Minimum spent" />
              <input type="number" min={0} step="0.01" placeholder="Max" value={centsToRm(draft.maxSpentCents)} onChange={(e) => set({ maxSpentCents: rmToCents(e.target.value) })} aria-label="Maximum spent" />
            </span>
          </label>
          <label className="filterField">
            Joined
            <span className="gridFilterPair">
              <input type="date" value={draft.joinedFrom ?? ''} onChange={(e) => set({ joinedFrom: e.target.value })} aria-label="Joined from" />
              <input type="date" value={draft.joinedTo ?? ''} onChange={(e) => set({ joinedTo: e.target.value })} aria-label="Joined to" />
            </span>
          </label>
          <label className="filterField">
            Last signed in
            <span className="gridFilterPair">
              <input type="date" value={draft.lastLoginFrom ?? ''} disabled={neverLoggedIn} onChange={(e) => set({ lastLoginFrom: e.target.value })} aria-label="Last signed in from" />
              <input type="date" value={draft.lastLoginTo ?? ''} disabled={neverLoggedIn} onChange={(e) => set({ lastLoginTo: e.target.value })} aria-label="Last signed in to" />
            </span>
            <span className="gridFilterCheck">
              <input
                type="checkbox"
                checked={neverLoggedIn}
                onChange={(e) =>
                  set({
                    neverLoggedIn: e.target.checked ? 'true' : '',
                    ...(e.target.checked ? { lastLoginFrom: '', lastLoginTo: '' } : {}),
                  })
                }
              />
              Never signed in
            </span>
          </label>
          <label className="filterField">
            Signed up
            <select value={draft.signupSource ?? ''} onChange={(e) => set({ signupSource: e.target.value })}>
              <option value="">Anywhere</option>
              <option value="otp">In the app</option>
              <option value="counter">At the counter</option>
            </select>
          </label>
          <label className="filterField">
            Interest
            <select value={draft.tag ?? ''} onChange={(e) => set({ tag: e.target.value })}>
              <option value="">Any interest</option>
              <option value="cake">Cake</option>
              <option value="bento">Bento</option>
            </select>
          </label>
          <label className="filterField">
            Marketing
            <select value={draft.marketingConsent ?? ''} onChange={(e) => set({ marketingConsent: e.target.value })}>
              <option value="">Any</option>
              <option value="true">Opted in</option>
              <option value="false">Not opted in</option>
            </select>
          </label>
          <label className="filterField">
            Email
            <select value={draft.hasEmail ?? ''} onChange={(e) => set({ hasEmail: e.target.value })}>
              <option value="">Any</option>
              <option value="true">On file</option>
              <option value="false">Missing</option>
            </select>
          </label>
          <label className="filterField">
            Account
            <select value={draft.status ?? ''} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Not activated</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </label>
          <label className="filterField">
            Any voucher
            <select value={draft.hasActiveVoucher ?? ''} onChange={(e) => set({ hasActiveVoucher: e.target.value })}>
              <option value="">Any</option>
              <option value="true">Has an unused voucher</option>
              <option value="false">No unused voucher</option>
            </select>
          </label>
          {(
            [
              ['welcomeVoucher', 'Welcome voucher'],
              ['birthdayVoucher', 'Birthday voucher'],
              ['referralVoucher', 'Referral voucher'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="filterField">
              {label}
              <select value={draft[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })}>
                {AWARD_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      ) : null}

      {error ? <p className="viewError">{error}</p> : null}

      {pushOpen ? <VoucherPushPanel filters={applied} onClose={() => setPushOpen(false)} /> : null}

      <section className="panel ordersTablePanel">
        <table className="dataTable membersTable">
          <thead>
            <tr>
              <th className="gridSortable" onClick={() => toggleSort('name')} aria-sort={ariaSort('name')}>
                Member{sortMark('name')}
              </th>
              <th>Buying</th>
              <th>Tier</th>
              <th className="gridSortable gridNumeric" onClick={() => toggleSort('points')} aria-sort={ariaSort('points')}>
                Points{sortMark('points')}
              </th>
              <th className="gridSortable gridNumeric" onClick={() => toggleSort('spend')} aria-sort={ariaSort('spend')}>
                Spent{sortMark('spend')}
              </th>
              <th title="Welcome · Birthday · Referral">Vouchers</th>
              <th className="gridSortable" onClick={() => toggleSort('joined')} aria-sort={ariaSort('joined')}>
                Joined{sortMark('joined')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={7} className="dataTableEmpty">
                  Loading…
                </td>
              </tr>
            ) : null}
            {data?.items.map((c) => (
              <tr
                key={c.id}
                className={`dataTableRowClickable${profileId === c.id ? ' rowSelected' : ''}`}
                tabIndex={0}
                onClick={() => setProfileId(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setProfileId(c.id);
                }}
              >
                <td>
                  <strong className={c.displayName ? undefined : 'nameless'}>{c.displayName || 'No name yet'}</strong>
                  <span className="cellSub">{formatPhone(c.phoneE164)}</span>
                </td>
                <td>
                  <span className={`buyDot buyDot--${c.activity}`}>
                    {c.lastPurchaseAt ? sinceLabel(c.lastPurchaseAt) : ACTIVITY_LABEL[c.activity]}
                  </span>
                </td>
                <td>
                  <TierLabel tier={c.memberTier} />
                </td>
                <td className="gridNumeric">{c.pointsBalance.toLocaleString()}</td>
                <td className="gridNumeric">{c.lifetimeSpentCents > 0 ? formatRm(c.lifetimeSpentCents) : '—'}</td>
                <td>
                  <VoucherChips awards={c.awards} />
                </td>
                <td>{shortDate(c.createdAt)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="dataTableEmpty">
                  No members match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="pager">
          <button type="button" className="toolbarButton" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <span className="pagerLabel">
            {data ? (
              <>
                Page {data.page} of {totalPages} · {data.total.toLocaleString()} member{data.total === 1 ? '' : 's'}
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
          <button type="button" className="toolbarButton" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </button>
        </div>
      </section>

      {profileId ? (
        <MemberProfilePanel
          customerId={profileId}
          row={data?.items.find((c) => c.id === profileId) ?? null}
          onClose={() => setProfileId(null)}
          onVouchers={() => {
            setVoucherMemberId(profileId);
            setProfileId(null);
          }}
          onLoginPin={() => {
            setPinMemberId(profileId);
            setProfileId(null);
          }}
        />
      ) : null}
      {pinMemberId ? <MemberLoginPinDrawer customerId={pinMemberId} onClose={() => setPinMemberId(null)} /> : null}
      {voucherMemberId ? (
        <MemberVouchersDrawer customerId={voucherMemberId} onClose={() => setVoucherMemberId(null)} />
      ) : null}
    </div>
  );
}

const TIER_MULTIPLIER: Record<string, string> = { silver: '1×', gold: '1.5×', platinum: '2×' };

function TierLabel({ tier }: { tier: string | null }) {
  const t = (tier ?? 'member').toLowerCase();
  const name = t.charAt(0).toUpperCase() + t.slice(1);
  return (
    <span className={`tierName tierName--${t}`}>
      {name}
      {TIER_MULTIPLIER[t] ? <span className="cellSubInline"> {TIER_MULTIPLIER[t]}</span> : null}
    </span>
  );
}

const AWARD_TITLE: Record<AwardState, string> = {
  none: 'not given',
  available: 'unused',
  used: 'used',
  expired: 'expired',
};

/** W · B · R squares: welcome, birthday, referral vouchers at a glance. */
function VoucherChips({ awards }: { awards: AdminCustomer['awards'] }) {
  const referral: AwardState = !awards?.referral.earned
    ? 'none'
    : awards.referral.available > 0
      ? 'available'
      : 'used';
  const chips: [string, string, AwardState][] = [
    ['W', 'Welcome', awards?.welcome ?? 'none'],
    ['B', 'Birthday', awards?.birthday ?? 'none'],
    ['R', 'Referral', referral],
  ];
  return (
    <span className="voucherChips">
      {chips.map(([letter, name, state]) => (
        <span key={letter} className={`voucherChip voucherChip--${state}`} title={`${name} voucher: ${AWARD_TITLE[state]}`}>
          {letter}
        </span>
      ))}
    </span>
  );
}

/** "Today", "Yesterday", "12 days ago", or a date after a year. */
function sinceLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 365) return `${days} days ago`;
  return shortDate(iso);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

const LEDGER_REASON: Record<string, string> = {
  shop_order_purchase: 'Online order',
  pos_purchase: 'In-store purchase',
  reward_redeemed: 'Reward redeemed',
  admin_adjustment: 'Adjusted by staff',
};

/** A member at a glance: totals, recent orders, vouchers, points, and what staff can do. */
function MemberProfilePanel({
  customerId,
  row,
  onClose,
  onVouchers,
  onLoginPin,
}: {
  customerId: string;
  row: AdminCustomer | null;
  onClose: () => void;
  onVouchers: () => void;
  onLoginPin: () => void;
}) {
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [orders, setOrders] = useState<{ orders: AdminOrder[]; total?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before loading another member
    setDetail(null);
    setOrders(null);
    setError(null);
    Promise.all([
      fetchCustomerDetail(customerId),
      fetchCommerceOrders({ customerId, sort: 'placed_desc', limit: 5 }),
    ])
      .then(([d, o]) => {
        if (cancelled) return;
        setDetail(d);
        setOrders(o);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this member');
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = row?.displayName ?? detail?.displayName ?? null;
  const phone = row?.phoneE164 ?? detail?.phoneE164 ?? '';
  const email = row?.email ?? detail?.email ?? null;
  const tier = row?.memberTier ?? detail?.memberTier ?? null;
  const joined = row?.createdAt ?? detail?.createdAt;
  const points = row?.pointsBalance ?? detail?.wallet?.pointsCached ?? 0;
  const spent = row?.lifetimeSpentCents ?? detail?.storedWallet?.lifetimeSpentCents ?? 0;
  const waDigits = phone.replace(/\D/g, '');

  return (
    <aside className="sidePanel" role="dialog" aria-modal="false" aria-labelledby="member-panel-title">
      <header className="sidePanelHead">
        <div>
          <h2 id="member-panel-title" className={name ? undefined : 'nameless'}>
            {name || 'No name yet'}
          </h2>
          <p>
            {phone ? formatPhone(phone) : ''}
            {email ? ` · ${email}` : ''}
          </p>
          <p>
            <TierLabel tier={tier} /> member{joined ? ` · joined ${shortDate(joined)}` : ''}
          </p>
        </div>
        <button type="button" className="sidePanelClose" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="sidePanelActions">
        <button type="button" className="toolbarButton toolbarButton--primary" onClick={onVouchers}>
          Vouchers
        </button>
        <button type="button" className="toolbarButton" onClick={onLoginPin}>
          Login PIN
        </button>
        {waDigits ? (
          <a className="toolbarButton" href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        ) : null}
      </div>
      <div className="sidePanelBody">
        {error ? <p className="viewError">{error}</p> : null}
        <section className="statStrip statStrip--3">
          <div>
            <b>{spent > 0 ? formatRm(spent) : 'RM 0'}</b>
            <span>spent in total</span>
          </div>
          <div>
            <b>{points.toLocaleString()}</b>
            <span>points</span>
          </div>
          <div>
            <b>{orders ? (orders.total ?? orders.orders.length) : '…'}</b>
            <span>online orders</span>
          </div>
        </section>

        <section>
          <h3>Recent orders</h3>
          {orders && orders.orders.length === 0 ? <p className="viewMuted">No online orders yet.</p> : null}
          {orders && orders.orders.length > 0 ? (
            <ul className="panelList">
              {orders.orders.map((o) => (
                <li key={o.id}>
                  <b>#{o.orderNumber}</b>
                  <span>
                    {o.lines
                      .filter((l) => !l.productId.startsWith('addon-'))
                      .map((l) => `${l.name}${l.variantLabel ? ` ${l.variantLabel}` : ''}`)
                      .join(', ')}
                    <small>
                      {shortDate(o.placedAt)} · {formatRm(o.totalCents)}
                    </small>
                  </span>
                  <span className="cellSub">{ORDER_STATUS_LABEL[o.status] ?? o.status}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {row?.awards ? (
          <section>
            <h3>Vouchers</h3>
            <dl className="panelKv">
              <dt>Welcome</dt>
              <dd>{AWARD_SENTENCE[row.awards.welcome]}</dd>
              <dt>Birthday</dt>
              <dd>
                {AWARD_SENTENCE[row.awards.birthday]}
                {row.birthdayDaysUntil != null ? ` · birthday in ${row.birthdayDaysUntil} days` : ''}
              </dd>
              <dt>Referral</dt>
              <dd>
                {row.awards.referral.earned === 0
                  ? 'None yet'
                  : `${row.awards.referral.earned} earned · ${row.awards.referral.available} unused`}
              </dd>
            </dl>
          </section>
        ) : null}

        {detail && detail.ledgerEntries.length > 0 ? (
          <section>
            <h3>Points history</h3>
            <dl className="panelKv">
              {detail.ledgerEntries.slice(0, 6).map((e) => (
                <Fragment key={e.id}>
                  <dt>{shortDate(e.createdAt)}</dt>
                  <dd>
                    <span className={e.deltaPoints >= 0 ? 'statUp' : 'statDown'}>
                      {e.deltaPoints >= 0 ? '+' : ''}
                      {e.deltaPoints.toLocaleString()}
                    </span>{' '}
                    {LEDGER_REASON[e.reason] ?? e.reason.replace(/_/g, ' ')}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

const AWARD_SENTENCE: Record<AwardState, string> = {
  none: 'Not given',
  available: 'Unused',
  used: 'Used',
  expired: 'Expired',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  placed: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Collected',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};
