import { useEffect, useState } from 'react';
import { fetchCommerceOrders, type AdminOrder, type CommerceOrdersQuery } from '../api';

function formatRm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusLabel(status: string): string {
  const st = status.toLowerCase();
  if (st === 'completed') return 'Completed';
  if (st === 'placed') return 'Open';
  return status;
}

function statusBadgeTone(status: string): 'success' | 'neutral' {
  return status.toLowerCase() === 'completed' ? 'success' : 'neutral';
}

function lineSummary(order: AdminOrder): string {
  const names = order.lines.slice(0, 3).map((l) => `${l.name} ×${l.qty}`);
  const suffix = order.lines.length > 3 ? '…' : '';
  return names.length ? `${names.join(', ')}${suffix}` : '—';
}

const DEFAULT_QUERY: CommerceOrdersQuery = {
  status: 'all',
  dateField: 'placed',
  sort: 'placed_desc',
  limit: 100,
};

export function CustomerOrders() {
  const [status, setStatus] = useState<NonNullable<CommerceOrdersQuery['status']>>('all');
  const [dateField, setDateField] = useState<NonNullable<CommerceOrdersQuery['dateField']>>('placed');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [productContains, setProductContains] = useState('');
  const [productId, setProductId] = useState('');
  const [sort, setSort] = useState<NonNullable<CommerceOrdersQuery['sort']>>('placed_desc');
  const [limit, setLimit] = useState(100);

  const [appliedQuery, setAppliedQuery] = useState<CommerceOrdersQuery>(DEFAULT_QUERY);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading/error before each fetch; no data-fetching lib in this repo yet
    setLoading(true);
    setError(null);
    fetchCommerceOrders(appliedQuery)
      .then((res) => {
        if (!cancelled) setOrders(res.orders);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load orders');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedQuery]);

  return (
    <div className="viewStack">
      <form
        className="filterGrid"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedQuery({
            status,
            dateField,
            from: from || undefined,
            to: to || undefined,
            productContains: productContains.trim() || undefined,
            productId: productId.trim() || undefined,
            sort,
            limit,
          });
        }}
      >
        <label className="filterField">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All</option>
            <option value="placed">Open (placed)</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label className="filterField">
          Date field
          <select value={dateField} onChange={(e) => setDateField(e.target.value as typeof dateField)}>
            <option value="placed">Placed at</option>
            <option value="completed">Completed at</option>
          </select>
        </label>
        <label className="filterField">
          From (UTC date)
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="filterField">
          To (UTC, inclusive)
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="filterField">
          Product contains
          <input
            type="text"
            maxLength={120}
            placeholder="e.g. cheesecake"
            value={productContains}
            onChange={(e) => setProductContains(e.target.value)}
          />
        </label>
        <label className="filterField">
          Product / SKU id
          <input
            type="text"
            maxLength={120}
            placeholder="exact line productId"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          />
        </label>
        <label className="filterField">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="placed_desc">Placed · newest first</option>
            <option value="placed_asc">Placed · oldest first</option>
            <option value="completed_desc">Completed · newest first</option>
            <option value="completed_asc">Completed · oldest first</option>
            <option value="total_desc">Total · high → low</option>
            <option value="total_asc">Total · low → high</option>
          </select>
        </label>
        <label className="filterField">
          Row limit
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
        <button type="submit" className="toolbarButton filterSubmit">
          Apply filters
        </button>
      </form>

      {loading ? <p className="viewMuted">Loading…</p> : null}
      {error ? <p className="viewError">{error}</p> : null}

      {!loading && !error && orders ? (
        <section className="panel">
          <table className="dataTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Placed</th>
                <th>Completed</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Total</th>
                <th>Lines</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderNumber}</td>
                  <td>
                    <span className={`badge badge--${statusBadgeTone(o.status)}`}>
                      {statusLabel(o.status)}
                    </span>
                  </td>
                  <td>{formatDate(o.placedAt)}</td>
                  <td>{formatDate(o.completedAt)}</td>
                  <td>{o.customerDisplayName || '—'}</td>
                  <td>{o.customerPhoneMasked}</td>
                  <td>{formatRm(o.totalCents)}</td>
                  <td className="dataTableMuted">{lineSummary(o)}</td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="dataTableEmpty">No orders match these filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="viewMuted" style={{ marginTop: 12 }}>{orders.length.toLocaleString()} row(s).</p>
        </section>
      ) : null}
    </div>
  );
}
