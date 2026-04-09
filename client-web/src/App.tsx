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

type Step = 'phone' | 'code' | 'member';
type MemberTab = 'overview' | 'vouchers' | 'rewards' | 'profile';
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
  const isExpiring = normalized === 'ACTIVE' && expiry !== '-' && (() => {
    const d = new Date(expiry);
    if (Number.isNaN(d.getTime())) return false;
    const diff = d.getTime() - Date.now();
    return diff > 0 && diff < 1000 * 60 * 60 * 24 * 7;
  })();
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
  return (
    <article className="rewardCard">
      <div
        className={`rewardImage ${category === 'drinks' ? 'drinks' : 'food'}`}
        style={{ backgroundImage: `linear-gradient(180deg, rgba(20,16,14,0.08), rgba(20,16,14,0.5)), url("${imageUrl}")` }}
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
  const [tab, setTab] = useState<MemberTab>('overview');
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
      const { accessToken } = await verifyOtp(phone, code);
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

  const handleShare = async () => {
    const shareText = 'Join me on Moja Member app for rewards and vouchers!';
    const shareUrl = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Moja Member',
          text: shareText,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        setProfileMsg('Share link copied to clipboard.');
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
    setTab('overview');
    setShareOpen(false);
  };

  const memberName = useMemo(
    () => profile?.displayName?.trim() || 'Member',
    [profile?.displayName],
  );
  const shopWebUrl = useMemo(() => {
    const raw = import.meta.env.VITE_SHOP_WEB_URL?.trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.toString();
    } catch {
      return '';
    }
  }, []);

  const openShopWebsite = useCallback(() => {
    if (!shopWebUrl) {
      setProfileMsg('Shop website is not configured. Set VITE_SHOP_WEB_URL in client-web env.');
      return;
    }
    const w = window.open(shopWebUrl, '_blank', 'noopener,noreferrer');
    if (!w) {
      window.location.href = shopWebUrl;
    }
  }, [shopWebUrl]);
  const memberTier = profile?.memberTier || 'Gold';

  const pointsBalance = rewardsData?.wallet.pointsBalance ?? 0;
  const nextTarget = Math.ceil((pointsBalance + 1) / 500) * 500;
  const pointsToNext = Math.max(nextTarget - pointsBalance, 0);
  const progressPct = Math.min(100, Math.max(0, (1 - pointsToNext / 500) * 100));

  const voucherItems = rewardsData?.vouchers ?? [];
  const demoVouchers = [
    {
      id: 'demo-voucher-birthday',
      status: 'ISSUED',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
      definition: {
        id: 'demo-def-birthday',
        code: 'DEMO_BDAY_10',
        title: 'Demo: Birthday Cake Slice',
        description: 'Free cake slice with any drink purchase.',
        pointsCost: 0,
      },
    },
    {
      id: 'demo-voucher-reengage',
      status: 'ISSUED',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(),
      definition: {
        id: 'demo-def-reengage',
        code: 'DEMO_WELCOME_BACK',
        title: 'Demo: Welcome Back 15% OFF',
        description: '15% off your next bakery purchase.',
        pointsCost: 0,
      },
    },
  ];
  const voucherItemsWithDemo = [...demoVouchers, ...voucherItems];
  const visibleVouchers = voucherItems.filter((v) => {
    const status = String(v.status || '').toUpperCase();
    if (voucherTab === 'ACTIVE') return status === 'ISSUED' || status === 'ACTIVE';
    if (voucherTab === 'USED') return status === 'REDEEMED' || status === 'USED';
    return status === 'EXPIRED';
  });

  const normalizedRewards = (rewardsData?.rewards ?? []).map((r) => {
    const s = `${r.title} ${r.description ?? ''}`.toLowerCase();
    const category: RewardFilter = s.includes('coffee') || s.includes('latte') || s.includes('tea') ? 'drinks' : 'food';
    const drinkImages = [
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=80',
    ];
    const foodImages = [
      'https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1558301211-0d8c8ddee6ec?auto=format&fit=crop&w=900&q=80',
    ];
    const hash = Math.abs(
      [...`${r.id}${r.title}`].reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
    );
    const imageUrl =
      category === 'drinks'
        ? drinkImages[hash % drinkImages.length]
        : foodImages[hash % foodImages.length];
    return { ...r, category, imageUrl };
  });
  const demoRewards = [
    {
      id: 'demo-reward-cake',
      code: 'DEMO_RED_VELVET',
      title: 'Demo: Red Velvet Cake',
      description: 'Premium red velvet slice with cream cheese frosting.',
      pointsCost: 240,
      isActive: true,
      category: 'food' as RewardFilter,
      imageUrl: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 'demo-reward-coffee',
      code: 'DEMO_COFFEE',
      title: 'Demo: Signature Coffee',
      description: 'Handcrafted coffee reward for loyal members.',
      pointsCost: 180,
      isActive: true,
      category: 'drinks' as RewardFilter,
      imageUrl: 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=900&q=80',
    },
  ];
  const normalizedRewardsWithDemo = [...demoRewards, ...normalizedRewards];
  const filteredRewards = normalizedRewardsWithDemo.filter((r) => {
    if (rewardFilter !== 'all' && r.category !== rewardFilter) return false;
    const q = rewardQuery.trim().toLowerCase();
    if (!q) return true;
    return `${r.title} ${r.description ?? ''}`.toLowerCase().includes(q);
  });

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
            {tab === 'overview' && (
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
                  <SectionHeader title="My Voucher" actionLabel="View All" onAction={() => setTab('vouchers')} />
                  <div className="hScroll">
                    {(voucherItemsWithDemo.slice(0, 3)).map((v) => (
                      <VoucherCard
                        key={v.id}
                        title={v.definition.title}
                        conditions={v.definition.description || v.definition.code}
                        expiry={v.expiresAt ? v.expiresAt.slice(0, 10) : '-'}
                        status={v.status}
                      />
                    ))}
                    {!voucherItemsWithDemo.length && <p className="caption">No vouchers yet.</p>}
                  </div>
                </Card>

                <Card>
                  <SectionHeader title="Featured Rewards" actionLabel="View All" onAction={() => setTab('rewards')} />
                  <div className="hScroll rewardScroll">
                    {normalizedRewardsWithDemo.slice(0, 4).map((r) => (
                      <RewardCard
                        key={r.id}
                        title={r.title}
                        description={r.description || r.code}
                        points={r.pointsCost ?? 0}
                        category={r.category}
                        imageUrl={r.imageUrl}
                      />
                    ))}
                  </div>
                </Card>

                <Card className="promoCard">
                  <h3>Fresh Morning Deal</h3>
                  <p>Earn double points on coffee + pastry combo before 11:00 AM.</p>
                </Card>
              </>
            )}

            {tab === 'vouchers' && (
              <>
                <header className="pmTopBar">
                  <h2>My Voucher</h2>
                </header>
                <div className="tabsRow">
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
                  {[...demoVouchers, ...visibleVouchers].map((v) => (
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
            )}

            {tab === 'rewards' && (
              <>
                <header className="pmTopBar">
                  <h2>Rewards Catalog</h2>
                </header>
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

            {tab === 'profile' && (
              <>
                <header className="pmTopBar">
                  <h2>Profile</h2>
                </header>
                <Card>
                  <h3>{memberName}</h3>
                  <p className="caption">Membership tier: {memberTier}</p>
                </Card>
                <Card>
                  <SectionHeader title="Personal Info" />
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
                  <SectionHeader title="Activity" />
                  <div className="profileActions">
                    <button type="button" className="rowAction" onClick={() => setTab('vouchers')}>My Vouchers</button>
                    <button type="button" className="rowAction" onClick={() => setTab('rewards')}>Rewards History</button>
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
            <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')} aria-label="Overview">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 22v-7h6v7"/></svg>
              <span>Overview</span>
            </button>
            <button type="button" className={tab === 'vouchers' ? 'active' : ''} onClick={() => setTab('vouchers')} aria-label="Vouchers">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h18v13H3z"/><path d="M12 8v13"/><path d="M7 12h.01M17 12h.01"/></svg>
              <span>Vouchers</span>
            </button>
            <button type="button" className="center" onClick={openShopWebsite} aria-label="Shop">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2h12l1.5 4H4.5z"/><path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 11h6"/></svg>
              <span>Shop</span>
            </button>
            <button type="button" className={tab === 'rewards' ? 'active' : ''} onClick={() => setTab('rewards')} aria-label="Rewards">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3"/><path d="M8 14h8l-1 8-3-2-3 2z"/></svg>
              <span>Rewards</span>
            </button>
            <button type="button" className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')} aria-label="Profile">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
              <span>Profile</span>
            </button>
          </nav>

          {shareOpen && (
            <div className="shareOverlay" role="dialog" aria-modal="true">
              <div className="shareSheet">
                <SectionHeader title="Invite Friends" />
                <p className="caption">Invite your friends to join Moja and enjoy bakery rewards together.</p>
                <Card className="shareCodeCard">
                  <p className="caption">Referral Code</p>
                  <h3>JAX123</h3>
                </Card>
                {phoneQrUrl ? (
                  <div className="shareQr">
                    <img src={phoneQrUrl} alt={`QR for ${profile.phoneE164}`} />
                    <code>{profile.phoneE164}</code>
                  </div>
                ) : null}
                <div className="shareActions">
                  <button type="button" onClick={handleShare}>Copy Link</button>
                  <button type="button" className="ghost" onClick={handleShare}>Share WhatsApp</button>
                  <button type="button" className="ghost" onClick={handleShare}>Share Instagram</button>
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
