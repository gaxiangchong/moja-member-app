import { useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadCustomersCsv,
  fetchCustomers,
  type CustomerFilters,
  type CustomerSortBy,
  type CustomersPage,
} from '../api';

const PAGE_SIZES = [20, 50, 100];
/** Wait this long after the last keystroke before querying. */
const FILTER_DEBOUNCE_MS = 350;

const EMPTY_FILTERS: CustomerFilters = {};

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

  const set = (patch: Partial<CustomerFilters>) =>
    setDraft((f) => ({ ...f, ...patch }));

  const activeFilterCount = useMemo(
    () => Object.values(applied).filter((v) => v && String(v).trim()).length,
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
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={9} className="dataTableEmpty">
                    Loading…
                  </td>
                </tr>
              ) : null}
              {data?.items.map((c) => (
                <tr key={c.id}>
                  <td>{c.displayName || '—'}</td>
                  <td className="gridNumeric">{c.phoneE164}</td>
                  <td>{c.email || '—'}</td>
                  <td>
                    <span
                      className={`badge badge--${statusBadgeTone(c.status)}`}
                    >
                      {c.status.toLowerCase()}
                    </span>
                  </td>
                  <td>{c.memberTier || '—'}</td>
                  <td className="gridNumeric">
                    {c.pointsBalance.toLocaleString()}
                  </td>
                  <td className="gridNumeric">
                    {formatRm(c.lifetimeSpentCents)}
                  </td>
                  <td>{formatDate(c.createdAt)}</td>
                  <td>{c.lastLoginAt ? formatDate(c.lastLoginAt) : 'Never'}</td>
                </tr>
              ))}
              {data && data.items.length === 0 && !loading ? (
                <tr>
                  <td colSpan={9} className="dataTableEmpty">
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
    </div>
  );
}
