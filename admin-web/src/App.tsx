import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './App.css';
import {
  fetchMe,
  getStoredIdentity,
  hasSession,
  login,
  loginWithApiKey,
  logout,
  SESSION_EXPIRED_EVENT,
  type AdminIdentity,
} from './api';
import { DEFAULT_VIEW, groupIdForView, IMPLEMENTED_VIEWS, MENU } from './menu';
import { DashboardOverview } from './views/DashboardOverview';
import { CustomersList } from './views/CustomersList';
import { CustomerOrders } from './views/CustomerOrders';
import { SalesCatalog } from './views/SalesCatalog';
import { ShopLayout } from './views/ShopLayout';
import { RewardsWallet } from './views/RewardsWallet';
import { VoucherCampaigns } from './views/VoucherCampaigns';
import { RedeemVoucher } from './views/RedeemVoucher';
import { BentoVouchers } from './views/BentoVouchers';
import { GiftRewards } from './views/GiftRewards';
import { PopularItems } from './views/PopularItems';
import { HomeAds } from './views/HomeAds';

function identityLabel(identity: AdminIdentity): string {
  return identity.kind === 'user' ? identity.displayName || identity.email : identity.actorLabel;
}

function identityInitials(identity: AdminIdentity): string {
  const label = identityLabel(identity).trim();
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// One 20px stroke icon per top-level menu group — matched by group id.
const GROUP_ICONS: Record<string, ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  ),
  customers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  sales: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h12l1.5 4H4.5z" />
      <path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M9 11h6" />
    </svg>
  ),
  rewards: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="8" width="18" height="13" rx="1" />
      <path d="M12 8v13" />
      <path d="M3 12h18" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  ),
  marketing: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11v3a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
      <path d="M16 8a5 5 0 0 1 0 8" />
      <path d="M19 5a9 9 0 0 1 0 14" />
    </svg>
  ),
  finance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  'data-tools': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
};

function LoginScreen({ onSuccess }: { onSuccess: (identity: AdminIdentity) => void }) {
  const [mode, setMode] = useState<'jwt' | 'api_key'>('jwt');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const identity =
        mode === 'jwt' ? await login(email.trim(), password) : await loginWithApiKey(apiKey.trim());
      onSuccess(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loginScreen">
      <form className="loginCard" onSubmit={submit}>
        <h1 className="loginTitle">Moja Admin</h1>

        <div className="loginModeTabs">
          <button
            type="button"
            className={`loginModeTab${mode === 'jwt' ? ' active' : ''}`}
            onClick={() => setMode('jwt')}
          >
            Email &amp; password
          </button>
          <button
            type="button"
            className={`loginModeTab${mode === 'api_key' ? ' active' : ''}`}
            onClick={() => setMode('api_key')}
          >
            API key
          </button>
        </div>

        {mode === 'jwt' ? (
          <>
            <label className="loginLabel" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
            <label className="loginLabel" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </>
        ) : (
          <>
            <label className="loginLabel" htmlFor="apiKey">
              API key
            </label>
            <input
              id="apiKey"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              disabled={loading}
            />
            <p className="loginHint">
              Full-access service key — prefer email &amp; password for day-to-day use.
            </p>
          </>
        )}

        {error ? <p className="viewError">{error}</p> : null}
        <button type="submit" className="loginSubmit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="viewStack">
      <div className="comingSoon">
        <h2 className="panelTitle">{label}</h2>
        <p className="viewMuted">
          Not migrated to the new admin yet — use the{' '}
          <a href="/admin-dashboard" target="_blank" rel="noreferrer">
            legacy dashboard
          </a>{' '}
          for this section in the meantime.
        </p>
      </div>
    </div>
  );
}

const FLAT_VIEWS = MENU.flatMap((group) =>
  group.views.map((view) => ({ ...view, groupLabel: group.label })),
);

function renderView(viewId: string) {
  switch (viewId) {
    case 'dashboard-overview':
      return <DashboardOverview />;
    case 'customers-list':
      return <CustomersList />;
    case 'customer-orders':
      return <CustomerOrders />;
    case 'sales-catalog':
      return <SalesCatalog />;
    case 'sales-shop-layout':
      return <ShopLayout />;
    case 'rewards-wallet':
      return <RewardsWallet />;
    case 'rewards-voucher-campaigns':
      return <VoucherCampaigns />;
    case 'rewards-voucher-redeem':
      return <RedeemVoucher />;
    case 'rewards-bento-vouchers':
      return <BentoVouchers />;
    case 'rewards-gift-rewards':
      return <GiftRewards />;
    case 'sales-popular-items':
      return <PopularItems />;
    case 'sales-home-ads':
      return <HomeAds />;
    default:
      return null;
  }
}

