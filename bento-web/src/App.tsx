import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import './bento-ui.css';
import { AuthScreens, logout } from './auth/AuthScreens';
import {
  clearToken,
  fetchBentoPackages,
  fetchMe,
  fetchMyBentoSubscriptions,
  getToken,
  isProfileIncomplete,
  updateMe,
  type MemberProfile,
} from './api';
import type { BentoSubscription } from './bento/types';
import { formatRm } from './bento/types';
import { Checkout } from './bento/Checkout';
import { MealOptionPicker } from './bento/MealOptionPicker';
import { MenuPicker } from './bento/MenuPicker';
import { MenuTab } from './bento/MenuTab';
import { OrderHero } from './bento/OrderHero';
import { PackageSelector } from './bento/PackageSelector';
import { ScheduleTab } from './bento/ScheduleTab';
import { CapacityUrgencyNotice } from './bento/CapacityUrgencyNotice';
import { useVisualViewportHeight } from './lib/useVisualViewportHeight';
import type { BentoPackage, BentoPackageCode, OrderDraft } from './bento/types';

type Tab = 'menu' | 'package' | 'schedule' | 'account';

function dietLabel(v: string) {
  return v === 'VEG' ? 'Vegetarian' : 'Regular';
}

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function PurchaseItem({ sub }: { sub: BentoSubscription }) {
  return (
    <li className="purchaseItem">
      <div className="purchaseItemTop">
        <span className="purchaseItemName">{sub.package.label}</span>
        <span className={`statusPill status-${sub.status}`}>{statusLabel(sub.status)}</span>
      </div>
      <p className="purchaseItemMeta">
        {formatRm(sub.totalCents)} · {sub.mealCreditsTotal} meal{sub.mealCreditsTotal > 1 ? 's' : ''}
        {sub.mealOption !== 'DINNER' && ` · Lunch: ${dietLabel(sub.lunchVariant)}`}
        {sub.mealOption !== 'LUNCH' && ` · Dinner: ${dietLabel(sub.dinnerVariant)}`}
        {sub.riceType === 'BROWN' && ' · Brown rice'}
      </p>
      {sub.startDate && (
        <p className="purchaseItemDate">
          {sub.startDate}{sub.endDate ? ` → ${sub.endDate}` : ''}
        </p>
      )}
      {sub.deliveries.length > 0 && (
        <p className="purchaseItemDate">
          {sub.deliveries.length} pickup day{sub.deliveries.length > 1 ? 's' : ''} scheduled
        </p>
      )}
    </li>
  );
}

