import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import './App.css';
import { toDataURL } from 'qrcode';
import {
  clearToken,
  fetchMe,
  fetchMeRewards,
  getToken,
  requestOtp,
  setToken,
  updateMe,
  verifyOtp,
  type MemberProfile,
  type MemberRewardsPayload,
} from './api';

const PENDING_REFERRAL_KEY = 'moja_pending_referral';
import { OrdersTab } from './orders/OrdersTab';
import { ShopFlow } from './shop/ShopFlow';

type Step = 'phone' | 'code' | 'member';
type MemberTab = 'home' | 'perks' | 'shop' | 'orders' | 'account';
type PerksSub = 'vouchers' | 'rewards';
type VoucherTab = 'ACTIVE' | 'USED' | 'EXPIRED';
type RewardFilter = 'all' | 'food' | 'drinks';

function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`pmCard ${className}`.trim()}>{children}</section>;
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="sectionHeader">
      <h3>{title}</h3>
      {actionLabel && onAction ? (
        <button type="button" className="textAction" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function VoucherCard({
  title,
  conditions,
  expiry,
  status,
}: {
  title: string;
  conditions: string;
  expiry: string;
  status: string;
}) {
  const normalized = String(status || 'ACTIVE').toUpperCase();
  let isExpiring = false;
  if (normalized === 'ACTIVE' && expiry !== '-') {
    const d = new Date(expiry);
    if (!Number.isNaN(d.getTime())) {
      // eslint-disable-next-line react-hooks/purity -- relative expiry for voucher badge
      const diff = d.getTime() - Date.now();
      isExpiring = diff > 0 && diff < 1000 * 60 * 60 * 24 * 7;
    }
  }
  const badgeLabel = normalized === 'EXPIRED' ? 'Expired' : normalized === 'USED' ? 'Used' : isExpiring ? 'Expiring soon' : 'Active';
  return (
    <article className="voucherTicket">
      <div className="ticketTop">
        <strong>{title}</strong>
        <span className={`statusBadge ${isExpiring ? 'warning' : ''}`}>{badgeLabel}</span>
      </div>
      <p>{conditions}</p>
      <small>Expiry: {expiry}</small>
      <button type="button" disabled={normalized !== 'ACTIVE'}>
        Use Now
      </button>
    </article>
  );
}

function RewardCard({
  title,
  description,
  points,
  category,
  imageUrl,
}: {
  title: string;
  description: string;
  points: number;
  category: string;
  imageUrl: string;
}) {
  const imageStyle = imageUrl
    ? { backgroundImage: `linear-gradient(180deg, rgba(20,16,14,0.08), rgba(20,16,14,0.5)), url("${imageUrl}")` }
    : { backgroundImage: 'linear-gradient(180deg, rgba(20,16,14,0.08), rgba(20,16,14,0.5))' };
  return (
    <article className="rewardCard">
      <div
        className={`rewardImage ${category === 'drinks' ? 'drinks' : 'food'}`}
        style={imageStyle}
      />
      <div className="rewardBody">
        <strong>{title}</strong>
        <p>{description}</p>
        <div className="rewardFoot">
          <span>{points} pts</span>
          <button type="button">Redeem</button>
        </div>
      </div>
    </article>
  );
}

function App() {
  const [step, setStep] = useState<Step>('phone');
  const [tab, setTab] = useState<MemberTab>('home');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [rewardsData, setRewardsData] = useState<MemberRewardsPayload | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [phoneQrUrl, setPhoneQrUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [voucherTab, setVoucherTab] = useState<VoucherTab>('ACTIVE');
  const [rewardQuery, setRewardQuery] = useState('');
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>('all');
  const [perksSub, setPerksSub] = useState<PerksSub>('vouchers');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formBirthday, setFormBirthday] = useState('');

  const syncFormFromProfile = useCallback((p: MemberProfile) => {
    setFormName(p.displayName ?? '');
    setFormEmail(p.email ?? '');
    setFormBirthday(p.birthday ? p.birthday.slice(0, 10) : '');
  }, []);

  const loadMemberData = useCallback(async () => {
    const [me, rewards] = await Promise.all([fetchMe(), fetchMeRewards()]);
    setProfile(me);
    setRewardsData(rewards);
    syncFormFromProfile(me);
    setStep('member');
  }, [syncFormFromProfile]);

  useEffect(() => {
    if (getToken()) {
      void loadMemberData().catch(() => {
        clearToken();
        setStep('phone');
      });
    }
  }, [loadMemberData]);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const ref = u.searchParams.get('ref')?.trim();
      if (ref) sessionStorage.setItem(PENDING_REFERRAL_KEY, ref);
    } catch {
      /* ignore invalid URL */
    }
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);
    setLoading(true);
    try {
      const res = await requestOtp(phone);
      setStep('code');
      if (res.channel === 'whatsapp') {
        setHint('Check WhatsApp for your verification code.');
      } else if (res.channel === 'mock' && res._devCode) {
        setHint(`Test mode (mock): your OTP is ${res._devCode}`);
      } else if (res._devCode) {
        setHint(`Dev mode: your code is ${res._devCode}`);
      } else {
        setHint('If you did not receive a code, contact support.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const pendingRef = sessionStorage.getItem(PENDING_REFERRAL_KEY)?.trim();
      const { accessToken } = await verifyOtp(phone, code, {
        referralCode: pendingRef || undefined,
      });
      if (pendingRef) sessionStorage.removeItem(PENDING_REFERRAL_KEY);
      setToken(accessToken);
      await loadMemberData();
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      const updated = await updateMe({
        displayName: formName || undefined,
        email: formEmail || undefined,
        birthday: formBirthday || undefined,
      });
      setProfile(updated);
      setProfileMsg('Profile updated.');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const buildInviteUrl = useCallback(() => {
    const code = profile?.referralCode?.trim();
    const base = `${window.location.origin}${window.location.pathname}`;
    return code ? `${base}?ref=${encodeURIComponent(code)}` : base;
  }, [profile?.referralCode]);

  const handleShare = async () => {
    const shareText = 'Join me on Moja Member app for rewards and vouchers!';
    const shareUrl = buildInviteUrl();
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Moja Member',
          text: shareText,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        setProfileMsg('Invite link copied to clipboard.');
        setShareOpen(true);
      }
    } catch {
      setProfileMsg('Unable to share right now.');
      setShareOpen(true);
    }
  };

  const handleLogout = () => {
    clearToken();
    setProfile(null);
    setRewardsData(null);
    setStep('phone');
    setCode('');
    setHint(null);
    setError(null);
    setTab('home');
    setShareOpen(false);
  };

  const memberName = useMemo(
    () => profile?.displayName?.trim() || 'Member',
    [profile?.displayName],
  );

  const profilePersonalIncomplete = useMemo(() => {
    if (!profile) return false;
    const nameOk = Boolean(profile.displayName?.trim());
    const emailOk = Boolean(profile.email?.trim());
    const birthdayOk = Boolean(profile.birthday?.trim());
    return !nameOk || !emailOk || !birthdayOk;
  }, [profile]);

  const normalizedTierKey = useMemo(() => {
    const raw = (profile?.memberTier ?? 'silver').trim().toLowerCase();
    if (raw.includes('plat')) return 'platinum';
    if (raw.includes('gold')) return 'gold';
    if (raw.includes('silver')) return 'silver';
    return 'silver';
  }, [profile?.memberTier]);

  const tierDisplayName = useMemo(() => {
    if (normalizedTierKey === 'platinum') return 'Platinum';
    if (normalizedTierKey === 'gold') return 'Gold';
    return 'Silver';
  }, [normalizedTierKey]);

  const pointsBalance = rewardsData?.wallet.pointsBalance ?? 0;
  const nextTarget = Math.ceil((pointsBalance + 1) / 500) * 500;
  const pointsToNext = Math.max(nextTarget - pointsBalance, 0);
  const progressPct = Math.min(100, Math.max(0, (1 - pointsToNext / 500) * 100));

  const voucherItems = rewardsData?.vouchers ?? [];
  const visibleVouchers = voucherItems.filter((v) => {
    const status = String(v.status || '').toUpperCase();
    if (voucherTab === 'ACTIVE') return status === 'ISSUED' || status === 'ACTIVE';
    if (voucherTab === 'USED') return status === 'REDEEMED' || status === 'USED';
    return status === 'EXPIRED';
  });

  const normalizedRewards = (rewardsData?.rewards ?? []).map((r) => {
    const rawCategory = String(r.rewardCategory || '').trim().toLowerCase();
    const isDrinks = rawCategory.includes('drink') || rawCategory.includes('beverage');
    const isFood = rawCategory.includes('food') || rawCategory.includes('cake') || rawCategory.includes('bakery');
    const category: RewardFilter = isDrinks ? 'drinks' : isFood ? 'food' : 'food';
    return { ...r, category, imageUrl: r.imageUrl || '' };
  });
  const filteredRewards = normalizedRewards.filter((r) => {
    if (rewardFilter !== 'all' && r.category !== rewardFilter) return false;
    const q = rewardQuery.trim().toLowerCase();
    if (!q) return true;
    return `${r.title} ${r.description ?? ''} ${r.rewardCategory ?? ''}`.toLowerCase().includes(q);
  });

  const latestHomeVoucher = useMemo(() => {
    if (voucherItems.length === 0) return null;
    return [...voucherItems].sort((a, b) => {
      const ta = new Date(a.issuedAt || 0).getTime();
      const tb = new Date(b.issuedAt || 0).getTime();
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    })[0];
  }, [voucherItems]);

  const latestHomeReward = useMemo(() => {
    return normalizedRewards[0] ?? null;
  }, [normalizedRewards]);

  useEffect(() => {
    let alive = true;
    const p = profile?.phoneE164?.trim();
    if (!p) {
      setPhoneQrUrl(null);
      return;
    }
    toDataURL(p, { margin: 1, width: 220, color: { dark: '#2B2B2B', light: '#ffffff' } })
      .then((url: string) => {
        if (alive) setPhoneQrUrl(url);
      })
      .catch(() => {
        if (alive) setPhoneQrUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [profile?.phoneE164]);

  return (
    <div className="app">
      {(step === 'phone' || step === 'code') && (
        <main className="authMain">
          {step === 'phone' && (
            <section className="card authCard">
              <h1>Welcome to Moja Member</h1>
              <p className="sub">
                Register and login with phone OTP. We send your code to WhatsApp.
              </p>
              <form onSubmit={handleSendCode}>
                {sessionStorage.getItem(PENDING_REFERRAL_KEY) ? (
                  <p className="hint" style={{ marginTop: 0 }}>
                    You opened an invite link — your first sign-up will credit your friend after OTP verification.
                  </p>
                ) : null}
                <label htmlFor="phone">Phone number</label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. +65 9123 4567"
                  value={phone}
                  onChange={(ev) => setPhone(ev.target.value)}
                  required
                  disabled={loading}
                />
                {error && <p className="err">{error}</p>}
                <button type="submit" disabled={loading}>
                  {loading ? 'Sending…' : 'Send WhatsApp OTP'}
                </button>
              </form>
            </section>
          )}

          {step === 'code' && (
            <section className="card authCard">
              <h1>Verify OTP</h1>
              <p className="sub">Enter the code you received on WhatsApp.</p>
              {hint && <p className="hint">{hint}</p>}
              <form onSubmit={handleVerify}>
                <label htmlFor="code">OTP code</label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ''))}
                  required
                  disabled={loading}
                />
                {error && <p className="err">{error}</p>}
                <div className="row">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setStep('phone');
                      setCode('');
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    Change number
                  </button>
                  <button type="submit" disabled={loading}>
                    {loading ? 'Verifying…' : 'Verify & Continue'}
                  </button>
                </div>
              </form>
            </section>
          )}
        </main>
      )}

      {step === 'member' && profile && (
        <div className="pmShell">
          <main className="pmContent">
            {tab === 'home' && (
              <>
                <header className="pmTopBar">
                  <h2>Hi {memberName}</h2>
                  <button type="button" className="iconBtn" onClick={() => setShareOpen(true)} aria-label="Share app">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
                      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
                    </svg>
                  </button>
                </header>
                <Card className="pointsCard">
                  <p className="caption">Available points</p>
                  <h1>{pointsBalance.toLocaleString()} pts</h1>
                  <div className="progressWrap">
                    <div className="progressBar" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="caption">{pointsToNext} pts to next reward</p>
                </Card>

                <Card>
                  <SectionHeader title="My Voucher" />
                  <div className="voucherList">
                    {latestHomeVoucher ? (
                      <VoucherCard
                        key={latestHomeVoucher.id}
                        title={latestHomeVoucher.definition.title}
                        conditions={latestHomeVoucher.definition.description || latestHomeVoucher.definition.code}
                        expiry={latestHomeVoucher.expiresAt ? latestHomeVoucher.expiresAt.slice(0, 10) : '-'}
                        status={latestHomeVoucher.status}
                      />
                    ) : (
                      <p className="caption">No vouchers yet.</p>
                    )}
                  </div>
                  <div className="homeSectionFooter">
                    <button
                      type="button"
                      className="textAction"
                      onClick={() => {
                        setPerksSub('vouchers');
                        setTab('perks');
                      }}
                    >
                      View All
                    </button>
                  </div>
                </Card>

                <Card>
                  <SectionHeader title="Featured Rewards" />
                  <div className="rewardsGrid homeRewardsPreview">
                    {latestHomeReward ? (
                      <RewardCard
                        key={latestHomeReward.id}
                        title={latestHomeReward.title}
                        description={latestHomeReward.description || latestHomeReward.code}
                        points={latestHomeReward.pointsCost ?? 0}
                        category={latestHomeReward.category}
                        imageUrl={latestHomeReward.imageUrl}
                      />
                    ) : (
                      <p className="caption">No rewards to show yet.</p>
                    )}
                  </div>
                  <div className="homeSectionFooter">
                    <button
                      type="button"
                      className="textAction"
                      onClick={() => {
                        setPerksSub('rewards');
                        setTab('perks');
                      }}
                    >
                      View All
                    </button>
                  </div>
                </Card>

                <Card className="promoCard">
                  <h3>Fresh Morning Deal</h3>
                  <p>Earn double points on coffee + pastry combo before 11:00 AM.</p>
                </Card>
              </>
            )}

            {tab === 'perks' && (
              <>
                <header className="pmTopBar">
                  <h2>Perks</h2>
                </header>
                <div className="tabsRow">
                  <button
                    type="button"
                    className={perksSub === 'vouchers' ? 'chip active' : 'chip'}
                    onClick={() => setPerksSub('vouchers')}
                  >
                    Vouchers
                  </button>
                  <button
                    type="button"
                    className={perksSub === 'rewards' ? 'chip active' : 'chip'}
                    onClick={() => setPerksSub('rewards')}
                  >
                    Rewards
                  </button>
                </div>
                {perksSub === 'vouchers' ? (
                  <>
                    <p className="caption" style={{ margin: '6px 0 0' }}>
                      Your <strong>issued</strong> vouchers (added to your wallet). They are not the same as the points catalog under Rewards.
                    </p>
                    <div className="tabsRow" style={{ marginTop: 8 }}>
                      {(['ACTIVE', 'USED', 'EXPIRED'] as VoucherTab[]).map((vt) => (
                        <button
                          key={vt}
                          type="button"
                          className={voucherTab === vt ? 'chip active' : 'chip'}
                          onClick={() => setVoucherTab(vt)}
                        >
                          {vt === 'ACTIVE' ? 'Active' : vt === 'USED' ? 'Used' : 'Expired'}
                        </button>
                      ))}
                    </div>
                    <div className="voucherList">
                      {visibleVouchers.map((v) => (
                        <VoucherCard
                          key={v.id}
                          title={v.definition.title}
                          conditions={v.definition.description || v.definition.code}
                          expiry={v.expiresAt ? v.expiresAt.slice(0, 10) : '-'}
                          status={v.status}
                        />
                      ))}
                      {!visibleVouchers.length && (
                        <Card>
                          <p className="caption">No vouchers in this section.</p>
                        </Card>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="caption" style={{ margin: '6px 0 0' }}>
                      Redeem with <strong>points</strong> when the store lists an item here. Cash or rebate vouchers you receive appear under <strong>Vouchers</strong> after they are issued to you.
                    </p>
                    <Card>
                      <input
                        className="searchInput"
                        placeholder="Search rewards"
                        value={rewardQuery}
                        onChange={(e) => setRewardQuery(e.target.value)}
                      />
                      <div className="chips">
                        {(['all', 'food', 'drinks'] as RewardFilter[]).map((f) => (
                          <button
                            key={f}
                            type="button"
                            className={rewardFilter === f ? 'chip active' : 'chip'}
                            onClick={() => setRewardFilter(f)}
                          >
                            {f === 'all' ? 'All' : f === 'food' ? 'Food' : 'Drinks'}
                          </button>
                        ))}
                      </div>
                    </Card>
                    <div className="rewardsGrid">
                      {filteredRewards.map((r) => (
                        <RewardCard
                          key={r.id}
                          title={r.title}
                          description={r.description || r.code}
                          points={r.pointsCost ?? 0}
                          category={r.category}
                          imageUrl={r.imageUrl}
                        />
                      ))}
                      {!filteredRewards.length && (
                        <Card>
                          <p className="caption">No rewards match your search.</p>
                        </Card>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === 'shop' && <ShopFlow pointsBalance={pointsBalance} />}

            {tab === 'orders' && (
              <OrdersTab active={tab === 'orders'} onGoToShop={() => setTab('shop')} />
            )}

            {tab === 'account' && (
              <>
                <header className="pmTopBar">
                  <h2>Account</h2>
                </header>
                <Card>
                  <h3>{memberName}</h3>
                  <div
                    className={`tierBanner tierBanner--${normalizedTierKey}`}
                    role="status"
                    aria-label={`Member tier ${tierDisplayName}`}
                  >
                    <span className="tierBanner-label">Member tier</span>
                    <span className="tierBanner-name">{tierDisplayName}</span>
                  </div>
                </Card>
                <Card>
                  <SectionHeader title="Personal Info" />
                  {profilePersonalIncomplete ? (
                    <p className="profileIncompleteCue" role="status">
                      *Enter your details below
                    </p>
                  ) : null}
                  <form onSubmit={handleProfileSave}>
                    <label htmlFor="name">Name</label>
                    <input id="name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Your name" />
                    <label htmlFor="email">Email</label>
                    <input id="email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="you@email.com" />
                    <label htmlFor="birthday">Birthday</label>
                    <input id="birthday" type="date" value={formBirthday} onChange={(e) => setFormBirthday(e.target.value)} />
                    {profileMsg && <p className="hint">{profileMsg}</p>}
                    <button type="submit" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile'}</button>
                  </form>
                </Card>
                <Card>
                  <SectionHeader title="Invite & favourites" />
                  <p className="caption" style={{ marginTop: 0 }}>
                    Your code:{' '}
                    <strong>{profile.referralCode?.trim() || '—'}</strong>
                    {' · '}
                    Friends joined: <strong>{profile.referralCount ?? 0}</strong>
                  </p>
                  <p className="caption" style={{ marginTop: 8 }}>
                    Share your link so visits count toward referral rewards. Open “Share App” from Home or here.
                  </p>
                  <button type="button" className="rowAction" onClick={() => setShareOpen(true)}>
                    Copy invite link
                  </button>
                  {(profile.favoriteProducts?.length ?? 0) > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <p className="caption" style={{ margin: '0 0 6px' }}>
                        Top picks (from your orders)
                      </p>
                      <ul className="caption" style={{ margin: 0, paddingLeft: 18 }}>
                        {(profile.favoriteProducts ?? []).map((f) => (
                          <li key={f.productId}>
                            {f.name} × {f.totalQty}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="caption" style={{ marginTop: 12 }}>
                      Favourites appear after you place shop orders — we group what you buy most.
                    </p>
                  )}
                </Card>
                <Card>
                  <SectionHeader title="Activity" />
                  <div className="profileActions">
                    <button type="button" className="rowAction" onClick={() => setTab('orders')}>
                      Orders
                    </button>
                    <button
                      type="button"
                      className="rowAction"
                      onClick={() => {
                        setPerksSub('vouchers');
                        setTab('perks');
                      }}
                    >
                      Vouchers &amp; rewards
                    </button>
                  </div>
                </Card>
                <Card>
                  <SectionHeader title="Actions" />
                  <div className="profileActions">
                    <button type="button" className="rowAction" onClick={() => setShareOpen(true)}>Share App</button>
                  </div>
                </Card>
                <Card>
                  <SectionHeader title="Settings" />
                  <div className="profileActions">
                    <button type="button" className="rowAction danger" onClick={handleLogout}>Logout</button>
                  </div>
                </Card>
              </>
            )}
          </main>

          <nav className="bottomTabs">
            <button type="button" className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')} aria-label="Home">
              <div className="tabIconSlot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 22v-7h6v7"/></svg>
              </div>
              <span className="tabLabel">Home</span>
            </button>
            <button type="button" className={tab === 'perks' ? 'active' : ''} onClick={() => setTab('perks')} aria-label="Perks">
              <div className="tabIconSlot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h18v13H3z"/><path d="M12 8v13"/><circle cx="12" cy="16" r="2"/></svg>
              </div>
              <span className="tabLabel">Perks</span>
            </button>
            <button
              type="button"
              className={tab === 'shop' ? 'active' : ''}
              onClick={() => setTab('shop')}
              aria-label="Shop"
            >
              <div className="tabIconSlot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2h12l1.5 4H4.5z"/><path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 11h6"/></svg>
              </div>
              <span className="tabLabel">Shop</span>
            </button>
            <button type="button" className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')} aria-label="Orders">
              <div className="tabIconSlot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/></svg>
              </div>
              <span className="tabLabel">Orders</span>
            </button>
            <button
              type="button"
              className={[tab === 'account' ? 'active' : '', profilePersonalIncomplete ? 'tabProfileIncomplete' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setTab('account')}
              aria-label={
                profilePersonalIncomplete
                  ? 'Account — add your name, email, and birthday'
                  : 'Account'
              }
            >
              <div className="tabIconSlot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
                {profilePersonalIncomplete ? (
                  <div className="tabIconBadge" aria-hidden>
                    !
                  </div>
                ) : null}
              </div>
              <span className="tabLabel">Account</span>
            </button>
          </nav>

          {shareOpen && (
            <div className="shareOverlay" role="dialog" aria-modal="true">
              <div className="shareSheet">
                <SectionHeader title="Invite Friends" />
                <p className="caption">Invite your friends to join Moja and enjoy bakery rewards together.</p>
                <Card className="shareCodeCard">
                  <p className="caption">Referral code</p>
                  <h3>{profile.referralCode?.trim() || '—'}</h3>
                  <p className="caption" style={{ marginTop: 8 }}>
                    Friends joined: {profile.referralCount ?? 0}
                  </p>
                </Card>
                {phoneQrUrl ? (
                  <div className="shareQr">
                    <img src={phoneQrUrl} alt={`QR for ${profile.phoneE164}`} />
                    <code>{profile.phoneE164}</code>
                  </div>
                ) : null}
                <div className="shareActions">
                  <button type="button" onClick={handleShare}>Copy invite link</button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      const u = encodeURIComponent(buildInviteUrl());
                      const t = encodeURIComponent('Join me on Moja Member!');
                      window.open(`https://wa.me/?text=${t}%20${u}`, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    Share WhatsApp
                  </button>
                  <button type="button" className="ghost" onClick={handleShare}>
                    System share
                  </button>
                </div>
                <button type="button" className="textAction" onClick={() => setShareOpen(false)}>Close</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
