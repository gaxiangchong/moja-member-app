import { useState } from 'react';
import { fetchCustomers, type AdminCustomer } from '../api';

/** Compact phone/name/email search-and-select, reused anywhere an admin needs
 * to pick one member (voucher issuing, in-store redemption, wallet lookups). */
export function CustomerSearch({
  onSelect,
  actionLabel = 'Select',
  placeholder = 'Search phone, name, or email',
}: {
  onSelect: (c: AdminCustomer) => void;
  actionLabel?: string;
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminCustomer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setError(null);
    fetchCustomers({ search: search.trim(), pageSize: 10 })
      .then((res) => setResults(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Search failed'))
      .finally(() => setLoading(false));
  }

  return (
    <div>
      <form className="toolbar" onSubmit={runSearch}>
        <input
          type="text" className="toolbarInput" placeholder={placeholder}
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="toolbarButton toolbarButton--primary" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error ? <p className="viewError">{error}</p> : null}
      {results ? (
        <table className="dataTable" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>Name</th><th>Phone</th><th></th></tr>
          </thead>
          <tbody>
            {results.map((c) => (
              <tr key={c.id} className="dataTableRowClickable" onClick={() => onSelect(c)}>
                <td>{c.displayName || '—'}</td>
                <td>{c.phoneE164}</td>
                <td><button type="button" className="toolbarButton">{actionLabel}</button></td>
              </tr>
            ))}
            {results.length === 0 ? (
              <tr><td colSpan={3} className="dataTableEmpty">No members match this search.</td></tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
