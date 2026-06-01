import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import './App.css';
import { toDataURL } from 'qrcode';
import {
  clearToken,
  consumeShopCartHandoff,
  fetchHomeAdSlides,
  fetchMe,
  fetchMeRewards,
  fetchPaymentIntentStatus,
  fetchPopularProducts,
  getToken,
  loginWithPin,
  lookupLogin,
  requestOtp,
  resolveApiAssetUrl,
  setInitialPin,
  setToken,
  updateMe,
  verifyOtp,
  type HomeAdSlide,
  type MemberProfile,
  type MemberRewardsPayload,
  type PopularProduct,
} from './api';
import { OtpBoxes } from './components/OtpBoxes';
import { OrdersTab } from './orders/OrdersTab';
import {
  clearPendingPayment,
  readPendingPayment,
} from './payments/pendingPayment';
import { ShopFlow } from './shop/ShopFlow';
import { useShopStore } from './shop/store/useShopStore';

const PENDING_REFERRAL_KEY = 'moja_pending_referral';
const PENDING_CART_HANDOFF_KEY = 'moja_pending_cart_handoff';
const PENDING_SHOP_SCREEN_KEY = 'moja_pending_shop_screen';

type Step = 'phone' | 'pin' | 'email' | 'code' | 'setPin' | 'member';
type OtpFlowPurpose = 'register' | 'recovery';
type MemberTab = 'home' | 'perks' | 'shop' | 'orders' | 'account';
type PerksSub = 'vouchers' | 'rewards';
type VoucherTab = 'ACTIVE' | 'USED' | 'EXPIRED';
type RewardFilter = 'all' | 'food' | 'drinks';
type PaymentResult =
  | { status: 'success'; orderNumber: string | null }
  | { status: 'failed' };

type ShopScreen = 'browse' | 'product' | 'cart' | 'checkout' | 'paymentDemo';

function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`pmCard ${className}`.trim()}>{children}</section>;
}

function AuthBrand() {
  return (
    <div className="authBrand" aria-hidden>
      <img src="/logo.png" alt="" className="authBrandLogo" />
      <span className="authBrandWordmark">Moja Maison</span>
    </div>
  );
}

function AuthStepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="authStepDots" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`authStepDot${i + 1 === step ? ' active' : ''}${i + 1 < step ? ' done' : ''}`}
        />
      ))}
    </div>
  );
}