function PurchaseHistory({ onViewAll }: { onViewAll: () => void }) {
  const [subs, setSubs] = useState<BentoSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchMyBentoSubscriptions()
      .then(setSubs)
      .catch(() => setSubs([]))
      .finally(() => setLoading(false));
  }, []);

  const preview = subs.slice(0, 3);
  const hasMore = subs.length > 3;

  return (
    <div className="purchaseHistorySection">
      <h3 className="purchaseHistoryTitle">Purchase history</h3>
      {loading && <p className="caption">Loading…</p>}
      {!loading && subs.length === 0 && <p className="caption">No purchases yet.</p>}
      {!loading && subs.length > 0 && (
        <>
          <ul className="purchaseList">
            {preview.map((sub) => <PurchaseItem key={sub.id} sub={sub} />)}
          </ul>
          {hasMore && (
            <button
              type="button"
              className="btnSecondary"
              onClick={onViewAll}
              style={{ marginTop: 12, fontSize: '0.85rem' }}
            >
              View all {subs.length} orders →
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PurchaseHistoryPage({ onBack }: { onBack: () => void }) {
  const [subs, setSubs] = useState<BentoSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchMyBentoSubscriptions()
      .then(setSubs)
      .catch(() => setSubs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="checkoutPageNav">
        <button type="button" className="backBtn" onClick={onBack}>← Back</button>
        <span className="checkoutPageTitle">All orders</span>
      </div>
      <section className="section">
        {loading && <p className="caption">Loading…</p>}
        {!loading && subs.length === 0 && <p className="caption">No purchases yet.</p>}
        {!loading && subs.length > 0 && (
          <ul className="purchaseList">
            {subs.map((sub) => <PurchaseItem key={sub.id} sub={sub} />)}
          </ul>
        )}
      </section>
    </>
  );
}

function ContactUs() {
  return (
    <div className="contactUsSection">
      <h3 className="contactUsTitle">Contact us</h3>
      <p className="caption">Need help or have a question? We&apos;re happy to assist.</p>
      <div className="contactOptions">
        <a
          href="https://wa.me/601XXXXXXXX"
          className="contactBtn contactWhatsapp"
          target="_blank"
          rel="noreferrer"
        >
          <span>💬</span> WhatsApp us
        </a>
        <a
          href="mailto:hello@moja.my"
          className="contactBtn contactEmail"
        >
          <span>✉️</span> Email us
        </a>
      </div>
    </div>
  );
}

function AccountTab({
  profile,
  onProfileUpdated,
  onLogout,
}: {
  profile: MemberProfile;
  onProfileUpdated: (p: MemberProfile) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(profile.displayName ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [birthday, setBirthday] = useState(profile.birthday?.slice(0, 10) ?? '');
  const [gender, setGender] = useState(profile.gender ?? '');
  const [address, setAddress] = useState(profile.address ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showHistoryPage, setShowHistoryPage] = useState(false);

  const incomplete = isProfileIncomplete(profile);

  if (showHistoryPage) {
    return <PurchaseHistoryPage onBack={() => setShowHistoryPage(false)} />;
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const updated = await updateMe({
        displayName: name || undefined,
        email: email || undefined,
        birthday: birthday || undefined,
        gender: gender || undefined,
        address: address || undefined,
      });
      onProfileUpdated(updated);
      setMsg('Profile saved.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section accountForm">
      <h2>
        Account
        {incomplete && (
          <span className="accountIncompleteMark" title="Profile incomplete" aria-hidden>
            !
          </span>
        )}
      </h2>
      <p className="caption">{profile.phoneE164}</p>
      {incomplete && (
        <p className="profileIncompleteCue" role="status">
          Please complete your profile — name, email, birthday, sex, and work/home address are required.
        </p>
      )}
      <form onSubmit={(e) => void save(e)}>
        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="birthday">Birthday</label>
        <input id="birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} required />
        <label htmlFor="gender">Sex</label>
        <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)} required>
          <option value="">Select…</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>
        <label htmlFor="address">Address</label>
        <textarea
          id="address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Office / home address"
          required
        />
        {msg && <p className="hint">{msg}</p>}
        <button type="submit" className="btnPrimary" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
      <button type="button" className="btnSecondary" onClick={onLogout}>
        Logout
      </button>
      <PurchaseHistory onViewAll={() => setShowHistoryPage(true)} />
      <ContactUs />
    </section>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));
  const [tab, setTab] = useState<Tab>('menu');
  const [orderStep, setOrderStep] = useState<'configure' | 'checkout'>('configure');
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [packages, setPackages] = useState<BentoPackage[]>([]);
  const [drinksAndSoupEnabled, setDrinksAndSoupEnabled] = useState(true);
  const [paymentBanner, setPaymentBanner] = useState<'success' | 'paid_schedule' | 'failed' | null>(null);

  const [draft, setDraft] = useState<OrderDraft>(() => ({
    packageCode: null,
    mealOption: 'LUNCH',
    lunchVariant: 'NONVEG',
    dinnerVariant: 'NONVEG',
    riceType: 'WHITE',
    includeDrinkAddon: false,
  }));

  const selectedPkg = useMemo(
    () => packages.find((p) => p.code === draft.packageCode) ?? null,
    [packages, draft.packageCode],
  );

  const profileIncomplete = useMemo(
    () => (profile ? isProfileIncomplete(profile) : false),
    [profile],
  );

  const loadMember = useCallback(async () => {
    const me = await fetchMe();
    setProfile(me);
    setAuthed(true);
    const pkgRes = await fetchBentoPackages();
    setPackages(pkgRes.packages.filter((p) => p.code !== 'DAYS_60' && p.code !== 'ONE_TIME'));
    setDrinksAndSoupEnabled(pkgRes.features.drinksAndSoupEnabled);
    if (!pkgRes.features.drinksAndSoupEnabled) {
      setDraft((d) => ({ ...d, includeDrinkAddon: false }));
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      void loadMember().catch(() => {
        clearToken();
        setAuthed(false);
      });
    }
  }, [loadMember]);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const pay = u.searchParams.get('bentoPayment');
      if (pay === 'success') {
        setPaymentBanner('paid_schedule');
        setTab('schedule');
      }
      if (pay) {
        u.searchParams.delete('bentoPayment');
        u.searchParams.delete('subscriptionId');
        window.history.replaceState({}, '', u.pathname + u.search);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useVisualViewportHeight(authed);

  const selectPackage = (code: BentoPackageCode) => {
    const pkg = packages.find((p) => p.code === code);
    if (!pkg) return;
    setDraft((d) => ({
      ...d,
      packageCode: code,
      mealOption: pkg.newcomerLunchOnly ? 'LUNCH' : d.mealOption,
    }));
  };

  if (!authed) {
    return (
      <div className="app">
        <AuthScreens onAuthenticated={() => void loadMember()} />
      </div>
    );
  }

  return (
    <div className="app appShell">
      <main className="shell">
        {paymentBanner === 'paid_schedule' && (
          <div className="paymentBanner success">
            <p className="paymentBannerTitle">Payment received</p>
            <p className="paymentBannerLead">Head to Schedule below to pick your pickup days.</p>
            <CapacityUrgencyNotice variant="banner" />
          </div>
        )}

        {/* Menu tab — read-only weekly menu */}
        {tab === 'menu' && (
          <MenuTab onOrderNow={() => { setTab('package'); setOrderStep('configure'); }} />
        )}

        {/* Package tab — order flow */}
        {tab === 'package' && orderStep === 'configure' && (
          <>
            <OrderHero profile={profile} selectedPackage={selectedPkg} />
            <PackageSelector
              packages={packages}
              selected={draft.packageCode}
              onSelect={selectPackage}
            />
            {draft.packageCode && selectedPkg && (
              <>
                <MealOptionPicker
                  value={draft.mealOption}
                  packageCode={draft.packageCode}
                  mealCredits={selectedPkg.mealCredits}
                  drinksAndSoupEnabled={drinksAndSoupEnabled}
                  onChange={(mealOption) => setDraft((d) => ({ ...d, mealOption }))}
                />
                <MenuPicker
                  mealOption={draft.mealOption}
                  lunchVariant={draft.lunchVariant}
                  dinnerVariant={draft.dinnerVariant}
                  riceType={draft.riceType}
                  includeDrinkAddon={draft.includeDrinkAddon}
                  includeFreeSoupAndDrinks={selectedPkg.includeFreeSoupAndDrinks}
                  drinksAndSoupEnabled={drinksAndSoupEnabled}
                  onLunchVariantChange={(lunchVariant) => setDraft((d) => ({ ...d, lunchVariant }))}
                  onDinnerVariantChange={(dinnerVariant) => setDraft((d) => ({ ...d, dinnerVariant }))}
                  onRiceTypeChange={(riceType) => setDraft((d) => ({ ...d, riceType }))}
                  onDrinkAddonChange={(includeDrinkAddon) => setDraft((d) => ({ ...d, includeDrinkAddon }))}
                />
                <button
                  type="button"
                  className="btnPrimary"
                  style={{ marginTop: 8, marginBottom: 8 }}
                  onClick={() => setOrderStep('checkout')}
                >
                  Review order →
                </button>
              </>
            )}
          </>
        )}

        {tab === 'package' && orderStep === 'checkout' && (
          <div className="checkoutPage">
            <div className="checkoutPageNav">
              <button
                type="button"
                className="backBtn"
                onClick={() => setOrderStep('configure')}
              >
                ← Back
              </button>
              <span className="checkoutPageTitle">Review order</span>
            </div>
            <Checkout
              draft={draft}
              onSuccess={() => {
                setPaymentBanner('paid_schedule');
                setTab('schedule');
                setOrderStep('configure');
              }}
            />
          </div>
        )}

        {/* Schedule tab — calendar scheduling */}
        {tab === 'schedule' && <ScheduleTab profile={profile} />}

        {/* Account tab */}
        {tab === 'account' && profile && (
          <AccountTab
            profile={profile}
            onProfileUpdated={setProfile}
            onLogout={() => {
              logout();
              setAuthed(false);
              setProfile(null);
              setPackages([]);
            }}
          />
        )}
      </main>

      <nav className="bottomTabs">
        <div className="bottomTabsInner">
          <button
            type="button"
            className={tab === 'menu' ? 'active' : ''}
            onClick={() => setTab('menu')}
          >
            <span className="tabIcon">🍽️</span>
            Menu
          </button>
          <button
            type="button"
            className={tab === 'package' ? 'active' : ''}
            onClick={() => { setTab('package'); setOrderStep('configure'); }}
          >
            <span className="tabIcon">🍱</span>
            Package
          </button>
          <button
            type="button"
            className={tab === 'schedule' ? 'active' : ''}
            onClick={() => setTab('schedule')}
          >
            <span className="tabIcon">📅</span>
            Schedule
          </button>
          <button
            type="button"
            className={tab === 'account' ? 'active' : ''}
            onClick={() => setTab('account')}
          >
            <span className="tabIcon">👤</span>
            Account
            {profileIncomplete && (
              <span className="tabAlertBadge" aria-label="Profile incomplete">!</span>
            )}
          </button>
        </div>
      </nav>
    </div>
  );
}
