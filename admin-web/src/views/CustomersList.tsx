import { useEffect, useState } from 'react';
import { fetchCustomers, type CustomersPage } from '../api';

const PAGE_SIZE = 20;

function formatRm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function statusBadgeTone(status: string): 'success' | 'danger' | 'neutral' {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return 'success';
  if (s === 'SUSPENDED') return 'danger';
  return 'neutral';
}

export function CustomersList() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomersPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before each fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    fetchCustomers({ page, pageSize: PAGE_SIZE, search: appliedSearch })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load customers');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, appliedSearch]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="viewStack">
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setAppliedSearch(search.trim());
        }}
      >
        <input
          type="text"
          placeholder="Search phone, email, or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="toolbarInput"
        />
        <button type="submit" className="toolbarButton">
          Search
        </button>
      </form>

      {loading ? <p className="viewMuted">Loading…</p> : null}
      {error ? <p className="viewError">{error}</p> : null}

      {!loading && !error && data ? (
        <section className="panel">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Status</th>
                <th>Tier</th>
                <th>Points</th>
                <th>Lifetime spend</th>
                <th>Joined</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td>{c.displayName || '—'}</td>
                  <td>{c.phoneE164}</td>
                  <td>{c.email || '—'}</td>
                  <td>
                    <span className={`badge badge--${statusBadgeTone(c.status)}`}>
                      {c.status.toLowerCase()}
                    </span>
                  </td>
                  <td>{c.memberTier || '—'}</td>
                  <td>{c.pointsBalance.toLocaleString()}</td>
                  <td>{formatRm(c.lifetimeSpentCents)}</td>
                  <td>{formatDate(c.createdAt)}</td>
                  <td>{formatDate(c.lastLoginAt)}</td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="dataTableEmpty">No customers match this search.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

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
              Page {data.page} of {totalPages} · {data.total.toLocaleString()} total
            </span>
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
      ) : null}
    </div>
  );
}
