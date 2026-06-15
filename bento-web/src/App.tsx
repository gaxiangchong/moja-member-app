import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import './bento-ui.css';
import { AuthScreens, logout } from './auth/AuthScreens';
import {
  clearToken,
  fetchBentoPackages,
  fetchMe,
  fetchMyBentoSubscriptions,
  fetchPaymentIntentStatus,
  getToken,
  isProfileIncomplete,
  updateMe,
  type MemberProfile,
} from './api';
import type {
  BentoPackage,
  BentoPackageCode,
  BentoSavingsBaseline,
  BentoSubscription,
  OrderDraft,
} from './bento/types';
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
import { LangToggle, useI18n } from './lib/i18n/context';
import {
  clearPendingBentoPayment,
  readPendingBentoPayment,
} from './payments/pendingPayment';

type Tab = 'menu' | 'package' | 'schedule' | 'account';

function PurchaseItem({ sub }: { sub: BentoSubscription }) {
  const { t, packageLabel, dietLabel, statusLabel } = useI18n();
  return (
    <li className="purchaseItem">
      <div className="purchaseItemTop">
        <span className="purchaseItemName">{packageLabel(sub.package.code, sub.package.label)}</span>
        <span className={`statusPill status-${sub.status}`}>{statusLabel(sub.status)}</span>
      </div>
      <p className="purchaseItemMeta">
        {formatRm(sub.totalCents)} · {sub.mealCreditsTotal} {t('common.mealPlural')}
        {sub.mealOption !== 'DINNER' && t('account.lunchDiet', { diet: dietLabel(sub.lunchVariant) })}
        {sub.mealOption !== 'LUNCH' && t('account.dinnerDiet', { diet: dietLabel(sub.dinnerVariant) })}
        {sub.riceType === 'BROWN' && t('account.brownRiceTag')}
      </p>
      {sub.startDate && (
        <p className="purchaseItemDate">
          {sub.startDate}{sub.endDate ? ` → ${sub.endDate}` : ''}
        </p>
      )}
      {sub.deliveries.length > 0 && (
        <p className="purchaseItemDate">
          {t(sub.deliveries.length === 1 ? 'account.pickupDays' : 'account.pickupDaysPlural', {
            count: sub.deliveries.length,
          })}
        </p>
      )}
    </li>
  );
}