function App() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(() => getStoredIdentity());
  const [checkingSession, setCheckingSession] = useState(() => hasSession());
  const [activeView, setActiveView] = useState(DEFAULT_VIEW);
  // Only the active view's group starts expanded, so the sidebar opens as a
  // short list instead of one long scroll through every section at once.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set([groupIdForView(DEFAULT_VIEW)].filter((id): id is string => Boolean(id))),
  );
  const [navQuery, setNavQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const navSearchRef = useRef<HTMLInputElement>(null);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const selectView = useCallback((viewId: string) => {
    setActiveView(viewId);
    const groupId = groupIdForView(viewId);
    if (groupId) {
      setExpandedGroups((prev) => (prev.has(groupId) ? prev : new Set(prev).add(groupId)));
    }
  }, []);

  const navMatches = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return [];
    return FLAT_VIEWS.filter(
      (v) => v.label.toLowerCase().includes(q) || v.groupLabel.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [navQuery]);

  const jumpToView = useCallback(
    (viewId: string) => {
      selectView(viewId);
      setNavQuery('');
      setNavOpen(false);
      navSearchRef.current?.blur();
    },
    [selectView],
  );

  useEffect(() => {
    if (!hasSession()) return;
    fetchMe()
      .then(setIdentity)
      .catch(() => setIdentity(null))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    const onExpired = () => setIdentity(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setIdentity(null);
  }, []);

  if (checkingSession) {
    return (
      <div className="loginScreen">
        <p className="viewMuted">Loading…</p>
      </div>
    );
  }

  if (!identity) {
    return <LoginScreen onSuccess={setIdentity} />;
  }

  const activeLabel =
    MENU.flatMap((g) => g.views).find((v) => v.id === activeView)?.label ?? '';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebarBrand">
          <span className="brandMark" aria-hidden>M</span>
          <span className="sidebarBrandText">Moja Admin</span>
        </div>
        <nav className="sidebarNav">
          {MENU.map((group) => {
            const icon = GROUP_ICONS[group.id];
            // A single-view group (e.g. Marketing, Settings) is a flat link —
            // no point expanding a group to reveal exactly one item.
            if (group.views.length === 1) {
              const view = group.views[0];
              return (
                <button
                  key={group.id}
                  type="button"
                  className={`sidebarGroupHeader${activeView === view.id ? ' active' : ''}`}
                  onClick={() => selectView(view.id)}
                >
                  <span className="sidebarGroupIcon" aria-hidden>{icon}</span>
                  <span className="sidebarGroupLabel">{group.label}</span>
                </button>
              );
            }

            const expanded = expandedGroups.has(group.id);
            return (
              <div key={group.id} className="sidebarGroup">
                <button
                  type="button"
                  className={`sidebarGroupHeader${
                    !expanded && groupIdForView(activeView) === group.id ? ' active' : ''
                  }`}
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="sidebarGroupIcon" aria-hidden>{icon}</span>
                  <span className="sidebarGroupLabel">{group.label}</span>
                  <span
                    className={`sidebarGroupChevron${expanded ? ' expanded' : ''}`}
                    aria-hidden
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </button>
                {expanded ? (
                  <div className="sidebarGroupViews">
                    {group.views.map((view) => (
                      <button
                        key={view.id}
                        type="button"
                        className={`sidebarItem${activeView === view.id ? ' active' : ''}${
                          IMPLEMENTED_VIEWS.has(view.id) ? '' : ' sidebarItemPending'
                        }`}
                        onClick={() => selectView(view.id)}
                      >
                        {view.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="sidebarFooterCard">
          <span className="sidebarFooterTitle">Need an older section?</span>
          <p className="sidebarFooterText">
            Views not migrated here yet still work in the legacy dashboard.
          </p>
          <a className="sidebarFooterLink" href="/admin-dashboard" target="_blank" rel="noreferrer">
            Open legacy dashboard
          </a>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1 className="topbarTitle">{activeLabel}</h1>
          <div className="topbarSearch">
            <span className="topbarSearchIcon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </span>
            <input
              ref={navSearchRef}
              type="text"
              className="topbarSearchInput"
              placeholder="Jump to a section…"
              value={navQuery}
              onChange={(e) => {
                setNavQuery(e.target.value);
                setNavOpen(true);
              }}
              onFocus={() => setNavOpen(true)}
              onBlur={() => setNavOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && navMatches[0]) jumpToView(navMatches[0].id);
                if (e.key === 'Escape') {
                  setNavQuery('');
                  setNavOpen(false);
                }
              }}
              aria-label="Jump to a dashboard section"
            />
            {navOpen && navQuery.trim() ? (
              <div className="topbarSearchDropdown">
                {navMatches.length ? (
                  navMatches.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="topbarSearchOption"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        jumpToView(v.id);
                      }}
                    >
                      {v.label} <span className="topbarSearchOptionGroup">· {v.groupLabel}</span>
                    </button>
                  ))
                ) : (
                  <p className="topbarSearchEmpty">No matching section.</p>
                )}
              </div>
            ) : null}
          </div>
          <div className="topbarUser">
            <span className="identityAvatar" aria-hidden>{identityInitials(identity)}</span>
            <span className="identityName">{identityLabel(identity)}</span>
            <button type="button" className="toolbarButton" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>
        <main className="content">
          {IMPLEMENTED_VIEWS.has(activeView) ? renderView(activeView) : <ComingSoon label={activeLabel} />}
        </main>
      </div>
    </div>
  );
}

export default App;