function AuthBackLink({
  label = 'Back',
  onClick,
  disabled,
}: {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="authBackLink" onClick={onClick} disabled={disabled}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

type AuthHeroIcon = 'phone' | 'lock' | 'chat' | 'shield';

function AuthHero({ icon }: { icon: AuthHeroIcon }) {
  return (
    <div className={`authHero authHero--${icon}`} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icon === 'phone' && (
          <>
            <rect x="6" y="2.5" width="12" height="19" rx="3" />
            <path d="M11 18.5h2" />
          </>
        )}
        {icon === 'lock' && (
          <>
            <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="15.25" r="1.15" fill="currentColor" stroke="none" />
          </>
        )}
        {icon === 'chat' && (
          <>
            <path d="M4 5.5h16v10.25a2 2 0 0 1-2 2H9.5L5 22v-4.25H6a2 2 0 0 1-2-2z" />
            <path d="M8.5 10.5h7M8.5 13.5h4" />
          </>
        )}
        {icon === 'shield' && (
          <>
            <path d="M12 3.25 4.5 6v6.5c0 4.25 3 7 7.5 8.25 4.5-1.25 7.5-4 7.5-8.25V6z" />
            <path d="M9.25 12.25 11 14l3.5-3.5" />
          </>
        )}
      </svg>
    </div>
  );
}

const DEFAULT_AD_SLIDES: HomeAdSlide[] = [
  {
    id: 'ad-default-1',
    title: 'Double Points',
    body: 'Coffee + Pastry before 11 AM',
    backgroundCss: 'linear-gradient(135deg, #fef3c7, #fde68a)',
    sortOrder: 10,
    isActive: true,
  },
  {
    id: 'ad-default-2',
    title: 'Birthday Treat',
    body: 'Free cake slice on your big day',
    backgroundCss: 'linear-gradient(135deg, #ffe4e6, #fecaca)',
    sortOrder: 20,
    isActive: true,
  },
  {
    id: 'ad-default-3',
    title: 'Refer & Earn',
    body: '500 pts per friend who joins',
    backgroundCss: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
    sortOrder: 30,
    isActive: true,
  },
];

function AdCarousel({ slides }: { slides: HomeAdSlide[] }) {
  const list = slides.length > 0 ? slides : DEFAULT_AD_SLIDES;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (list.length <= 1) return;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % list.length);
    }, 5000);
    return () => window.clearInterval(t);
  }, [list.length]);

  useEffect(() => {
    if (idx >= list.length) setIdx(0);
  }, [idx, list.length]);

  const current = list[Math.min(idx, list.length - 1)];
  if (!current) return null;

  const resolvedImage = resolveApiAssetUrl(current.imageUrl ?? '');
  const style: CSSProperties = resolvedImage
    ? {
        backgroundImage: `url("${resolvedImage}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: current.backgroundCss };
  const hasImage = Boolean(resolvedImage);

  return (
    <section
      className={`pmCard adCarousel${hasImage ? ' adCarouselHasImage' : ''}`}
      aria-label="Promotions"
      style={style}
    >
      <div className="adCarouselInner">
        <div className="adCarouselTitle">{current.title}</div>
        {current.body ? <div className="adCarouselBody">{current.body}</div> : null}
      </div>
      {list.length > 1 ? (
        <div className="adCarouselDots" role="tablist">
          {list.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={i === idx ? 'adCarouselDot active' : 'adCarouselDot'}
              onClick={() => setIdx(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-selected={i === idx}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
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
  const [email, setEmail] = useState('');
  const [maskedEmailHint, setMaskedEmailHint] = useState<string | null>(null);
  const [loginPin, setLoginPin] = useState('');
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const newPinRef = useRef(newPin);
  newPinRef.current = newPin;
  const [setPinPhase, setSetPinPhase] = useState<'first' | 'confirm'>('first');
  const [setupToken, setSetupToken] = useState('');
  const [otpFlowPurpose, setOtpFlowPurpose] = useState<OtpFlowPurpose>('register');
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpNow, setOtpNow] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [rewardsData, setRewardsData] = useState<MemberRewardsPayload | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [phoneQrUrl, setPhoneQrUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [voucherTab, setVoucherTab] = useState<VoucherTab>('ACTIVE');
  const [rewardQuery, setRewardQuery] = useState('');
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>('all');
  const [perksSub, setPerksSub] = useState<PerksSub>('vouchers');
  const [adSlides, setAdSlides] = useState<HomeAdSlide[]>([]);
  const [popularItems, setPopularItems] = useState<PopularProduct[]>([]);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [shopInitialScreen, setShopInitialScreen] = useState<ShopScreen | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHomeAdSlides()
      .then((list) => {
        if (!cancelled && list.length > 0) setAdSlides(list);
      })
      .catch(() => {});
    fetchPopularProducts()
      .then((list) => {
        if (!cancelled) setPopularItems(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
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
    if (step !== 'code' || !otpExpiresAt) return;
    setOtpNow(Date.now());
    const id = window.setInterval(() => setOtpNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step, otpExpiresAt]);

  const otpSecondsLeft = useMemo(() => {
    if (!otpExpiresAt) return null;
    const ms = new Date(otpExpiresAt).getTime() - otpNow;
    return Math.max(0, Math.floor(ms / 1000));
  }, [otpExpiresAt, otpNow]);

  const otpCountdownLabel = useMemo(() => {
    if (otpSecondsLeft == null) return null;
    const m = Math.floor(otpSecondsLeft / 60);
    const s = otpSecondsLeft % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [otpSecondsLeft]);

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
      const handoff = u.searchParams.get('cartHandoff')?.trim();
      const shopScreen = u.searchParams.get('shopScreen')?.trim();
      if (handoff) sessionStorage.setItem(PENDING_CART_HANDOFF_KEY, handoff);
      if (shopScreen === 'cart' || shopScreen === 'checkout') {
        sessionStorage.setItem(PENDING_SHOP_SCREEN_KEY, shopScreen);
      }
      if (handoff) {
        setTab('shop');
        setHint('Sign in to complete payment for your shop cart.');
      }
      if (handoff || shopScreen) {
        u.searchParams.delete('cartHandoff');
        u.searchParams.delete('shopScreen');
        const qs = u.searchParams.toString();
        window.history.replaceState({}, '', `${u.pathname}${qs ? `?${qs}` : ''}`);
      }
    } catch {
      /* ignore invalid URL */
    }
  }, []);

  useEffect(() => {
    if (step !== 'member') return;
    const token = sessionStorage.getItem(PENDING_CART_HANDOFF_KEY);
    if (!token) return;

    sessionStorage.removeItem(PENDING_CART_HANDOFF_KEY);
    const pendingScreen = sessionStorage.getItem(PENDING_SHOP_SCREEN_KEY);
    sessionStorage.removeItem(PENDING_SHOP_SCREEN_KEY);

    void consumeShopCartHandoff(token)
      .then(({ lines, fulfillment }) => {
        if (lines.length === 0) {
          throw new Error('Cart handoff contained no items');
        }
        const store = useShopStore.getState();
        store.importExternalCart(
          lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            imageUrl: l.imageUrl ?? '',
            unitPriceCents: l.unitPriceCents,
            qty: l.qty,
            variantLabel: l.variantLabel ?? undefined,
          })),
        );
        if (fulfillment?.method === 'pickup') {
          store.setFulfillmentMethod('pickup');
          if (fulfillment.preferredTime) {
            store.setPickupTime(fulfillment.preferredTime);
          }
        }
        setTab('shop');
        setShopInitialScreen(
          pendingScreen === 'checkout' ? 'checkout' : 'cart',
        );
        setHint('Your cart from Moja Maison shop is ready. Review items and pay below.');
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : 'Could not import shop cart',
        );
      });
  }, [step]);

  useEffect(() => {
    if (step !== 'member') return;
    try {
      const u = new URL(window.location.href);
      const shopPay = u.searchParams.get('shopPayment');
      const orderNumber = u.searchParams.get('orderNumber');
      const t = u.searchParams.get('tab');
      if (t === 'account' || t === 'home' || t === 'perks' || t === 'shop' || t === 'orders') {
        setTab(t);
      }
      if (shopPay === 'success') {
        clearPendingPayment();
        setPaymentResult({ status: 'success', orderNumber });
        void loadMemberData();
      } else if (shopPay === 'failed') {
        clearPendingPayment();
        setPaymentResult({ status: 'failed' });
      }
      if (shopPay || t || orderNumber) {
        u.searchParams.delete('shopPayment');
        u.searchParams.delete('orderNumber');
        u.searchParams.delete('tab');
        const qs = u.searchParams.toString();
        window.history.replaceState({}, '', `${u.pathname}${qs ? `?${qs}` : ''}`);
      }
    } catch {
      /* ignore */
    }
  }, [step, loadMemberData]);

  // Poll the server for a pending payment whenever the app is open and
  // visible. E-wallets like Touch 'n Go often don't redirect back to the
  // merchant in live mode, so we can't rely solely on the success URL.
  useEffect(() => {
    if (step !== 'member') return;
    if (!getToken()) return;

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
      const pending = readPendingPayment();
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
          clearPendingPayment();
          const orderNumber =
            res.orderNumber != null
              ? String(res.orderNumber)
              : pending.orderNumber;
          setPaymentResult({ status: 'success', orderNumber });
          void loadMemberData();
          stop();
        } else if (res.status === 'FAILED') {
          clearPendingPayment();
          setPaymentResult({ status: 'failed' });
          stop();
        }
      } catch {
        /* transient — keep polling */
      }
    };

    const start = () => {
      if (intervalId !== null) return;
      if (!readPendingPayment()) return;
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
  }, [step, loadMemberData]);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const ref = u.searchParams.get('ref')?.trim();
      if (ref) sessionStorage.setItem(PENDING_REFERRAL_KEY, ref);
    } catch {
      /* ignore invalid URL */
    }
  }, []);

  const applyOtpResponseHint = useCallback(
    (res: { channel?: string; _devCode?: string }) => {
      if (res.channel === 'whatsapp') {
        setHint('Check WhatsApp for your verification code.');
      } else if (res.channel === 'email') {
        setHint('Check your email inbox for the verification code.');
      } else if (res.channel === 'mock' && res._devCode) {
        setHint(`Test mode (mock): your OTP is ${res._devCode}`);
      } else if (res._devCode) {
        setHint(`Dev mode: your code is ${res._devCode}`);
      } else {
        setHint('If you did not receive a code, contact support.');
      }
    },
    [],
  );

  const handlePhoneContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);
    setLoading(true);
    try {
      const { registered, hasPin, maskedEmail } = await lookupLogin(phone);
      if (registered && hasPin) {
        setStep('pin');
        setLoginPin('');
        return;
      }
      const purpose: OtpFlowPurpose =
        registered && !hasPin ? 'recovery' : 'register';
      setOtpFlowPurpose(purpose);
      setMaskedEmailHint(maskedEmail);
      setEmail('');
      setOtpExpiresAt(null);
      setStep('email');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);
    setLoading(true);
    try {
      const res = await requestOtp(phone, otpFlowPurpose, email);
      setOtpExpiresAt(res.expiresAt ?? null);
      setStep('code');
      setCode('');
      applyOtpResponseHint(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPin = async () => {
    setError(null);
    setHint(null);
    setOtpFlowPurpose('recovery');
    setMaskedEmailHint(null);
    setEmail('');
    setOtpExpiresAt(null);
    setStep('email');
    setCode('');
  };

  const handleResendOtp = useCallback(async () => {
    if (loading) return;
    setError(null);
    setHint(null);
    setLoading(true);
    try {
      const res = await requestOtp(phone, otpFlowPurpose, email);
      setOtpExpiresAt(res.expiresAt ?? null);
      setCode('');
      applyOtpResponseHint(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code');
    } finally {
      setLoading(false);
    }
  }, [applyOtpResponseHint, email, loading, otpFlowPurpose, phone]);

  const submitPinLoginWith = useCallback(
    async (pin: string) => {
      setError(null);
      setLoading(true);
      try {
        const { accessToken } = await loginWithPin(phone, pin);
        setToken(accessToken);
        setLoginPin('');
        await loadMemberData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
        setLoginPin('');
      } finally {
        setLoading(false);
      }
    },
    [phone, loadMemberData],
  );

  const onLoginPinChange = useCallback(
    (next: string) => {
      setLoginPin(next);
      if (next.length === 6) {
        void submitPinLoginWith(next);
      }
    },
    [submitPinLoginWith],
  );

  const handlePinSignInClick = useCallback(() => {
    if (loginPin.length !== 6) return;
    void submitPinLoginWith(loginPin);
  }, [loginPin, submitPinLoginWith]);

  const submitVerify = useCallback(
    async (codeValue: string) => {
      setError(null);
      setLoading(true);
      try {
        const pendingRef = sessionStorage.getItem(PENDING_REFERRAL_KEY)?.trim();
        const verified = await verifyOtp(phone, codeValue, {
          referralCode:
            otpFlowPurpose === 'register' ? pendingRef || undefined : undefined,
          email,
        });
        if (pendingRef && verified.purpose === 'register') {
          sessionStorage.removeItem(PENDING_REFERRAL_KEY);
        }
        setSetupToken(verified.setupToken);
        setOtpFlowPurpose(verified.purpose);
        setCode('');
        setNewPin('');
        setNewPinConfirm('');
        setSetPinPhase('first');
        setStep('setPin');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setLoading(false);
      }
    },
    [email, otpFlowPurpose, phone],
  );

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitVerify(code);
  };

  const onCodeChange = useCallback(
    (next: string) => {
      setCode(next);
      if (next.length === 6 && !loading) {
        void submitVerify(next);
      }
    },
    [loading, submitVerify],
  );

  const submitSetPinPair = useCallback(
    async (a: string, b: string) => {
      setError(null);
      if (a !== b) {
        setError('PIN entries do not match.');
        setNewPinConfirm('');
        return;
      }
      if (!/^\d{6}$/.test(a)) {
        setError('PIN must be exactly 6 digits.');
        return;
      }
      setLoading(true);
      try {
        const { accessToken } = await setInitialPin(setupToken, a, b);
        setToken(accessToken);
        setNewPin('');
        setNewPinConfirm('');
        setSetupToken('');
        setSetPinPhase('first');
        await loadMemberData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save PIN');
      } finally {
        setLoading(false);
      }
    },
    [setupToken, loadMemberData],
  );

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
      setEditingProfile(false);
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const [memberIdCopied, setMemberIdCopied] = useState(false);
  const handleCopyMemberId = useCallback(async () => {
    const id = profile?.phoneE164?.trim();
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setMemberIdCopied(true);
      window.setTimeout(() => setMemberIdCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [profile?.phoneE164]);

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
    setEmail('');
    setMaskedEmailHint(null);
    setLoginPin('');
    setCode('');
    setNewPin('');
    setNewPinConfirm('');
    setSetPinPhase('first');
    setSetupToken('');
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

  // Open the editor automatically for first-time / incomplete profiles, but
  // keep saved profiles read-only until the member taps Edit.
  useEffect(() => {
    if (!profile) return;
    const complete =
      Boolean(profile.displayName?.trim()) &&
      Boolean(profile.email?.trim()) &&
      Boolean(profile.birthday?.trim());
    setEditingProfile(!complete);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-evaluate on identity change
  }, [profile?.id]);

  const birthdayDisplay = useMemo(() => {
    const raw = profile?.birthday?.trim();
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [profile?.birthday]);

  const memberInitial = useMemo(
    () => (memberName.trim()[0] ?? 'M').toUpperCase(),
    [memberName],
  );

  const walletCreditsLabel = useMemo(() => {
    const cents = profile?.storedWallet?.currentWalletBalance ?? 0;
    return `RM ${(cents / 100).toFixed(2)}`;
  }, [profile?.storedWallet?.currentWalletBalance]);

  const referralCount = profile?.referralCount ?? 0;

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

  const memberSince = useMemo(() => {
    const raw = profile?.createdAt;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }, [profile?.createdAt]);

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

  const activeVouchersCount = useMemo(
    () =>
      voucherItems.filter((v) => {
        const status = String(v.status || '').toUpperCase();
        return status === 'ISSUED' || status === 'ACTIVE';
      }).length,
    [voucherItems],
  );

  const featuredRewardsCount = normalizedRewards.length;

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

  const authMode =
    step === 'phone' ||
    step === 'pin' ||
    step === 'email' ||
    step === 'code' ||
    step === 'setPin';

  return (
    <div className={`app${authMode ? ' app--auth' : ''}`}>
      {authMode && (
        <main className="authMain">
          <div className="authGlass">
            <AuthBrand />

            {step === 'phone' && (
              <section className="authCard authCardPin">
                <div className="authLayout">
                  <AuthHero icon="phone" />
                  <h1 className="authTitle">Welcome to Moja</h1>
                  <p className="authSub">
                    Sign in or create an account to unlock rewards, vouchers and your Moja Maison perks.
                  </p>
                  <form onSubmit={handlePhoneContinue} className="authForm">
                    {sessionStorage.getItem(PENDING_REFERRAL_KEY) ? (
                      <p className="authInvite">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        </svg>
                        <span>
                          You opened an invite link — your friend earns referral credit after you verify and set your PIN.
                        </span>
                      </p>
                    ) : null}
                    <label htmlFor="phone" className="authLabel">Phone number</label>
                    <div className={`authPhoneField${loading ? ' disabled' : ''}`}>
                      <span className="authPhonePrefix" aria-hidden>📱</span>
                      <input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="6013 345 1345"
                        value={phone}
                        onChange={(ev) => setPhone(ev.target.value)}
                        required
                        disabled={loading}
                        className="authPhoneInput"
                      />
                    </div>
                    {error && <p className="err authErr">{error}</p>}
                    <button type="submit" className="authPrimary" disabled={loading}>
                      {loading ? 'Checking…' : (
                        <>
                          <span>Continue</span>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </>
                      )}
                    </button>
                    <p className="authTrust">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <rect x="4" y="10" width="16" height="11" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                      New sign-ins use a one-time code sent to your email.
                    </p>
                  </form>
                </div>
              </section>
            )}

            {step === 'pin' && (
              <section className="authCard authCardPin">
                <div className="authLayout">
                  <AuthBackLink
                    onClick={() => {
                      setStep('phone');
                      setLoginPin('');
                      setError(null);
                    }}
                    disabled={loading}
                  />
                  <AuthHero icon="lock" />
                  <h1 className="authTitle">Enter your PIN</h1>
                  <p className="authSub">
                    6-digit login PIN
                    {phone.trim() ? (
                      <>
                        {' '}for <strong className="authSubStrong">{phone.trim()}</strong>
                      </>
                    ) : null}
                  </p>
                  <OtpBoxes
                    id="loginPinInput"
                    value={loginPin}
                    onChange={onLoginPinChange}
                    autoFocus
                    disabled={loading}
                    ariaLabel="6-digit PIN"
                  />
                  {error && <p className="err authErr">{error}</p>}
                  <button
                    type="button"
                    className="authPrimary"
                    onClick={handlePinSignInClick}
                    disabled={loading || loginPin.length !== 6}
                  >
                    {loading ? 'Signing in…' : 'Sign in'}
                  </button>
                  <button
                    type="button"
                    className="authSecondary"
                    onClick={() => void handleForgotPin()}
                    disabled={loading}
                  >
                    Forgot PIN? Use email OTP
                  </button>
                  <p className="authHelper">
                    Use your registered email to verify and set a new PIN.
                  </p>
                </div>
              </section>
            )}

            {step === 'email' && (
              <section className="authCard authCardPin">
                <div className="authLayout">
                  <AuthBackLink
                    onClick={() => {
                      setStep(otpFlowPurpose === 'recovery' ? 'pin' : 'phone');
                      setError(null);
                      setHint(null);
                    }}
                    disabled={loading}
                  />
                  <AuthHero icon="chat" />
                  <h1 className="authTitle">Verify with email</h1>
                  <p className="authSub">
                    Enter the email for{' '}
                    <strong className="authSubStrong">{phone.trim()}</strong> to receive a 6-digit verification code.
                  </p>
                  {maskedEmailHint ? (
                    <p className="authHint">Registered email hint: {maskedEmailHint}</p>
                  ) : null}
                  <form onSubmit={handleEmailContinue} className="authForm">
                    <label htmlFor="email-otp" className="authLabel">Email address</label>
                    <div className={`authPhoneField${loading ? ' disabled' : ''}`}>
                      <span className="authPhonePrefix" aria-hidden>✉️</span>
                      <input
                        id="email-otp"
                        type="email"
                        autoComplete="email"
                        placeholder="you@email.com"
                        value={email}
                        onChange={(ev) => setEmail(ev.target.value)}
                        required
                        disabled={loading}
                        className="authPhoneInput"
                      />
                    </div>
                    {error && <p className="err authErr">{error}</p>}
                    <button type="submit" className="authPrimary" disabled={loading}>
                      {loading ? 'Sending code…' : 'Send code'}
                    </button>
                  </form>
                </div>
              </section>
            )}

            {step === 'code' && (
              <section className="authCard authCardPin">
                <div className="authLayout">
                  <AuthBackLink
                    onClick={() => {
                      setStep('email');
                      setCode('');
                      setError(null);
                    }}
                    disabled={loading}
                  />
                  <AuthStepDots step={1} total={otpFlowPurpose === 'recovery' ? 2 : 2} />
                  <AuthHero icon="chat" />
                  <h1 className="authTitle">Enter verification code</h1>
                  <p className="authSub">
                    We sent a 6-digit code to{' '}
                    <strong className="authSubStrong">{email.trim() || 'your email'}</strong>.
                  </p>
                  {hint && <p className="authHint">{hint}</p>}
                  <form onSubmit={handleVerify} className="authForm">
                    <OtpBoxes
                      id="otpCodeInput"
                      value={code}
                      onChange={onCodeChange}
                      autoFocus
                      disabled={loading}
                      ariaLabel="OTP code"
                    />
                    <div className="authOtpMeta">
                      {otpCountdownLabel != null && (
                        <span
                          className={`otpTimer${otpSecondsLeft === 0 ? ' otpTimerExpired' : ''}`}
                          aria-live="polite"
                        >
                          {otpSecondsLeft === 0 ? 'Code expired' : `Code expires in ${otpCountdownLabel}`}
                        </span>
                      )}
                      <span className="otpResend">
                        Didn't receive it?
                        <button
                          type="button"
                          className="otpResendBtn"
                          onClick={() => void handleResendOtp()}
                          disabled={loading || (otpSecondsLeft != null && otpSecondsLeft > 0)}
                        >
                          Resend code
                        </button>
                      </span>
                    </div>
                    {error && <p className="err authErr">{error}</p>}
                    <button
                      type="submit"
                      className="authPrimary"
                      disabled={loading || code.length !== 6}
                    >
                      {loading ? 'Verifying…' : 'Verify & continue'}
                    </button>
                  </form>
                </div>
              </section>
            )}

            {step === 'setPin' && (
              <section className="authCard authCardPin">
                <div className="authLayout">
                  <AuthBackLink
                    label={setPinPhase === 'confirm' ? 'Edit PIN' : 'Back'}
                    onClick={() => {
                      if (setPinPhase === 'confirm') {
                        setSetPinPhase('first');
                        setNewPinConfirm('');
                        setError(null);
                      } else {
                        setStep('code');
                        setNewPin('');
                        setNewPinConfirm('');
                        setSetPinPhase('first');
                        setError(null);
                      }
                    }}
                    disabled={loading}
                  />
                  <AuthStepDots step={2} total={2} />
                  <AuthHero icon="shield" />
                  <h1 className="authTitle">
                    {setPinPhase === 'first'
                      ? otpFlowPurpose === 'recovery'
                        ? 'Create a new PIN'
                        : 'Create your PIN'
                      : 'Confirm your PIN'}
                  </h1>
                  <p className="authSub">
                    {setPinPhase === 'first'
                      ? 'Choose 6 digits. You will use this for quick sign-in instead of requesting a code each time.'
                      : 'Re-enter the same 6 digits to confirm.'}
                  </p>
                  <div className="authPhaseDots" aria-hidden>
                    <span className={`authPhaseDot${setPinPhase === 'first' ? ' active' : ' done'}`} />
                    <span className={`authPhaseDot${setPinPhase === 'confirm' ? ' active' : ''}`} />
                  </div>
                  <OtpBoxes
                    key={setPinPhase}
                    id="setPinInput"
                    name={setPinPhase === 'first' ? 'newPin' : 'newPinConfirm'}
                    value={setPinPhase === 'first' ? newPin : newPinConfirm}
                    onChange={(next) => {
                      if (setPinPhase === 'first') {
                        setNewPin(next);
                        if (next.length === 6) setSetPinPhase('confirm');
                      } else {
                        setNewPinConfirm(next);
                        if (next.length === 6) {
                          void submitSetPinPair(newPinRef.current, next);
                        }
                      }
                    }}
                    autoFocus
                    disabled={loading}
                    ariaLabel="6-digit PIN"
                  />
                  {error && <p className="err authErr">{error}</p>}
                  <button
                    type="button"
                    className="authPrimary"
                    onClick={() => {
                      if (setPinPhase === 'first') {
                        if (newPin.length === 6) setSetPinPhase('confirm');
                      } else {
                        if (newPinConfirm.length === 6) {
                          void submitSetPinPair(newPinRef.current, newPinConfirm);
                        }
                      }
                    }}
                    disabled={
                      loading ||
                      (setPinPhase === 'first' ? newPin.length !== 6 : newPinConfirm.length !== 6)
                    }
                  >
                    {loading
                      ? 'Saving…'
                      : setPinPhase === 'first'
                        ? 'Next'
                        : 'Confirm PIN'}
                  </button>
                  <p className="authHelper">
                    Tip: avoid obvious patterns like 123456 or your birth year.
                  </p>
                </div>
              </section>
            )}

            <p className="authLegal">
              By continuing you agree to our{' '}
              <a href="/terms" className="authLegalLink">Terms</a> and{' '}
              <a href="/privacy" className="authLegalLink">Privacy Policy</a>.
            </p>
          </div>
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

                <AdCarousel slides={adSlides} />

                <div className="homeSummaryRow">
                  <button
                    type="button"
                    className="pmCard homeSummaryCard"
                    onClick={() => {
                      setPerksSub('vouchers');
                      setTab('perks');
                    }}
                    aria-label={`My Voucher, ${activeVouchersCount} active vouchers`}
                  >
                    <span className="homeSummaryIcon homeSummaryIcon--voucher" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="7" width="18" height="13" rx="2" />
                        <path d="M3 11h18" />
                        <path d="M9 15l2 2 4-4" />
                      </svg>
                    </span>
                    <span className="homeSummaryText">
                      <span className="homeSummaryLabel">My Voucher</span>
                      <span className="homeSummaryValue">
                        {activeVouchersCount} {activeVouchersCount === 1 ? 'Voucher' : 'Vouchers'}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="pmCard homeSummaryCard"
                    onClick={() => {
                      setPerksSub('rewards');
                      setTab('perks');
                    }}
                    aria-label={`Rewards, ${featuredRewardsCount} available`}
                  >
                    <span className="homeSummaryIcon homeSummaryIcon--reward" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="8" width="18" height="13" rx="1" />
                        <path d="M12 8v13" />
                        <path d="M3 12h18" />
                        <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5z" />
                      </svg>
                    </span>
                    <span className="homeSummaryText">
                      <span className="homeSummaryLabel">Rewards</span>
                      <span className="homeSummaryValue">
                        {featuredRewardsCount} {featuredRewardsCount === 1 ? 'Reward' : 'Rewards'}
                      </span>
                    </span>
                  </button>
                </div>

                {popularItems.length > 0 && (
                  <section className="popularSection">
                    <div className="popularHeader">
                      <h3>Popular items</h3>
                      <button
                        type="button"
                        className="popularMore"
                        onClick={() => setTab('shop')}
                      >
                        Shop now
                      </button>
                    </div>
                    <ul className="popularList">
                      {popularItems.map((item) => {
                        const img = item.imageUrl || '';
                        const price = Number.isFinite(item.basePriceCents)
                          ? `RM ${(item.basePriceCents / 100).toFixed(2)}`
                          : '';
                        return (
                          <li key={item.id} className="popularItem">
                            <button
                              type="button"
                              className="popularCard"
                              onClick={() => setTab('shop')}
                            >
                              <span
                                className="popularThumb"
                                style={
                                  img
                                    ? { backgroundImage: `url(${img})` }
                                    : undefined
                                }
                                aria-hidden
                              />
                              <span className="popularMeta">
                                <span className="popularName">{item.name}</span>
                                {item.shortDescription ? (
                                  <span className="popularDesc">{item.shortDescription}</span>
                                ) : null}
                                {price ? <span className="popularPrice">{price}</span> : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </>
            )}

            {tab === 'perks' && (
              <>
                <header className="pmTopBar">
                  <h2>Rewards</h2>
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

            {tab === 'shop' && (
              <ShopFlow
                pointsBalance={pointsBalance}
                memberRewards={rewardsData}
                initialScreen={shopInitialScreen}
                onInitialScreenApplied={() => setShopInitialScreen(null)}
              />
            )}

            {tab === 'orders' && (
              <OrdersTab active={tab === 'orders'} onGoToShop={() => setTab('shop')} />
            )}

            {tab === 'account' && (
              <>
                <header className="pmTopBar">
                  <h2>Account</h2>
                </header>
                <Card className={`accountHeroCard accountHeroCard--${normalizedTierKey}`}>
                  <div className="accountHeroTop">
                    <span className="accountAvatar" aria-hidden>
                      {memberInitial}
                    </span>
                    <div className="accountHeroId">
                      <h3>{memberName}</h3>
                      {memberSince ? (
                        <p className="accountSince">Member since {memberSince}</p>
                      ) : null}
                    </div>
                    <span
                      className={`tierPill tierPill--${normalizedTierKey}`}
                      aria-label={`Member tier ${tierDisplayName}`}
                    >
                      {tierDisplayName}
                    </span>
                  </div>
                  <div className="accountPointsRow">
                    <span className="accountPointsValue">
                      {pointsBalance.toLocaleString()}
                    </span>
                    <span className="accountPointsUnit">pts</span>
                  </div>
                  <div className="progressWrap">
                    <div
                      className="progressBar"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="tierTrack" aria-hidden>
                    {(['silver', 'gold', 'platinum'] as const).map((t) => (
                      <span
                        key={t}
                        className={`tierTrackStop${normalizedTierKey === t ? ' active' : ''}`}
                      >
                        {t === 'silver'
                          ? 'Silver'
                          : t === 'gold'
                            ? 'Gold'
                            : 'Platinum'}
                      </span>
                    ))}
                  </div>
                  <p className="accountTierHint">
                    {pointsToNext > 0
                      ? `${pointsToNext.toLocaleString()} pts to your next reward`
                      : 'Reward unlocked — redeem under Rewards'}
                  </p>
                </Card>

                <div className="homeSummaryRow accountStatRow">
                  <button
                    type="button"
                    className="pmCard homeSummaryCard"
                    onClick={() => {
                      setPerksSub('vouchers');
                      setTab('perks');
                    }}
                    aria-label={`My vouchers, ${activeVouchersCount} active`}
                  >
                    <span className="homeSummaryIcon homeSummaryIcon--voucher" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="7" width="18" height="13" rx="2" />
                        <path d="M3 11h18" />
                        <path d="M9 15l2 2 4-4" />
                      </svg>
                    </span>
                    <span className="homeSummaryText">
                      <span className="homeSummaryLabel">My Vouchers</span>
                      <span className="homeSummaryValue">{activeVouchersCount}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="pmCard homeSummaryCard"
                    onClick={() => setTab('home')}
                    aria-label={`Credits ${walletCreditsLabel}`}
                  >
                    <span className="homeSummaryIcon homeSummaryIcon--credit" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="6" width="20" height="13" rx="2" />
                        <path d="M2 10h20" />
                        <path d="M6 15h4" />
                      </svg>
                    </span>
                    <span className="homeSummaryText">
                      <span className="homeSummaryLabel">Credits</span>
                      <span className="homeSummaryValue">{walletCreditsLabel}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="pmCard homeSummaryCard"
                    onClick={() => setShareOpen(true)}
                    aria-label={`My referrals, ${referralCount} joined`}
                  >
                    <span className="homeSummaryIcon homeSummaryIcon--referral" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="9" cy="8" r="3" />
                        <path d="M3 20a6 6 0 0 1 12 0" />
                        <path d="M16 11a3 3 0 1 0-1-5.8" />
                        <path d="M21 20a6 6 0 0 0-5-5.9" />
                      </svg>
                    </span>
                    <span className="homeSummaryText">
                      <span className="homeSummaryLabel">My Referrals</span>
                      <span className="homeSummaryValue">{referralCount}</span>
                    </span>
                  </button>
                </div>

                <Card>
                  <SectionHeader
                    title="Personal info"
                    actionLabel={editingProfile ? undefined : 'Edit'}
                    onAction={
                      editingProfile
                        ? undefined
                        : () => {
                            syncFormFromProfile(profile);
                            setProfileMsg(null);
                            setEditingProfile(true);
                          }
                    }
                  />
                  <button
                    type="button"
                    className="profileIdRow"
                    onClick={() => void handleCopyMemberId()}
                    aria-label={`Member ID ${profile.phoneE164}, ❐`}
                  >
                    <span className="profileIdLabel">Member ID · contact</span>
                    <span className="profileIdValue">{profile.phoneE164}</span>
                    <span className="profileIdCopy">
                      {memberIdCopied ? 'Copied ✓' : '❐'}
                    </span>
                  </button>
                  {editingProfile ? (
                    <>
                      {profilePersonalIncomplete ? (
                        <p className="profileIncompleteCue" role="status">
                          *Complete your details below
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
                        <div className="profileFormActions">
                          <button type="submit" className="rowAction primary" disabled={savingProfile}>
                            {savingProfile ? 'Saving…' : 'Save'}
                          </button>
                          {!profilePersonalIncomplete ? (
                            <button
                              type="button"
                              className="rowAction"
                              onClick={() => {
                                syncFormFromProfile(profile);
                                setProfileMsg(null);
                                setEditingProfile(false);
                              }}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </form>
                    </>
                  ) : (
                    <div className="profileInfoList">
                      <div className="profileInfoRow">
                        <span className="profileInfoLabel">Name</span>
                        <span className="profileInfoValue">{profile.displayName?.trim() || '—'}</span>
                      </div>
                      <div className="profileInfoRow">
                        <span className="profileInfoLabel">Email</span>
                        <span className="profileInfoValue">{profile.email?.trim() || '—'}</span>
                      </div>
                      <div className="profileInfoRow">
                        <span className="profileInfoLabel">Birthday</span>
                        <span className="profileInfoValue">{birthdayDisplay || '—'}</span>
                      </div>
                      {profileMsg ? <p className="hint">{profileMsg}</p> : null}
                    </div>
                  )}
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
                    Share your link with friends to enjoy referral rewards
                  </p>
                  <button type="button" className="rowAction primary" style={{ marginTop: 18 }} onClick={() => setShareOpen(true)}>
                    Share app &amp; invite
                  </button>
                  {(profile.favoriteProducts?.length ?? 0) > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <p className="caption" style={{ margin: '0 0 6px' }}>
                        Top picks (from your orders)
                      </p>
                      <div className="favChips">
                        {(profile.favoriteProducts ?? []).map((f) => (
                          <span key={f.productId} className="favChip">
                            {f.name}
                            <span className="favChipQty">×{f.totalQty}</span>
                          </span>
                        ))}
                      </div>
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
            <button type="button" className={tab === 'perks' ? 'active' : ''} onClick={() => setTab('perks')} aria-label="Rewards">
              <div className="tabIconSlot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13"/><path d="M3 12h18"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5z"/></svg>
              </div>
              <span className="tabLabel">Rewards</span>
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

          {paymentResult && (
            <div
              className="paymentResultOverlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="paymentResultTitle"
              onClick={(e) => {
                if (e.target === e.currentTarget) setPaymentResult(null);
              }}
            >
              <div
                className={`paymentResultSheet paymentResultSheet--${paymentResult.status}`}
              >
                {paymentResult.status === 'success' ? (
                  <>
                    <div
                      className="paymentResultIcon paymentResultIcon--success"
                      aria-hidden
                    >
                      <svg viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="30" fill="currentColor" opacity="0.12" />
                        <circle cx="32" cy="32" r="22" fill="currentColor" />
                        <path
                          d="M22 32.5l7 7 14-14"
                          stroke="#fff"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <h2 id="paymentResultTitle" className="paymentResultTitle">
                      Payment received
                    </h2>
                    <p className="paymentResultBody">
                      Thank you! We&apos;re confirming your order — it&apos;ll appear in{' '}
                      <strong>Orders</strong> in a moment.
                    </p>
                    {paymentResult.orderNumber ? (
                      <div className="paymentResultOrderNum">
                        Order #{paymentResult.orderNumber}
                      </div>
                    ) : null}
                    <div className="paymentResultActions">
                      <button
                        type="button"
                        className="paymentResultPrimary"
                        onClick={() => {
                          setPaymentResult(null);
                          setTab('orders');
                        }}
                      >
                        View order
                      </button>
                      <button
                        type="button"
                        className="paymentResultGhost"
                        onClick={() => {
                          setPaymentResult(null);
                          setTab('shop');
                        }}
                      >
                        Continue shopping
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className="paymentResultIcon paymentResultIcon--failed"
                      aria-hidden
                    >
                      <svg viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="30" fill="currentColor" opacity="0.12" />
                        <circle cx="32" cy="32" r="22" fill="currentColor" />
                        <path
                          d="M22 22l20 20M42 22L22 42"
                          stroke="#fff"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <h2 id="paymentResultTitle" className="paymentResultTitle">
                      Payment didn&apos;t go through
                    </h2>
                    <p className="paymentResultBody">
                      Your card or wallet wasn&apos;t charged. Head back to checkout and try again — pick another method if you like.
                    </p>
                    <div className="paymentResultActions">
                      <button
                        type="button"
                        className="paymentResultPrimary"
                        onClick={() => {
                          setPaymentResult(null);
                          setTab('shop');
                        }}
                      >
                        Try again
                      </button>
                      <button
                        type="button"
                        className="paymentResultGhost"
                        onClick={() => setPaymentResult(null)}
                      >
                        Close
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

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