function PurchaseHistory({ onViewAll }: { onViewAll: () => void }) {
  const { t } = useI18n();
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
      <h3 className="purchaseHistoryTitle">{t('account.purchaseHistory')}</h3>
      {loading && <p className="caption">{t('common.loading')}</p>}
      {!loading && subs.length === 0 && <p className="caption">{t('account.noPurchases')}</p>}
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
              {t('account.viewAllOrders', { count: subs.length })}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PurchaseHistoryPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
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
        <button type="button" className="backBtn" onClick={onBack}>{t('common.back')}</button>
        <span className="checkoutPageTitle">{t('account.allOrders')}</span>
      </div>
      <section className="section">
        {loading && <p className="caption">{t('common.loading')}</p>}
        {!loading && subs.length === 0 && <p className="caption">{t('account.noPurchases')}</p>}
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
  const { t } = useI18n();
  return (
    <div className="contactUsSection">
      <h3 className="contactUsTitle">{t('account.contactTitle')}</h3>
      <p className="caption">{t('account.contactCaption')}</p>
      <div className="contactOptions">
        <a
          href="https://wa.me/601139331134"
          className="contactBtn contactWhatsapp"
          target="_blank"
          rel="noreferrer"
        >
          <span>💬</span> {t('common.whatsapp')}
        </a>
        <a
          href="mailto:admin@mojamaison.com"
          className="contactBtn contactEmail"
        >
          <span>✉️</span> {t('common.emailUs')}
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
  const { t } = useI18n();
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
      setMsg(t('account.saved'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('account.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section accountForm">
      <h2>
        {t('account.title')}
        {incomplete && (
          <span className="accountIncompleteMark" title={t('nav.profileIncomplete')} aria-hidden>
            !
          </span>
        )}
      </h2>
      <p className="caption">{profile.phoneE164}</p>
      {incomplete && (
        <p className="profileIncompleteCue" role="status">
          {t('account.incompleteCue')}
        </p>
      )}
      <form onSubmit={(e) => void save(e)}>
        <label htmlFor="name">{t('common.name')}</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <label htmlFor="email">{t('common.email')}</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="birthday">{t('common.birthday')}</label>
        <input id="birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} required />
        <label htmlFor="gender">{t('common.sex')}</label>
        <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)} required>
          <option value="">{t('common.selectOption')}</option>
          <option value="Male">{t('common.male')}</option>
          <option value="Female">{t('common.female')}</option>
        </select>
        <label htmlFor="address">{t('common.address')} ({t('common.optional')})</label>
        <textarea
          id="address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('account.addressPlaceholder')}
        />
        {msg && <p className="hint">{msg}</p>}
        <div className="accountLangSection">
          <span className="accountLangLabel">{t('account.language')}</span>
          <LangToggle className="accountLangToggle" />
        </div>
        <button type="submit" className="btnPrimary accountSaveBtn" disabled={saving}>
          {saving ? t('common.saving') : t('account.saveProfile')}
        </button>
      </form>
      <PurchaseHistory onViewAll={() => setShowHistoryPage(true)} />
      <ContactUs />
      <button type="button" className="btnSecondary accountLogoutBtn" onClick={onLogout}>
        {t('common.logout')}
      </button>
    </section>
  );
}

export default function App() {
  const { t } = useI18n();
  const [authed, setAuthed] = useState(() => Boolean(getToken()));
  const [tab, setTab] = useState<Tab>('menu');
  const [orderStep, setOrderStep] = useState<'configure' | 'checkout'>('configure');
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [packages, setPackages] = useState<BentoPackage[]>([]);
  const [savingsBaseline, setSavingsBaseline] = useState<BentoSavingsBaseline | null>(null);
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

  const handlePaymentSuccess = useCallback(() => {
    clearPendingBentoPayment();
    setPaymentBanner('paid_schedule');
    setTab('schedule');
    setOrderStep('configure');
  }, []);

  const loadMember = useCallback(async () => {
    const me = await fetchMe();
    setProfile(me);
    setAuthed(true);
    const pkgRes = await fetchBentoPackages();
    setPackages(pkgRes.packages.filter((p) => p.code !== 'DAYS_60' && p.code !== 'ONE_TIME'));
    setSavingsBaseline(pkgRes.savingsBaseline);
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
        handlePaymentSuccess();
      } else if (pay === 'failed') {
        clearPendingBentoPayment();
        setPaymentBanner('failed');
        setOrderStep('configure');
      }
      if (pay) {
        u.searchParams.delete('bentoPayment');
        u.searchParams.delete('subscriptionId');
        window.history.replaceState({}, '', u.pathname + u.search);
      }
    } catch {
      /* ignore */
    }
  }, [handlePaymentSuccess]);

  // E-wallets (TNG, ShopeePay) often don't redirect back after payment — poll instead.
  useEffect(() => {
    if (!authed) return;

    let cancelled = false;
    let intervalId: number | null = null;
    let pollingStartedAt = 0;
    const POLL_INTERVAL_MS = 3000;
    const POLL_MAX_MS = 5 * 60 * 1000;

    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const tick = async () => {
      const pending = readPendingBentoPayment();
      if (!pending) {
        stop();
        return;
      }
      if (Date.now() - pollingStartedAt > POLL_MAX_MS) {
        stop();
        return;
      }
      try {
        const res = await fetchPaymentIntentStatus(pending.referenceId);
        if (cancelled) return;
        if (res.status === 'SUCCEEDED') {
          handlePaymentSuccess();
          stop();
        } else if (res.status === 'FAILED') {
          clearPendingBentoPayment();
          setPaymentBanner('failed');
          setOrderStep('configure');
          stop();
        }
      } catch {
        /* transient — keep polling */
      }
    };

    const start = () => {
      if (intervalId !== null) return;
      if (!readPendingBentoPayment()) return;
      pollingStartedAt = Date.now();
      void tick();
      intervalId = window.setInterval(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start();
    };
    const onFocus = () => start();

    start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [authed, handlePaymentSuccess]);

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
            <p className="paymentBannerTitle">{t('payment.received')}</p>
            <p className="paymentBannerLead">{t('payment.scheduleLead')}</p>
            <CapacityUrgencyNotice variant="banner" />
          </div>
        )}
        {paymentBanner === 'failed' && (
          <div className="paymentBanner failed">
            <p className="paymentBannerTitle">{t('payment.failed')}</p>
            <p className="paymentBannerLead">{t('payment.failedLead')}</p>
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
              savingsBaseline={savingsBaseline}
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
                  {t('checkout.reviewBtn')}
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
                {t('common.back')}
              </button>
              <span className="checkoutPageTitle">{t('checkout.reviewOrder')}</span>
            </div>
            <Checkout
              draft={draft}
              onSuccess={handlePaymentSuccess}
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
            {t('nav.menu')}
          </button>
          <button
            type="button"
            className={tab === 'package' ? 'active' : ''}
            onClick={() => { setTab('package'); setOrderStep('configure'); }}
          >
            <span className="tabIcon">🍱</span>
            {t('nav.package')}
          </button>
          <button
            type="button"
            className={tab === 'schedule' ? 'active' : ''}
            onClick={() => setTab('schedule')}
          >
            <span className="tabIcon">📅</span>
            {t('nav.schedule')}
          </button>
          <button
            type="button"
            className={tab === 'account' ? 'active' : ''}
            onClick={() => setTab('account')}
          >
            <span className="tabIcon">👤</span>
            {t('nav.account')}
            {profileIncomplete && (
              <span className="tabAlertBadge" aria-label={t('nav.profileIncomplete')}>!</span>
            )}
          </button>
        </div>
      </nav>
    </div>
  );
}
