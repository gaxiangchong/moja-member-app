import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DELIVERY_CLASS_LABELS,
  SHOP_FILTER_LABELS,
  deliveryClassForProduct,
  type CartLine,
  type DeliveryClass,
  type FulfillmentMethod,
  type MockReward,
  type MockVoucher,
  type PickupBy,
  type Product,
  type ShopFilter,
} from './types';
import { cashbackFor, tierMultiplier, type Cashback } from './cashback';
import type { MemberRewardsPayload } from '../api';
import { formatRm } from './data/mockCatalog';
import { cartSubtotalCents, computeDiscountCents } from './lib/pricing';
import {
  fulfillmentSummaryLines,
  validateCheckout,
} from './lib/checkoutValidation';
import {
  checkoutCatalogRewards,
  checkoutIssuedVouchers,
  findIssuedVoucherByCode,
} from './lib/memberRewardsCheckout';
import { useOrderHistoryStore } from './store/useOrderHistoryStore';
import { lineDeliveryClass, useShopStore } from './store/useShopStore';
import { AddressPicker } from '../address/AddressPicker';
import {
  completeDemoShopOrder,
  createXenditCardTokenSession,
  createShopOrderCheckout,
  fetchDeliveryInfo,
  fetchPaymentsTestMode,
  shippingFeeFor,
  type DeliveryInfo,
  type EarlyOrderDiscountInfo,
  fetchEarlyOrderDiscount,
  type SavedAddress,
  fetchMyAddresses,
  fetchPickupSlots,
  fetchShopAvailability,
  fetchShopCatalogProducts,
  fetchLoyaltyEarn,
  type LoyaltyEarn,
  type PickupSlotDay,
  fetchXenditShopChannels,
  getXenditCardTokenSessionStatus,
  isShopProductSoldOut,
} from '../api';
import { HIDDEN_PAYMENT_CHANNELS } from '../payments/channels';
import {
  DELIVERY_CHARGE_NOTICE,
  courierPickupWhatsappMessage,
  whatsappUrl,
} from '../lib/whatsapp';
import { savePendingPayment } from '../payments/pendingPayment';
import { PICKUP_TIME_SLOTS } from './lib/pickupTimeSlots';
import { earlyOrderDiscountCents } from './lib/earlyOrderDiscount';

type Screen = 'browse' | 'product' | 'cart' | 'checkout' | 'addresses' | 'paymentDemo';
/**
 * Show tap-to-apply promo buttons in the checkout voucher box: the member's wallet
 * vouchers (e.g. "Point Redemption RM5 · PROMO-… · −RM 5.00") and the points-reward
 * buttons. Hidden for now so the box is just a text field: members copy their code
 * from Rewards → Vouchers and paste it in. Set to true to bring the buttons back.
 */
const SHOW_CHECKOUT_PROMO_BUTTONS = false;

type PaymentMethodMode = 'channel' | 'card_token' | 'credits';

type DemoCheckoutSnapshot = {
  orderId: string;
  orderNumber: number;
  totalCents: number;
  fulfillmentSummary: string[];
  linePayload: Array<{
    productId: string;
    name: string;
    imageUrl: string | null;
    unitPriceCents: number;
    qty: number;
    variantLabel: string | null;
  }>;
};

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Optional extras offered at checkout for cake orders. Their ids aren't catalog
// products, so they're left out of the ship-nationwide checks.
// `onePerCake`: free, and capped at the number of whole cakes in the cart.
const CHECKOUT_ADDONS = [
  { productId: 'addon-birthday-set', name: 'Birthday set', note: 'Candles & greeting card', priceCents: 0, onePerCake: true },
  { productId: 'addon-thermal-bag', name: 'Thermal bag', note: 'Keeps your cake cool on the way', priceCents: 500, onePerCake: false },
] as const;
type CheckoutAddon = (typeof CHECKOUT_ADDONS)[number];
const MAX_ADDON_QTY = 99;

function isAddonLine(l: { productId: string }): boolean {
  return CHECKOUT_ADDONS.some((a) => a.productId === l.productId);
}

// Channels intentionally hidden from the checkout UI even if returned by the
// backend's XENDIT_SHOP_CHANNEL_CODES list — e.g. removed by product without
// requiring an env redeploy.

const CHANNEL_LOGOS: Record<string, string> = {
  TOUCHNGO: '/images/payments/touchngo.png',
  TOUCHNGO_MY: '/images/payments/touchngo.png',
  FPX: '/images/payments/fpx.png',
  FPX_MY: '/images/payments/fpx.png',
};

function PaymentChannelIcon({ code, label }: { code: string; label: string }) {
  const src = CHANNEL_LOGOS[code];
  if (src) {
    return (
      <span
        style={{
          minWidth: 56,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          borderRadius: 8,
          padding: '2px 6px',
          border: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <img
          src={src}
          alt={label}
          style={{
            height: 22,
            maxWidth: 56,
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </span>
    );
  }
  const fallback = code === 'CARDS' || code === 'CREDIT_CARD' ? 'CARD' : 'PAY';
  return (
    <span
      style={{
        minWidth: 56,
        height: 28,
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        background: 'rgba(255,255,255,0.16)',
      }}
    >
      {fallback}
    </span>
  );
}

export function ShopFlow({
  pointsBalance,
  memberRewards,
  initialScreen,
  onInitialScreenApplied,
  initialQuery,
  onInitialQueryApplied,
  isAuthenticated,
  onRequireAuth,
  authResumeSignal,
  creditsBalanceCents = 0,
  onCreditsChanged,
  memberName,
  memberPhone,
}: {
  pointsBalance: number;
  memberRewards?: MemberRewardsPayload | null;
  initialScreen?: Screen | null;
  onInitialScreenApplied?: () => void;
  /** Pre-fills the catalog search box — set by the Home tab's search bar. */
  initialQuery?: string | null;
  onInitialQueryApplied?: () => void;
  /** Browsing and cart-building never require login — only reaching checkout does. */
  isAuthenticated: boolean;
  /** Opens the app's sign-in overlay; called instead of entering checkout when signed out. */
  onRequireAuth: () => void;
  /** Bumped by the app after a checkout-triggered sign-in succeeds, so we can resume straight into checkout. */
  authResumeSignal?: number;
  /** Wallet credits the member can pay with (sen). */
  creditsBalanceCents?: number;
  /** Called after credits were spent so the app can refresh the balance. */
  onCreditsChanged?: () => void;
  /** Pre-fill the delivery contact. */
  memberName?: string | null;
  memberPhone?: string | null;
}) {
  const [screen, setScreen] = useState<Screen>(initialScreen ?? 'browse');
  const [productId, setProductId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ShopFilter | 'all'>('all');
  const [query, setQuery] = useState('');
  const [checkoutErrors, setCheckoutErrors] = useState<string[] | null>(null);
  const checkoutErrorsRef = useRef<HTMLDivElement>(null);
  // Errors sit beside the Pay button; bring them on screen however they were raised.
  useEffect(() => {
    if (checkoutErrors?.length) {
      checkoutErrorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [checkoutErrors]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loyaltyEarn, setLoyaltyEarn] = useState<LoyaltyEarn | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchLoyaltyEarn().then((e) => {
      if (alive) setLoyaltyEarn(e);
    });
    return () => {
      alive = false;
    };
  }, []);
  // Signed-in members earn at their tier's rate; guests see the base rate.
  const earnMultiplier = loyaltyEarn
    ? tierMultiplier(loyaltyEarn, memberRewards?.wallet?.lifetimePoints)
    : 1;
  const cashbackOf = useCallback(
    (amountSen: number): Cashback | null =>
      loyaltyEarn ? cashbackFor(amountSen, loyaltyEarn, earnMultiplier) : null,
    [loyaltyEarn, earnMultiplier],
  );
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [channels, setChannels] = useState<
    Array<{ code: string; label: string }>
  >([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [selectedChannelCode, setSelectedChannelCode] = useState('');
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);
  const [earlyInfo, setEarlyInfo] = useState<EarlyOrderDiscountInfo | null>(null);
  // Only a test release says anything about the payment channel.
  const [testPayments, setTestPayments] = useState(false);
  const [paymentMethodMode, setPaymentMethodMode] =
    useState<PaymentMethodMode>('channel');
  const [cardPaymentTokenId, setCardPaymentTokenId] = useState('');
  const [cardSessionId, setCardSessionId] = useState<string | null>(null);
  const [cardSessionLoading, setCardSessionLoading] = useState(false);
  const [cardSessionError, setCardSessionError] = useState<string | null>(null);
  const [cardSubmitReady, setCardSubmitReady] = useState(false);
  const [cardSubmitBusy, setCardSubmitBusy] = useState(false);
  const [cardInitAttempted, setCardInitAttempted] = useState(false);
  const [demoCheckout, setDemoCheckout] = useState<DemoCheckoutSnapshot | null>(
    null,
  );
  const [demoCompleting, setDemoCompleting] = useState(false);
  const [voucherCodeInput, setVoucherCodeInput] = useState('');
  const [voucherCodeError, setVoucherCodeError] = useState<string | null>(null);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const xenditComponentsRef = useRef<{
    submit: () => void;
    addEventListener: (name: string, cb: () => void) => void;
    createChannelPickerComponent: () => HTMLElement;
  } | null>(null);
  const cardSessionIdRef = useRef<string | null>(null);
  // When the user clicks the single "Pay" button without a token yet, we
  // trigger tokenization and resolve this ref's promise from the Xendit
  // event handlers below. That lets one click do both tokenize + checkout.
  const pendingTokenizationRef = useRef<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
  } | null>(null);

  const cart = useShopStore((s) => s.cart);
  const selectedAddressId = useShopStore((s) => s.selectedAddressId);
  const setSelectedAddressId = useShopStore((s) => s.setSelectedAddressId);
  const addToCart = useShopStore((s) => s.addToCart);
  const setLineQty = useShopStore((s) => s.setLineQty);
  const removeLine = useShopStore((s) => s.removeLine);
  const fulfillmentMethod = useShopStore((s) => s.fulfillmentMethod);
  const setFulfillmentMethod = useShopStore((s) => s.setFulfillmentMethod);
  const delivery = useShopStore((s) => s.delivery);
  const setDelivery = useShopStore((s) => s.setDelivery);
  const pickupDate = useShopStore((s) => s.pickupDate);
  const setPickupDate = useShopStore((s) => s.setPickupDate);
  const pickupTime = useShopStore((s) => s.pickupTime);
  const setPickupTime = useShopStore((s) => s.setPickupTime);
  /**
   * Availability for the chosen pickup date. Only the stock-tracked products
   * actually in the cart are shown — the member does not need a stock report,
   * just a warning when what they picked is tight or gone for that day.
   */
  const [dateAvailability, setDateAvailability] = useState<
    {
      productId: string;
      name: string;
      sellableQty: number;
      shortfall: boolean;
    }[]
  >([]);
  const [pickupDay, setPickupDay] = useState<PickupSlotDay | null>(null);
  const appliedVoucher = useShopStore((s) => s.appliedVoucher);
  const appliedReward = useShopStore((s) => s.appliedReward);
  const applyVoucher = useShopStore((s) => s.applyVoucher);
  const applyReward = useShopStore((s) => s.applyReward);
  const getSubtotalCents = useShopStore((s) => s.getSubtotalCents);
  const getDiscountCents = useShopStore((s) => s.getDiscountCents);
  const getTotalCents = useShopStore((s) => s.getTotalCents);
  const getCartItemCount = useShopStore((s) => s.getCartItemCount);
  const resetAfterOrder = useShopStore((s) => s.resetAfterOrder);

  // One checkout for the whole cart. A line's class follows the catalog as it is now (the admin
  // can change a product's shipping setting), falling back to what was saved with the line.
  const classOfLine = useCallback(
    (l: CartLine): DeliveryClass => {
      const p = products.find((x) => x.id === l.productId);
      return p ? deliveryClassForProduct(p) : lineDeliveryClass(l);
    },
    [products],
  );
  const checkoutCart = cart;
  const productLines = cart.filter((l) => !isAddonLine(l));
  const cartGroups = useMemo(() => {
    const groups: { cls: DeliveryClass; lines: CartLine[] }[] = [];
    for (const cls of ['LOCAL_ONLY', 'NATIONWIDE'] as DeliveryClass[]) {
      const lines = cart.filter((l) => classOfLine(l) === cls);
      if (lines.length > 0) groups.push({ cls, lines });
    }
    return groups;
  }, [cart, classOfLine]);
  // Parcels carry nationwide products only, never when a cake is being checked out.
  const canShip =
    productLines.length > 0 &&
    productLines.every((l) => classOfLine(l) === 'NATIONWIDE');
  // Items that can't be posted. While any is in the cart, nothing in it can ship.
  const unshippableNames = [
    ...new Set(productLines.filter((l) => classOfLine(l) === 'LOCAL_ONLY').map((l) => l.name)),
  ];
  const hasCake = unshippableNames.length > 0;
  const [pickupBy, setPickupBy] = useState<PickupBy>('self');

  const wholeCakeCount = productLines
    .filter((l) => products.find((p) => p.id === l.productId)?.category === 'whole_cakes')
    .reduce((n, l) => n + l.qty, 0);
  const addonLimit = (addon: CheckoutAddon) =>
    !hasCake ? 0 : addon.onePerCake ? wholeCakeCount : MAX_ADDON_QTY;

  // Extras only go with cakes, and birthday sets never outnumber the cakes:
  // trim them whenever the cart shrinks.
  useEffect(() => {
    for (const addon of CHECKOUT_ADDONS) {
      const line = cart.find((l) => l.productId === addon.productId);
      if (!line) continue;
      const limit = addonLimit(addon);
      if (line.qty > limit) setLineQty(line.lineId, limit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addonLimit derives from the deps listed
  }, [cart, hasCake, wholeCakeCount, setLineQty]);

  // A date saved from an earlier visit may have passed; never offer one before today.
  const earliestPickupDate = pickupDay?.today ?? todayIsoDate();
  useEffect(() => {
    if (!pickupDate || pickupDate < earliestPickupDate) {
      setPickupDate(earliestPickupDate);
    }
  }, [pickupDate, earliestPickupDate, setPickupDate]);

  const toggleAddon = (addon: CheckoutAddon) => {
    const line = cart.find((l) => l.productId === addon.productId);
    if (line) {
      removeLine(line.lineId);
      return;
    }
    addToCart({
      productId: addon.productId,
      name: addon.name,
      imageUrl: '',
      unitPriceCents: addon.priceCents,
      qty: addon.onePerCake ? addonLimit(addon) : 1,
      deliveryClass: 'LOCAL_ONLY',
    });
  };
  const shippingOffered = canShip && deliveryInfo?.shippingEnabled !== false;
  const itemCount = getCartItemCount();
  const subtotal = getSubtotalCents();
  const discount = getDiscountCents();
  const isShipping = fulfillmentMethod === 'shipping';
  // A pickup goes out on a chosen day and time slot; a parcel is just posted.
  const isScheduled = fulfillmentMethod === 'pickup';
  const byCourier = isScheduled && pickupBy === 'courier';
  // Whole cakes collected far enough ahead: the same rule the server applies.
  const earlyDiscount = isScheduled
    ? earlyOrderDiscountCents({
        settings: earlyInfo,
        lines: checkoutCart.map((l) => ({
          amountCents: l.unitPriceCents * l.qty,
          isWholeCake: products.find((p) => p.id === l.productId)?.category === 'whole_cakes',
        })),
        scheduledDate: pickupDate,
        today: pickupDay?.today ?? todayIsoDate(),
        otherDiscountCents: discount,
      })
    : 0;
  const goodsTotal = getTotalCents() - earlyDiscount;
  const shippingFee =
    isShipping && deliveryInfo ? shippingFeeFor(deliveryInfo, goodsTotal) : 0;
  const total = goodsTotal + shippingFee;
  // How far the goods are from the free-shipping line (null = no such line, or already past it).
  const freeShippingToGo =
    deliveryInfo && deliveryInfo.freeShippingOverCents > 0 && goodsTotal <= deliveryInfo.freeShippingOverCents
      ? deliveryInfo.freeShippingOverCents - goodsTotal
      : null;
  const creditsCoverTotal = total > 0 && creditsBalanceCents >= total;
  useEffect(() => {
    if (paymentMethodMode === 'credits' && !creditsCoverTotal) {
      setPaymentMethodMode('channel');
    }
  }, [paymentMethodMode, creditsCoverTotal]);
  const issuedVouchers = useMemo(
    () => checkoutIssuedVouchers(memberRewards),
    [memberRewards],
  );
  const catalogRewards = useMemo(
    () => (SHOW_CHECKOUT_PROMO_BUTTONS ? checkoutCatalogRewards(memberRewards) : []),
    [memberRewards],
  );
  // The code box is always there: a member can paste a redemption code from
  // Rewards even before their wallet has refreshed.
  const showPromoSection = isAuthenticated;

  useEffect(() => {
    if (!appliedVoucher) setVoucherCodeInput('');
  }, [appliedVoucher]);

  // Lead time, cut-offs, capacity, and closed days for the chosen collection day.
  useEffect(() => {
    if (screen !== 'checkout') return;
    const date =
      isScheduled && pickupDate ? pickupDate : undefined;
    let alive = true;
    void fetchPickupSlots(date)
      .then((day) => {
        if (alive) setPickupDay(day);
      })
      .catch(() => {
        if (alive) setPickupDay(null);
      });
    return () => {
      alive = false;
    };
  }, [screen, isScheduled, pickupDate]);

  useEffect(() => {
    if (!pickupDay || !pickupTime) return;
    if (!isScheduled || pickupDay.date !== pickupDate) return;
    const chosen = pickupDay.slots.find((slot) => slot.start === pickupTime);
    if (!chosen?.available) setPickupTime(null);
  }, [pickupDay, pickupTime, pickupDate, isScheduled, setPickupTime]);

  // Availability is per collection day, so re-check whenever the member picks
  // a different date or changes the cart.
  useEffect(() => {
    if (!isScheduled || !pickupDate || checkoutCart.length === 0) {
      setDateAvailability([]);
      return;
    }
    let alive = true;
    void fetchShopAvailability(pickupDate)
      .then((res) => {
        if (!alive) return;
        const byId = new Map(res.products.map((p) => [p.id, p.sellableQty]));
        setDateAvailability(
          checkoutCart
            .map((line) => {
              const qty = byId.get(line.productId);
              // null = not stock-tracked, so nothing useful to say.
              if (qty == null) return null;
              return {
                productId: line.productId,
                name: line.name,
                sellableQty: qty,
                shortfall: qty < line.qty,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null),
        );
      })
      .catch(() => {
        // Availability is advisory here — the server re-checks and rejects at
        // checkout, so a failed lookup must not block the member from paying.
        if (alive) setDateAvailability([]);
      });
    return () => {
      alive = false;
    };
  }, [isScheduled, pickupDate, checkoutCart]);

  // Whether delivery is on, the WhatsApp number for courier help, and the
  // early-order cake discount.
  useEffect(() => {
    let alive = true;
    fetchEarlyOrderDiscount()
      .then((info) => {
        if (alive) setEarlyInfo(info);
      })
      .catch(() => undefined);
    fetchDeliveryInfo()
      .then((info) => {
        if (alive) setDeliveryInfo(info);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (screen !== 'checkout') return;
    let alive = true;
    void fetchPaymentsTestMode().then((v) => {
      if (alive) setTestPayments(v);
    });
    return () => {
      alive = false;
    };
  }, [screen]);

  // A parcel can't carry cakes, and shipping can be switched off. An empty cart is fine:
  // the member may choose shipping on a product page before adding anything.
  useEffect(() => {
    if (fulfillmentMethod !== 'shipping') return;
    if (hasCake || (deliveryInfo && deliveryInfo.shippingEnabled === false)) {
      setFulfillmentMethod('pickup');
    }
  }, [fulfillmentMethod, hasCake, deliveryInfo, setFulfillmentMethod]);

  // An emptied cart has nothing left to check out.
  useEffect(() => {
    if ((screen === 'checkout' || screen === 'addresses') && cart.length === 0) setScreen('cart');
  }, [screen, cart.length]);

  // At checkout, make sure the shipping address is one the member still has.
  useEffect(() => {
    if (screen !== 'checkout' || !isAuthenticated) return;
    if (fulfillmentMethod !== 'shipping') return;
    let alive = true;
    fetchMyAddresses()
      .then((rows) => {
        if (!alive) return;
        const chosen = rows.find((a) => a.id === selectedAddressId);
        const pick = chosen ?? rows.find((a) => a.isDefault) ?? rows[0] ?? null;
        handleSelectAddress(pick);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check on entering checkout or switching method
  }, [screen, fulfillmentMethod, isAuthenticated]);

  /** The address picked at checkout becomes the order's delivery details. */
  const handleSelectAddress = useCallback(
    (a: SavedAddress | null) => {
      setSelectedAddressId(a?.id ?? null);
      setDelivery({
        address: a?.fullAddress ?? '',
        contactName: a?.recipientName ?? '',
        contactPhone: a?.phone ?? '',
      });
    },
    [setSelectedAddressId, setDelivery],
  );

  useEffect(() => {
    if (!initialScreen) return;
    // A deep link (e.g. cart handoff) can ask to land straight on checkout —
    // still gate that behind sign-in like the normal Cart -> Checkout tap.
    if (initialScreen === 'checkout' && !isAuthenticated) {
      setScreen('cart');
      onInitialScreenApplied?.();
      onRequireAuth();
      return;
    }
    setScreen(initialScreen);
    onInitialScreenApplied?.();
  }, [initialScreen, isAuthenticated, onInitialScreenApplied, onRequireAuth]);

  useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
    onInitialQueryApplied?.();
  }, [initialQuery, onInitialQueryApplied]);

  // After a checkout-triggered sign-in succeeds, move the now-authenticated
  // guest straight into checkout instead of leaving them back on Cart.
  useEffect(() => {
    if (!authResumeSignal) return;
    if (!isAuthenticated) return;
    if (cart.length === 0) return;
    setScreen('checkout');
    setCheckoutErrors(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the resume token changes
  }, [authResumeSignal]);

  useEffect(() => {
    let alive = true;
    setCatalogLoading(true);
    setCatalogError(null);
    fetchShopCatalogProducts()
      .then((items) => {
        if (!alive) return;
        setProducts(items);
      })
      .catch((err) => {
        if (!alive) return;
        setCatalogError(
          err instanceof Error ? err.message : 'Failed to load products',
        );
      })
      .finally(() => {
        if (alive) setCatalogLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (screen !== 'checkout') return;
    let alive = true;
    setChannelsLoading(true);
    setChannelsError(null);
    fetchXenditShopChannels()
      .then((r) => {
        if (!alive) return;
        const visible = r.channels.filter(
          (c) => !HIDDEN_PAYMENT_CHANNELS.has(c.code.toUpperCase()),
        );
        setChannels(visible);
        setSelectedChannelCode((prev) => prev || visible[0]?.code || '');
      })
      .catch((err) => {
        if (!alive) return;
        setChannelsError(
          err instanceof Error ? err.message : 'Could not load payment methods',
        );
      })
      .finally(() => {
        if (alive) setChannelsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [screen]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (filter !== 'all' && p.shopFilter !== filter) return false;
      if (!q) return true;
      return `${p.name} ${p.shortDescription}`.toLowerCase().includes(q);
    });
  }, [filter, query, products]);

  const product = productId
    ? products.find((p) => p.id === productId)
    : undefined;

  const goBrowse = () => {
    setScreen('browse');
    setProductId(null);
    setCheckoutErrors(null);
  };

  const openProduct = (id: string) => {
    setProductId(id);
    setScreen('product');
    setCheckoutErrors(null);
  };

  const openCart = () => {
    setScreen('cart');
    setCheckoutErrors(null);
  };

  const openCheckout = () => {
    if (cart.length === 0) return;
    // This is the one moment browsing turns into "I want to pay" — ask a
    // guest to sign in here rather than earlier, so browsing and building a
    // cart stay completely login-free.
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    setScreen('checkout');
    setCheckoutErrors(null);
  };

  const handleInitCardTokenization = useCallback(async () => {
    setCardSessionError(null);
    setCardInitAttempted(true);
    setCardSessionLoading(true);
    setCardSubmitReady(false);
    setCardSubmitBusy(false);
    setCardPaymentTokenId('');
    try {
      const session = await createXenditCardTokenSession();
      setCardSessionId(session.paymentSessionId);
      cardSessionIdRef.current = session.paymentSessionId;
      const { XenditComponents } = await import('xendit-components-web');
      const components = new XenditComponents({
        componentsSdkKey: session.componentsSdkKey,
      });
      xenditComponentsRef.current =
        components as typeof xenditComponentsRef.current;
      components.addEventListener('submission-ready', () =>
        setCardSubmitReady(true),
      );
      components.addEventListener('submission-not-ready', () =>
        setCardSubmitReady(false),
      );
      components.addEventListener('submission-begin', () =>
        setCardSubmitBusy(true),
      );
      components.addEventListener('submission-end', () => {
        setCardSubmitBusy(false);
        // If a tokenization request is still pending after submission ends,
        // session-complete didn't fire — that usually means the card form had
        // a validation error. Give session-complete a small grace window
        // (handler order isn't guaranteed) and then reject so the user gets
        // a clear error and can retry.
        setTimeout(() => {
          const pending = pendingTokenizationRef.current;
          if (pending) {
            pendingTokenizationRef.current = null;
            pending.reject(
              new Error(
                'Could not verify your card. Please check the details and try again.',
              ),
            );
          }
        }, 600);
      });
      components.addEventListener('session-expired-or-canceled', () => {
        setCardSessionError(
          'Card tokenization session expired or canceled. Start a new one.',
        );
        const pending = pendingTokenizationRef.current;
        if (pending) {
          pendingTokenizationRef.current = null;
          pending.reject(new Error('Card session expired. Please retry.'));
        }
      });
      components.addEventListener('fatal-error', () => {
        const msg =
          'Card form origin is not authorized for this session. Open checkout from the same HTTPS domain configured in XENDIT_COMPONENTS_ORIGINS.';
        setCardSessionError(msg);
        const pending = pendingTokenizationRef.current;
        if (pending) {
          pendingTokenizationRef.current = null;
          pending.reject(new Error(msg));
        }
      });
      components.addEventListener('session-complete', () => {
        const sid = cardSessionIdRef.current;
        if (!sid) return;
        void (async () => {
          try {
            const state = await getXenditCardTokenSessionStatus(sid);
            if (!state.paymentTokenId) {
              throw new Error('No payment token generated. Try again.');
            }
            setCardPaymentTokenId(state.paymentTokenId);
            setCardSessionError(null);
            const pending = pendingTokenizationRef.current;
            if (pending) {
              pendingTokenizationRef.current = null;
              pending.resolve(state.paymentTokenId);
            }
          } catch (err) {
            const e =
              err instanceof Error
                ? err
                : new Error('Could not fetch card token status.');
            setCardSessionError(e.message);
            const pending = pendingTokenizationRef.current;
            if (pending) {
              pendingTokenizationRef.current = null;
              pending.reject(e);
            }
          }
        })();
      });
      const picker = components.createChannelPickerComponent();
      if (cardContainerRef.current) {
        cardContainerRef.current.replaceChildren(picker);
      }
    } catch (err) {
      setCardSessionError(
        err instanceof Error
          ? err.message
          : 'Could not initialize card tokenization.',
      );
    } finally {
      setCardSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== 'checkout') return;
    if (paymentMethodMode !== 'card_token') return;
    if (cardInitAttempted) return;
    if (cardSessionId || cardSessionLoading || cardPaymentTokenId) return;
    void handleInitCardTokenization();
  }, [
    screen,
    paymentMethodMode,
    cardInitAttempted,
    cardSessionId,
    cardSessionLoading,
    cardPaymentTokenId,
    handleInitCardTokenization,
  ]);

  // Submits the card form and resolves with the resulting payment token id.
  // Used by handlePlaceOrder so a single Pay click can both tokenize the
  // card and create the order without any intermediate user action.
  const tokenizeCard = useCallback((): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const sdk = xenditComponentsRef.current;
      if (!sdk) {
        reject(new Error('Card form is not ready yet. Please wait a moment.'));
        return;
      }
      // Replace any prior in-flight tokenization (shouldn't normally happen
      // because the Pay button is disabled while busy, but be defensive).
      const previous = pendingTokenizationRef.current;
      if (previous) {
        previous.reject(new Error('Tokenization superseded.'));
      }
      pendingTokenizationRef.current = { resolve, reject };
      setCardSessionError(null);
      try {
        sdk.submit();
      } catch (err) {
        pendingTokenizationRef.current = null;
        reject(
          err instanceof Error ? err : new Error('Card submission failed.'),
        );
      }
    });
  }, []);

  const promoMinSpendError = (
    minSpendSen: number | null | undefined,
    label: string,
  ) => {
    if (minSpendSen != null && subtotal < minSpendSen) {
      return `Minimum order ${formatRm(minSpendSen)} to use this ${label}.`;
    }
    return null;
  };

  const handleSelectIssuedVoucher = (v: (typeof issuedVouchers)[number]) => {
    if (appliedVoucher?.id === v.id) {
      applyVoucher(null);
      setVoucherCodeError(null);
      setCheckoutErrors(null);
      return;
    }
    const err = promoMinSpendError(v.minSpendSen, 'voucher');
    if (err) {
      setCheckoutErrors([err]);
      return;
    }
    if (v.value <= 0) {
      setCheckoutErrors([
        'This voucher has no discount amount configured yet.',
      ]);
      return;
    }
    setCheckoutErrors(null);
    setVoucherCodeError(null);
    setVoucherCodeInput(v.code);
    applyVoucher(v);
  };

  const handleSelectCatalogReward = (r: MockReward) => {
    if (appliedReward?.id === r.id) {
      applyReward(null);
      setCheckoutErrors(null);
      return;
    }
    const err = promoMinSpendError(r.minSpendSen, 'reward');
    if (err) {
      setCheckoutErrors([err]);
      return;
    }
    if (r.valueCents <= 0) {
      setCheckoutErrors(['This reward has no discount amount configured yet.']);
      return;
    }
    if (pointsBalance < r.pointsCost) {
      setCheckoutErrors(['Not enough points for this reward.']);
      return;
    }
    setCheckoutErrors(null);
    applyReward(r);
  };

  const handleApplyVoucherCode = () => {
    const code = voucherCodeInput.trim();
    if (!code) {
      setVoucherCodeError(null);
      applyVoucher(null);
      return;
    }
    const match = findIssuedVoucherByCode(memberRewards, code);
    if (!match) {
      setVoucherCodeError(
        'We could not find this code in your wallet. It may have expired, already been used, or been mistyped.',
      );
      applyVoucher(null);
      return;
    }
    const err = promoMinSpendError(match.minSpendSen, 'voucher');
    if (err) {
      setVoucherCodeError(err);
      applyVoucher(null);
      return;
    }
    if (match.value <= 0) {
      setVoucherCodeError(
        'This voucher has no discount amount configured yet.',
      );
      applyVoucher(null);
      return;
    }
    setVoucherCodeError(null);
    applyVoucher(match);
  };

  /** Appended to the "order placed" pop-ups when the member's own courier collects. */
  const deliveryAlertNote = (summary: string[]) =>
    summary.some((l) => l.startsWith('Collected by:'))
      ? `\n\n${DELIVERY_CHARGE_NOTICE}`
      : '';

  const handlePlaceOrder = async () => {
    // Safety net: covers a session expiring while already on the checkout
    // screen. The normal path never reaches here signed out, since
    // openCheckout already gates entry to this screen.
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const draft = {
      cart: checkoutCart,
      fulfillmentMethod,
      pickupDate,
      pickupTime,
      delivery,
    };
    const { valid, errors } = validateCheckout(draft);
    if (!valid) {
      setCheckoutErrors(errors);
      return;
    }
    if (
      draft.fulfillmentMethod === 'pickup' &&
      pickupDay &&
      draft.pickupDate === pickupDay.date
    ) {
      if (pickupDay.closed && pickupDay.closedReason) {
        setCheckoutErrors([pickupDay.closedReason]);
        return;
      }
      const chosen = pickupDay.slots.find(
        (slot) => slot.start === draft.pickupTime,
      );
      if (chosen && !chosen.available && chosen.reason) {
        setCheckoutErrors([chosen.reason]);
        return;
      }
    }
    if (paymentMethodMode === 'credits' && !creditsCoverTotal) {
      setCheckoutErrors([
        `You have ${formatRm(creditsBalanceCents)} in credits but this order is ${formatRm(total)}. Top up, or pay another way.`,
      ]);
      return;
    }
    if (paymentMethodMode === 'channel' && !selectedChannelCode.trim()) {
      setCheckoutErrors(['Select a payment method.']);
      return;
    }
    if (paymentMethodMode === 'card_token') {
      if (cardSessionLoading || !cardSessionId) {
        setCheckoutErrors([
          'Card form is still loading. Please wait a moment.',
        ]);
        return;
      }
      if (cardSessionError) {
        setCheckoutErrors([cardSessionError]);
        return;
      }
      // If a token already exists we'll reuse it; otherwise the form must be
      // valid so we can submit it as part of this Pay click.
      if (!cardPaymentTokenId.trim() && !cardSubmitReady) {
        setCheckoutErrors(['Please complete your card details.']);
        return;
      }
    }
    setCheckoutErrors(null);
    const lines = fulfillmentSummaryLines(
      draft.fulfillmentMethod,
      draft.pickupDate,
      draft.pickupTime,
      draft.delivery,
      pickupBy,
    );
    const linePayload = checkoutCart.map((l) => ({
      productId: l.productId,
      name: l.name,
      imageUrl: l.imageUrl,
      unitPriceCents: l.unitPriceCents,
      qty: l.qty,
      variantLabel: l.variantLabel ?? null,
    }));
    setPlacingOrder(true);
    try {
      // For card payments, generate a payment token as part of this single
      // click if we don't have one yet. Previously this required a separate
      // "Use this card" button before the user could continue.
      let paymentTokenId = cardPaymentTokenId.trim();
      if (paymentMethodMode === 'card_token' && !paymentTokenId) {
        paymentTokenId = await tokenizeCard();
      }

      const result = await createShopOrderCheckout({
        ...(paymentMethodMode === 'credits'
          ? { payWithCredits: true }
          : paymentMethodMode === 'card_token'
            ? { paymentTokenId }
            : { channelCode: selectedChannelCode.trim() }),
        ...(appliedVoucher ? { voucherId: appliedVoucher.id } : {}),
        ...(appliedReward ? { rewardDefinitionId: appliedReward.id } : {}),
        idempotencyKey: crypto.randomUUID(),
        order: {
          totalCents: total,
          discountCents: discount + earlyDiscount,
          fulfillmentSummary: lines,
          fulfilmentType:
            draft.fulfillmentMethod === 'shipping' ? 'DELIVERY' : 'PICKUP',
          ...(draft.fulfillmentMethod === 'shipping'
            ? {
                deliveryMethod: 'SHIPPING' as const,
                delivery: {
                  address: delivery.address.trim(),
                  contactName: delivery.contactName.trim(),
                  contactPhone: delivery.contactPhone.trim(),
                },
              }
            : {
                scheduledDate: draft.pickupDate,
                scheduledSlot: draft.pickupTime,
              }),
          lines: linePayload,
        },
      });

      if ('demoMode' in result && result.demoMode) {
        setDemoCheckout({
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          totalCents: result.totalCents,
          fulfillmentSummary: lines,
          linePayload,
        });
        setScreen('paymentDemo');
        return;
      }

      if ('paidWithCredits' in result && result.paidWithCredits) {
        const o = result.order;
        useOrderHistoryStore.getState().addOrder({
          id: o.id,
          orderNumber: o.orderNumber,
          placedAt: o.placedAt,
          status: o.status,
          completedAt: null,
          lines: linePayload.map((l) => ({
            productId: l.productId,
            name: l.name,
            imageUrl: l.imageUrl ?? '',
            unitPriceCents: l.unitPriceCents,
            qty: l.qty,
            variantLabel: l.variantLabel ?? undefined,
          })),
          totalCents: o.totalCents,
          fulfillmentSummary: lines,
        });
        onCreditsChanged?.();
        window.alert(
          `Order placed — paid with credits\n\nPickup code: ${o.orderNumber}\nPaid: ${formatRm(result.creditsSpentCents)}\nCredits left: ${formatRm(result.balanceCents)}\n${lines.join('\n')}${deliveryAlertNote(lines)}`,
        );
        resetAfterOrder();
        goBrowse();
        return;
      }

      if ('zeroPaid' in result && result.zeroPaid) {
        const o = result.order;
        useOrderHistoryStore.getState().addOrder({
          id: o.id,
          orderNumber: o.orderNumber,
          placedAt: o.placedAt,
          status: o.status,
          completedAt: null,
          lines: linePayload.map((l) => ({
            productId: l.productId,
            name: l.name,
            imageUrl: l.imageUrl ?? '',
            unitPriceCents: l.unitPriceCents,
            qty: l.qty,
            variantLabel: l.variantLabel ?? undefined,
          })),
          totalCents: o.totalCents,
          fulfillmentSummary: lines,
        });
        window.alert(
          `Order placed (no payment required)\n\nPickup code: ${o.orderNumber}\nTotal: ${formatRm(o.totalCents)}\n${lines.join('\n')}${deliveryAlertNote(lines)}`,
        );
        resetAfterOrder();
        goBrowse();
        return;
      }

      if ('redirectUrl' in result && result.redirectUrl) {
        // Persist enough state for the app to detect completion when the user
        // returns later — e-wallets like Touch 'n Go often don't redirect
        // back to the merchant in live mode.
        savePendingPayment({
          referenceId: result.referenceId,
          orderNumber: result.orderNumber,
          purpose: 'shop_order',
        });
        window.location.href = result.redirectUrl;
        return;
      }

      setCheckoutErrors([
        testPayments
          ? 'No payment redirect URL. Use Xendit test keys and a valid channel, or enable PAYMENTS_DEMO_MODE for local test checkout.'
          : 'We could not start the payment. Please try again.',
      ]);
    } catch (err) {
      setCheckoutErrors([
        err instanceof Error ? err.message : 'Checkout could not start.',
      ]);
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleCompleteDemoPayment = async () => {
    if (!demoCheckout) return;
    setDemoCompleting(true);
    try {
      const { order } = await completeDemoShopOrder(demoCheckout.orderId);
      useOrderHistoryStore.getState().addOrder({
        id: order.id,
        orderNumber: order.orderNumber,
        placedAt: order.placedAt,
        status: order.status,
        completedAt: null,
        totalCents: order.totalCents,
        fulfillmentSummary: demoCheckout.fulfillmentSummary,
        lines: demoCheckout.linePayload.map((l) => ({
          productId: l.productId,
          name: l.name,
          imageUrl: l.imageUrl ?? '',
          unitPriceCents: l.unitPriceCents,
          qty: l.qty,
          variantLabel: l.variantLabel ?? undefined,
        })),
      });
      window.alert(
        `Payment complete (test)\n\nPickup code: ${order.orderNumber}\nTotal: ${formatRm(order.totalCents)}\n${demoCheckout.fulfillmentSummary.join('\n')}${deliveryAlertNote(demoCheckout.fulfillmentSummary)}`,
      );
      setDemoCheckout(null);
      resetAfterOrder();
      setScreen('browse');
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Could not complete test payment.',
      );
    } finally {
      setDemoCompleting(false);
    }
  };

  return (
    <>
      {screen === 'browse' && (
        <>
          <header className="shopTopBar pmTopBar">
            <h2>Shop</h2>
            <button
              type="button"
              className="shopCartBtn"
              onClick={openCart}
              aria-label="Open cart"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M6 2h12l1.5 4H4.5z" />
                <path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                <path d="M9 11h6" />
              </svg>
              {itemCount > 0 ? (
                <span className="shopCartBadge">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              ) : null}
            </button>
          </header>
          <section className="pmCard shopSearchCard">
            <div className="chips shopCategoryChips">
              <button
                type="button"
                className={filter === 'all' ? 'chip active' : 'chip'}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              {(Object.keys(SHOP_FILTER_LABELS) as ShopFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={filter === f ? 'chip active' : 'chip'}
                  onClick={() => setFilter(f)}
                >
                  {SHOP_FILTER_LABELS[f]}
                </button>
              ))}
              {query.trim() ? (
                // A search started from the Home tab — show it so it can be cleared.
                <button
                  type="button"
                  className="chip active"
                  onClick={() => setQuery('')}
                  aria-label={`Clear search ${query.trim()}`}
                >
                  “{query.trim()}” ✕
                </button>
              ) : null}
            </div>
          </section>
          <div className="productsGrid">
            {catalogLoading ? (
              <section className="pmCard">
                <p className="caption">Loading products...</p>
              </section>
            ) : null}
            {catalogError ? (
              <section className="pmCard">
                <p className="caption">{catalogError}</p>
              </section>
            ) : null}
            {filteredProducts.map((p) => {
              const soldOut = isShopProductSoldOut(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`productCard shopProductHit${soldOut ? ' shopProductHit--soldOut' : ''}`}
                  onClick={() => openProduct(p.id)}
                >
                  <div className="productImage">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="productImageInner"
                        style={{
                          objectPosition: `${p.imageOffsetX ?? 50}% ${p.imageOffsetY ?? 50}%`,
                          transform: `scale(${p.imageScale ?? 1})`,
                          transformOrigin: `${p.imageOffsetX ?? 50}% ${p.imageOffsetY ?? 50}%`,
                        }}
                      />
                    ) : null}
                    {soldOut ? (
                      <span className="shopSoldOutBadge">Sold out</span>
                    ) : null}
                    {p.shippable === true ? <ShippingBadge shippable /> : null}
                  </div>
                  <div className="productBody">
                    <div className="productText">
                      <strong>{p.name}</strong>
                      <ClampedDescription text={p.shortDescription} />
                    </div>
                    <div className="productFoot">
                      <PointsPill
                        cashback={cashbackOf(p.variants?.[0]?.priceCents ?? p.basePriceCents)}
                      />
                      <div className="productPrice">
                        <span className="shopFromLabel">from</span>
                        <span className="productPriceValue">
                          {formatRm(
                            p.variants?.[0]?.priceCents ?? p.basePriceCents,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!filteredProducts.length ? (
              <section className="pmCard">
                <p className="caption">No products match your filters.</p>
              </section>
            ) : null}
          </div>
        </>
      )}

      {screen === 'product' && product && (
        <ProductDetailScreen
          product={product}
          onBack={goBrowse}
          onOpenCart={openCart}
          itemCount={itemCount}
          addToCart={addToCart}
          fulfillmentMethod={fulfillmentMethod}
          onFulfillmentMethod={setFulfillmentMethod}
          deliveryInfo={deliveryInfo}
          unshippableNames={unshippableNames}
          cartHasShippable={checkoutCart.some((l) => classOfLine(l) === 'NATIONWIDE')}
          cashbackOf={cashbackOf}
        />
      )}

      {screen === 'cart' && (
        <CartScreen
          cart={cart}
          groups={cartGroups}
          fulfillmentMethod={fulfillmentMethod}
          appliedVoucher={appliedVoucher}
          appliedReward={appliedReward}
          onBack={goBrowse}
          onContinueShopping={goBrowse}
          onCheckout={openCheckout}
          setLineQty={setLineQty}
          removeLine={removeLine}
        />
      )}

      {screen === 'checkout' && (
        <>
          <header className="shopTopBar pmTopBar">
            <button
              type="button"
              className="textAction shopBackLink"
              onClick={openCart}
            >
              ← Cart
            </button>
            <h2 className="shopTitleCenter">Checkout</h2>
            <span className="shopTopSpacer" />
          </header>


          <section className="pmCard">
            <div className="addressBookHead">
              <h3 className="shopSectionTitle" style={{ margin: 0 }}>
                Your items
              </h3>
              <button type="button" className="textAction" onClick={goBrowse}>
                + Add items
              </button>
            </div>
            <div className="shopCartList" style={{ marginTop: 10 }}>
              {productLines.map((l) => (
                <CartLineRow key={l.lineId} line={l} setLineQty={setLineQty} removeLine={removeLine} />
              ))}
            </div>
            {hasCake ? (
              <div className="checkoutAddons">
                <p className="checkoutAddonsTitle">Add extras</p>
                {CHECKOUT_ADDONS.filter((addon) => addonLimit(addon) > 0).map((addon) => {
                  const line = cart.find((l) => l.productId === addon.productId);
                  const limit = addonLimit(addon);
                  return (
                    <div key={addon.productId} className="checkoutAddon">
                      <label className="checkoutAddonPick">
                        <input
                          type="checkbox"
                          checked={Boolean(line)}
                          onChange={() => toggleAddon(addon)}
                        />
                        <span className="checkoutAddonText">
                          <strong>{addon.name}</strong>
                          <small>
                            {addon.onePerCake
                              ? `${addon.note}`
                              : `${addon.note}`}
                          </small>
                        </span>
                      </label>
                      {line ? (
                        <div className="shopStepper checkoutAddonStepper">
                          <button
                            type="button"
                            className="ghost"
                            aria-label={`Fewer ${addon.name}`}
                            disabled={line.qty <= 1}
                            onClick={() => setLineQty(line.lineId, line.qty - 1)}
                          >
                            −
                          </button>
                          <span>{line.qty}</span>
                          <button
                            type="button"
                            className="ghost"
                            aria-label={`More ${addon.name}`}
                            disabled={line.qty >= limit}
                            onClick={() => setLineQty(line.lineId, line.qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      ) : null}
                      <span className="checkoutAddonPrice">
                        {addon.priceCents === 0
                          ? 'FREE'
                          : formatRm(addon.priceCents * (line?.qty ?? 1))}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="pmCard">
            <h3 className="shopSectionTitle">Delivery method</h3>
            <div className="shopFulfillmentRow">
              <button
                type="button"
                className={`chip shopFulfillmentChip shopFulfillOption${fulfillmentMethod === 'pickup' ? ' active' : ''}`}
                onClick={() => setFulfillmentMethod('pickup')}
              >
                <strong>Self pickup</strong>
                <small>Collect at our shop</small>
              </button>
              {shippingOffered ? (
                <button
                  type="button"
                  className={`chip shopFulfillmentChip shopFulfillOption shopFulfillOptionShip${isShipping ? ' active' : ''}`}
                  onClick={() => setFulfillmentMethod('shipping')}
                >
                  <strong>Ship nationwide</strong>
                  <small>
                    {deliveryInfo
                      ? shippingFeeFor(deliveryInfo, goodsTotal) === 0
                        ? 'Free shipping'
                        : `+ ${formatRm(shippingFeeFor(deliveryInfo, goodsTotal))} shipping`
                      : 'Posted anywhere in Malaysia'}
                  </small>
                </button>
              ) : null}
            </div>
            {hasCake && checkoutCart.some((l) => classOfLine(l) === 'NATIONWIDE') ? (
              <p className="caption" style={{ margin: '6px 0 0' }}>
                Shipping isn&apos;t available while {unshippableNames.join(', ')} {unshippableNames.length === 1 ? 'is' : 'are'} in your cart, because {unshippableNames.length === 1 ? 'it' : 'they'} can&apos;t be posted. Remove {unshippableNames.length === 1 ? 'it' : 'them'} above to ship the cookies.
              </p>
            ) : !canShip ? (
              <p className="caption" style={{ margin: '6px 0 0' }}>
                Kindly show the QR code to our staff upon pickup.
              </p>
            ) : null}
            {isScheduled ? (
              <div className="deliveryArrange">
                <p className="deliveryArrangeTitle">Who&apos;s collecting?</p>
                <label className="deliveryChoice">
                  <input
                    type="radio"
                    name="pickupBy"
                    checked={pickupBy === 'self'}
                    onChange={() => setPickupBy('self')}
                  />
                  <span>
                    <strong>I&apos;ll collect it myself</strong>
                    <small>Pick up at our shop at the time below.</small>
                  </span>
                </label>
                <label className="deliveryChoice">
                  <input
                    type="radio"
                    name="pickupBy"
                    checked={pickupBy === 'courier'}
                    onChange={() => setPickupBy('courier')}
                  />
                  <span>
                    <strong>I&apos;ll arrange my own courier</strong>
                    <small>
                      Book Grab, Lalamove or your own driver to collect from our
                      shop at the time below.
                    </small>
                  </span>
                </label>
              </div>
            ) : null}
            {isShipping ? (
              <div className="addressSummary">
                <div className="addressBookHead">
                  <strong>Ship to</strong>
                  <button
                    type="button"
                    className="textAction"
                    onClick={() => {
                      setCheckoutErrors(null);
                      setScreen('addresses');
                    }}
                  >
                    {delivery.address.trim() ? 'Change address' : 'Add address'}
                  </button>
                </div>
                {delivery.address.trim() ? (
                  <p className="caption" style={{ margin: '4px 0 0' }}>
                    <strong>{delivery.contactName.trim()}</strong> · {delivery.contactPhone.trim()}
                    <br />
                    {delivery.address.trim()}
                  </p>
                ) : (
                  <p className="caption" style={{ margin: '4px 0 0' }}>
                    You have no saved address yet.
                  </p>
                )}
              </div>
            ) : null}
            {isShipping ? (
              <div className="shippingFeeBox">
                <div className="shippingFeeRow">
                  <span>Shipping</span>
                  <strong>{shippingFee === 0 ? 'Free' : formatRm(shippingFee)}</strong>
                </div>
                {shippingFee === 0 && deliveryInfo && deliveryInfo.shippingFeeCents > 0 ? (
                  <p className="shippingFeeHint shippingFeeHintOk">
                    Free shipping applied: your order is over{' '}
                    {formatRm(deliveryInfo.freeShippingOverCents)}.
                  </p>
                ) : freeShippingToGo != null ? (
                  <p className="shippingFeeHint">
                    Spend over {formatRm(deliveryInfo?.freeShippingOverCents ?? 0)} for free
                    shipping — {formatRm(freeShippingToGo)} to go.
                  </p>
                ) : null}
                <p className="caption" style={{ margin: '6px 0 0' }}>
                  Packed and posted within 2-5 days. No pickup date or time is needed.
                </p>
              </div>
            ) : null}
            {isScheduled ? (
              <div className="shopFieldGrid pickupGrid">
                <div className="pickupField">
                <label htmlFor="pickupDate">
                  {byCourier ? 'Courier pick-up date' : 'Pickup date'}
                </label>
                <input
                  id="pickupDate"
                  type="date"
                  min={pickupDay?.today ?? todayIsoDate()}
                  max={pickupDay?.maxDate}
                  value={pickupDate ?? ''}
                  onChange={(e) => setPickupDate(e.target.value || null)}
                />
                </div>
                <div className="pickupField">
                <label htmlFor="pickupTime">
                  {byCourier ? 'Courier pick-up time' : 'Pickup time'}
                </label>
                <select
                  id="pickupTime"
                  value={pickupTime ?? ''}
                  onChange={(e) => setPickupTime(e.target.value || null)}
                  disabled={Boolean(pickupDay?.closed && pickupDate === pickupDay.date)}
                >
                  <option value="">Select time</option>
                  {(pickupDay && pickupDate === pickupDay.date
                    ? pickupDay.slots
                    : PICKUP_TIME_SLOTS.map((slot) => ({
                        start: slot.value,
                        label: slot.label,
                        available: true,
                        reason: null as string | null,
                        remaining: null as number | null,
                      }))
                  )
                    .filter((slot) => slot.available)
                    .map((slot) => (
                      <option key={slot.start} value={slot.start}>
                        {slot.remaining == null
                          ? slot.label
                          : `${slot.label} · ${slot.remaining} left`}
                      </option>
                    ))}
                </select>
                </div>
                {/* Full width under both fields, so the date and time boxes stay level. */}
                {earlyInfo?.enabled && wholeCakeCount > 0 ? (
                  <p className={earlyDiscount > 0 ? 'earlyOrderHint earlyOrderHint--on' : 'earlyOrderHint'}>
                    {earlyDiscount > 0
                      ? `Early order: ${earlyInfo.percent}% off your cakes.`
                      : `Pick a date ${earlyInfo.minDaysAhead}+ days ahead to save ${earlyInfo.percent}% on whole cakes.`}
                  </p>
                ) : null}
                {pickupDay && pickupDate === pickupDay.date && pickupDay.closedReason ? (
                  <p className="pickupAvailShort">{pickupDay.closedReason}</p>
                ) : null}
                {pickupDay &&
                pickupDate === pickupDay.date &&
                !pickupDay.closed &&
                pickupDay.leadTimeMessage ? (
                  <p className="caption" style={{ margin: 0 }}>
                    {pickupDay.leadTimeMessage}
                  </p>
                ) : null}
                {pickupDay &&
                pickupDate === pickupDay.date &&
                !pickupDay.closed &&
                pickupDay.slots.length > 0 &&
                pickupDay.slots.every((slot) => !slot.available) ? (
                  <p className="caption" style={{ margin: 0 }}>
                    No pickup times are left on this date. Please choose another
                    date.
                  </p>
                ) : null}
              </div>
            ) : null}
            {dateAvailability.length > 0 ? (
              <div className="pickupAvailability">
                {dateAvailability.map((row) => (
                  <p
                    key={row.productId}
                    className={
                      row.shortfall ? 'pickupAvailShort' : 'pickupAvailOk'
                    }
                  >
                    {row.name}:{' '}
                    {row.shortfall
                      ? `only ${row.sellableQty} left for this date`
                      : `${row.sellableQty} available`}
                  </p>
                ))}
              </div>
            ) : null}
            {byCourier ? (
              <div className="deliveryArrange">
                <p className="deliveryNotice" role="note">
                  <strong>Please note:</strong> {DELIVERY_CHARGE_NOTICE}
                </p>
                {deliveryInfo?.whatsappNumber ? (
                  <a
                    className="deliverySupportBtn"
                    aria-label="Chat with Moja Maison on WhatsApp"
                    href={whatsappUrl(
                      deliveryInfo.whatsappNumber,
                      courierPickupWhatsappMessage({ date: pickupDate, time: pickupTime }),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <SupportIcon />
                    Questions? Chat with us
                  </a>
                ) : null}
              </div>
            ) : null}
          </section>

          {showPromoSection ? (
            <section className="pmCard">
              <h3 className="shopSectionTitle">Voucher or redemption code</h3>
              <div className="shopPromoGrid">
                {isAuthenticated ? (
                  <div>
                    <p
                      className="caption"
                      style={{ marginTop: 0, marginBottom: 8 }}
                    >
                      Paste your code from Rewards → Vouchers.
                    </p>
                    <div className="shopVoucherCodeRow">
                      <input
                        id="voucherCode"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Paste code here"
                        value={voucherCodeInput}
                        onChange={(e) => {
                          setVoucherCodeInput(e.target.value);
                          if (voucherCodeError) setVoucherCodeError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplyVoucherCode();
                          }
                        }}
                      />
                      <button type="button" onClick={handleApplyVoucherCode}>
                        Apply
                      </button>
                    </div>
                    {voucherCodeError ? (
                      <p className="shopVoucherCodeError" role="alert">
                        {voucherCodeError}
                      </p>
                    ) : null}
                    {appliedVoucher ? (
                      <p
                        className="caption"
                        style={{ marginTop: 8, marginBottom: 0 }}
                      >
                        Applied: <strong>{appliedVoucher.title}</strong> (
                        {appliedVoucher.code})
                        {appliedVoucher.value > 0
                          ? ` · −${formatRm(appliedVoucher.value)}`
                          : ''}
                      </p>
                    ) : null}
                    {SHOW_CHECKOUT_PROMO_BUTTONS ? (
                    <div className="shopPromoList" style={{ marginTop: 10 }}>
                      {issuedVouchers.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className={`shopPromoItem ${appliedVoucher?.id === v.id ? 'active' : ''}`}
                          onClick={() => handleSelectIssuedVoucher(v)}
                        >
                          <strong>{v.title}</strong>
                          <small>
                            {v.code}
                            {v.value > 0 ? ` · −${formatRm(v.value)}` : ''}
                          </small>
                        </button>
                      ))}
                    </div>
                    ) : null}
                  </div>
                ) : null}
                {catalogRewards.length > 0 ? (
                  <div>
                    <p className="caption">Rewards ({pointsBalance} pts)</p>
                    <div className="shopPromoList">
                      {catalogRewards.map((r) => {
                        const affordable = pointsBalance >= r.pointsCost;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            disabled={!affordable}
                            className={`shopPromoItem ${appliedReward?.id === r.id ? 'active' : ''}`}
                            onClick={() => handleSelectCatalogReward(r)}
                          >
                            <strong>{r.title}</strong>
                            <small>
                              {r.pointsCost} pts
                              {r.valueCents > 0
                                ? ` · −${formatRm(r.valueCents)}`
                                : ''}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              {(appliedVoucher || appliedReward) && (
                <button
                  type="button"
                  className="ghost shopClearPromo"
                  onClick={() => {
                    applyVoucher(null);
                    applyReward(null);
                    setVoucherCodeInput('');
                    setVoucherCodeError(null);
                  }}
                >
                  Clear promotion
                </button>
              )}
            </section>
          ) : null}

          <section className="pmCard">
            <h3 className="shopSectionTitle">Payment</h3>
            {testPayments ? (
              <p className="caption" style={{ marginTop: 0 }}>
                Test payment channel — no real money is charged.
              </p>
            ) : null}
            <div className="shopFieldGrid" style={{ marginTop: 8 }}>
              {creditsBalanceCents > 0 ? (
                <>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      opacity: creditsCoverTotal ? 1 : 0.55,
                    }}
                  >
                    <input
                      type="radio"
                      name="paymentType"
                      checked={paymentMethodMode === 'credits'}
                      disabled={!creditsCoverTotal}
                      onChange={() => {
                        setPaymentMethodMode('credits');
                        setCardSessionError(null);
                      }}
                    />
                    <span>
                      Pay with credits ({formatRm(creditsBalanceCents)}{' '}
                      available)
                    </span>
                  </label>
                  {!creditsCoverTotal && total > 0 ? (
                    <p className="caption" style={{ margin: '0 0 4px 26px' }}>
                      Not enough credits, top up now.
                    </p>
                  ) : null}
                </>
              ) : null}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="paymentType"
                  checked={paymentMethodMode === 'channel'}
                  onChange={() => {
                    setPaymentMethodMode('channel');
                    setCardSessionError(null);
                  }}
                />
                <span>Wallet / online banking</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="paymentType"
                  checked={paymentMethodMode === 'card_token'}
                  onChange={() => {
                    setPaymentMethodMode('card_token');
                    setCardSessionError(null);
                    setCardInitAttempted(false);
                  }}
                />
                <span>Visa / Mastercard</span>
              </label>
            </div>
            {channelsLoading ? (
              <p className="caption">Loading payment methods…</p>
            ) : null}
            {channelsError ? <p className="err">{channelsError}</p> : null}
            {paymentMethodMode === 'channel' &&
            !channelsLoading &&
            !channelsError &&
            channels.length ? (
              <div className="shopFieldGrid" style={{ marginTop: 8 }}>
                <p
                  className="caption"
                  style={{ marginTop: 0, marginBottom: 4 }}
                >
                  Choose wallet / online banking method
                </p>
                <div
                  style={{
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  {channels.map((c) => {
                    const active = selectedChannelCode === c.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setSelectedChannelCode(c.code)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: active
                            ? '1px solid #5b6cff'
                            : '1px solid rgba(255,255,255,0.12)',
                          background: active
                            ? 'rgba(91,108,255,0.12)'
                            : 'rgba(255,255,255,0.03)',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                          color: 'var(--text, #1a1a1a)',
                        }}
                      >
                        <PaymentChannelIcon code={c.code} label={c.label} />
                        <span
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            lineHeight: 1.2,
                          }}
                        >
                          <strong
                            style={{
                              fontSize: 13,
                              color: 'var(--primary,rgb(34, 44, 229))',
                            }}
                          >
                            {c.label}
                          </strong>
                          <small
                            className="caption"
                            style={{ margin: 0, color: 'rgba(26,26,26,0.72)' }}
                          >
                            {c.code}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : paymentMethodMode === 'channel' &&
              !channelsLoading &&
              !channelsError ? (
              <p className="caption">
                {testPayments
                  ? 'No payment channels are set up on the server yet.'
                  : 'Online payment is unavailable right now. Please try again later.'}
              </p>
            ) : null}
            {paymentMethodMode === 'card_token' ? (
              <div className="shopFieldGrid" style={{ marginTop: 8 }}>
                <p className="caption" style={{ marginTop: 0 }}>
                  Enter your card details below. We&apos;ll verify your card and
                  start payment when you tap Pay.
                </p>
                {cardSessionError ? (
                  <p className="err">{cardSessionError}</p>
                ) : null}
                {cardSessionLoading ? (
                  <p className="caption">Preparing secure card form...</p>
                ) : null}
                <div ref={cardContainerRef} />
                {cardSessionError ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setCardInitAttempted(false);
                      setCardSessionId(null);
                      setCardPaymentTokenId('');
                      setCardSubmitReady(false);
                      setCardSubmitBusy(false);
                      void handleInitCardTokenization();
                    }}
                  >
                    Retry card form
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="pmCard shopSummaryCard">
            <h3 className="shopSectionTitle">Order summary</h3>
            <ul className="shopSummaryList">
              {checkoutCart.map((l) => (
                <li key={l.lineId}>
                  <span>
                    {l.name}
                    {l.variantLabel ? ` · ${l.variantLabel}` : ''} × {l.qty}
                  </span>
                  <span>{formatRm(l.unitPriceCents * l.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="shopSummaryTotals">
              <div>
                <span>Subtotal</span>
                <span>{formatRm(subtotal)}</span>
              </div>
              {discount > 0 ? (
                <div className="discountLine">
                  <span>Discount</span>
                  <span>−{formatRm(discount)}</span>
                </div>
              ) : null}
              {earlyDiscount > 0 ? (
                <div className="discountLine">
                  <span>Early order ({earlyInfo?.percent}% off cakes)</span>
                  <span>−{formatRm(earlyDiscount)}</span>
                </div>
              ) : null}
              {isShipping ? (
                <div>
                  <span>Shipping</span>
                  <span>{formatRm(shippingFee)}</span>
                </div>
              ) : null}
              <div className="totalLine">
                <span>Total</span>
                <span>{formatRm(total)}</span>
              </div>
            </div>
            {checkoutErrors?.length ? (
              <div ref={checkoutErrorsRef} className="shopErrorBox" role="alert">
                {checkoutErrors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            ) : null}
            <div className="shopPayActionRow">
              <button
                type="button"
                className="shopPayButton"
                onClick={() => void handlePlaceOrder()}
                disabled={
                  placingOrder ||
                  (paymentMethodMode === 'credits' && !creditsCoverTotal) ||
                  (paymentMethodMode === 'channel' &&
                    (channelsLoading ||
                      (!channels.length && !channelsLoading))) ||
                  (paymentMethodMode === 'card_token' &&
                    (cardSessionLoading ||
                      !cardSessionId ||
                      Boolean(cardSessionError) ||
                      (!cardPaymentTokenId.trim() && !cardSubmitReady) ||
                      cardSubmitBusy))
                }
              >
                {placingOrder
                  ? cardSubmitBusy
                    ? 'Verifying card…'
                    : paymentMethodMode === 'credits'
                      ? 'Paying…'
                      : 'Starting payment…'
                  : paymentMethodMode === 'credits'
                    ? `Pay ${formatRm(total)} with credits`
                    : `Pay ${formatRm(total)}`}
              </button>
            </div>
          </section>
        </>
      )}

      {screen === 'addresses' && (
        <>
          <header className="shopTopBar pmTopBar">
            <button
              type="button"
              className="textAction shopBackLink"
              onClick={() => setScreen('checkout')}
            >
              ← Checkout
            </button>
            <h2 className="shopTitleCenter">Shipping address</h2>
            <span className="shopTopSpacer" />
          </header>
          <section className="pmCard">
            <AddressPicker
              selectedId={selectedAddressId}
              mode="shipping"
              localPostcodes={[]}
              memberName={memberName}
              memberPhone={memberPhone}
              onSelect={handleSelectAddress}
            />
            <p className="caption" style={{ margin: '10px 0 0' }}>
              You can also manage your saved addresses any time under Account → My addresses.
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                disabled={!delivery.address.trim()}
                onClick={() => setScreen('checkout')}
              >
                Use this address
              </button>
            </div>
          </section>
        </>
      )}

      {screen === 'paymentDemo' && demoCheckout && (
        <>
          <header className="shopTopBar pmTopBar">
            <button
              type="button"
              className="textAction shopBackLink"
              onClick={() => {
                setDemoCheckout(null);
                setScreen('checkout');
              }}
            >
              ← Checkout
            </button>
            <h2 className="shopTitleCenter">Test payment</h2>
            <span className="shopTopSpacer" />
          </header>
          <section className="pmCard">
            <p className="caption" style={{ marginTop: 0 }}>
              Demo mode (server PAYMENTS_DEMO_MODE): no Xendit redirect. Tap
              below to simulate a successful payment and confirm your order.
            </p>
            <p style={{ marginTop: 12 }}>
              <strong>Order #{demoCheckout.orderNumber}</strong> ·{' '}
              {formatRm(demoCheckout.totalCents)}
            </p>
            <button
              type="button"
              onClick={() => void handleCompleteDemoPayment()}
              disabled={demoCompleting}
            >
              {demoCompleting ? 'Completing…' : 'Complete test payment'}
            </button>
          </section>
        </>
      )}
    </>
  );
}

type AddToCartInput = {
  productId: string;
  name: string;
  imageUrl: string;
  unitPriceCents: number;
  qty: number;
  variantLabel?: string;
  notes?: string;
  deliveryClass?: DeliveryClass;
};

function ProductDetailScreen({
  product,
  onBack,
  onOpenCart,
  itemCount,
  addToCart,
  fulfillmentMethod,
  onFulfillmentMethod,
  deliveryInfo,
  unshippableNames,
  cartHasShippable,
  cashbackOf,
}: {
  product: Product;
  onBack: () => void;
  onOpenCart: () => void;
  itemCount: number;
  addToCart: (input: AddToCartInput) => void;
  fulfillmentMethod: FulfillmentMethod | null;
  onFulfillmentMethod: (m: FulfillmentMethod) => void;
  deliveryInfo: DeliveryInfo | null;
  /** Items already in the cart that can't be posted (cakes and the like); a parcel is off the table while they are there. */
  unshippableNames: string[];
  /** The cart already holds products that can be shipped. */
  cartHasShippable: boolean;
  /** Points / cashback a spend earns for this member (null: rate unknown). */
  cashbackOf: (amountSen: number) => Cashback | null;
}) {
  const cartHasCake = unshippableNames.length > 0;
  const shippingOn = deliveryInfo?.shippingEnabled !== false;
  const nationwide = deliveryClassForProduct(product) === 'NATIONWIDE';
  // Shipping chosen on a cookie page doesn't carry over to a product that can't be posted.
  const shownMethod = fulfillmentMethod === 'shipping' && !nationwide ? 'pickup' : fulfillmentMethod;
  const canShipThis = nationwide && !cartHasCake && deliveryInfo?.shippingEnabled !== false;
  const shipFee = deliveryInfo?.shippingFeeCents ?? 0;
  const freeOver = deliveryInfo?.freeShippingOverCents ?? 0;
  const variants = product.variants;
  const [variantId, setVariantId] = useState<string | null>(
    variants?.[0]?.id ?? null,
  );
  const [qty, setQty] = useState(1);

  const selectedVariant = variants?.find((v) => v.id === variantId);
  const unitCents = selectedVariant?.priceCents ?? product.basePriceCents;
  const variantLabel = selectedVariant?.label;
  const soldOut = isShopProductSoldOut(product);
  const maxQty =
    product.availableQty != null ? Math.max(1, product.availableQty) : 99;

  return (
    <>
      <header className="shopTopBar pmTopBar">
        <button
          type="button"
          className="textAction shopBackLink"
          onClick={onBack}
        >
          ← Browse
        </button>
        <h2 className="shopTitleCenter">Details</h2>
        <button
          type="button"
          className="shopCartBtn"
          onClick={onOpenCart}
          aria-label="Open cart"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M6 2h12l1.5 4H4.5z" />
            <path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
            <path d="M9 11h6" />
          </svg>
          {itemCount > 0 ? (
            <span className="shopCartBadge">
              {itemCount > 99 ? '99+' : itemCount}
            </span>
          ) : null}
        </button>
      </header>

      <article className="pmCard shopDetailCard">
        <div className="shopDetailHero">
          <ShippingBadge shippable={nationwide} />
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              className="shopDetailHeroInner"
              style={{
                objectPosition: `${product.imageOffsetX ?? 50}% ${product.imageOffsetY ?? 50}%`,
                transform: `scale(${product.imageScale ?? 1})`,
                transformOrigin: `${product.imageOffsetX ?? 50}% ${product.imageOffsetY ?? 50}%`,
              }}
            />
          ) : null}
        </div>
        <div className="shopDetailBody">
          <h2>{product.name}</h2>
          <p className="shopDetailPrice">{formatRm(unitCents)}</p>
          <p className="caption" style={{ marginTop: 0 }}>
            {product.description}
          </p>
          {soldOut ? (
            <p className="shopSoldOutNotice">Sold out for now</p>
          ) : null}
          {variants?.length ? (
            <div className="shopFieldGrid">
              <span className="caption">Size / option</span>
              <div className="chips">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={variantId === v.id ? 'chip active' : 'chip'}
                    onClick={() => setVariantId(v.id)}
                  >
                    {v.label} · {formatRm(v.priceCents)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {!soldOut ? (
            <div className="shopFieldGrid">
              <span className="caption">How would you like to receive it?</span>
              <div className="shopFulfillmentRow">
                <button
                  type="button"
                  className={`chip shopFulfillmentChip shopFulfillOption${shownMethod === 'pickup' ? ' active' : ''}`}
                  onClick={() => onFulfillmentMethod('pickup')}
                >
                  <strong>Self pickup</strong>
                  <small>Collect at our shop</small>
                </button>
                {nationwide && shippingOn ? (
                  <button
                    type="button"
                    disabled={!canShipThis}
                    title={canShipThis ? undefined : `Can't ship while ${unshippableNames.join(', ')} is in your cart`}
                    className={`chip shopFulfillmentChip shopFulfillOption shopFulfillOptionShip${shownMethod === 'shipping' ? ' active' : ''}`}
                    onClick={() => onFulfillmentMethod('shipping')}
                  >
                    <strong>Ship nationwide</strong>
                    <small>{canShipThis ? `+ ${formatRm(shipFee)} shipping` : 'Not with items in your cart'}</small>
                  </button>
                ) : null}
              </div>
              {nationwide && deliveryInfo?.shippingEnabled !== false ? (
                <p className="groupFulfilNote">
                  {cartHasCake
                    ? `Shipping isn't available while ${unshippableNames.join(', ')} ${unshippableNames.length === 1 ? 'is' : 'are'} in your cart, because ${unshippableNames.length === 1 ? 'it' : 'they'} can't be posted. Remove ${unshippableNames.length === 1 ? 'it' : 'them'} to ship these cookies, or order the cookies on their own.`
                    : `Shipping adds ${formatRm(shipFee)}${freeOver > 0 ? `, free when your order is over ${formatRm(freeOver)}` : ''}.`}
                </p>
              ) : !nationwide ? (
                <p className="groupFulfilNote">Cakes are fresh, so they are for pickup at our shop only. You can send your own courier to collect.</p>
              ) : null}
              <p className="groupFulfilNote">You can change this again at checkout.</p>
            </div>
          ) : null}
          <div className="shopQtyRow">
            <span className="caption">Quantity</span>
            <div className="shopStepper">
              <button
                type="button"
                className="ghost"
                disabled={soldOut}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span>{qty}</span>
              <button
                type="button"
                className="ghost"
                disabled={soldOut}
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            disabled={soldOut}
            onClick={() => {
              // Cakes and cookies in one order can't be shipped: say so before it happens.
              const mixes = nationwide ? cartHasCake : cartHasShippable;
              if (
                mixes &&
                !window.confirm(
                  nationwide
                    ? "Your cart has items that can't be shipped (" + unshippableNames.join(', ') + ").\n\nWith these cookies in the same order, nationwide shipping isn't available. The whole order will be Self pickup only.\n\nAdd to cart anyway?"
                    : "Your cart has items that can be shipped nationwide.\n\n" + product.name + " is for pickup only, so with it in the same order nationwide shipping isn't available. The whole order will be Self pickup only.\n\nAdd to cart anyway?",
                )
              ) {
                return;
              }
              addToCart({
                productId: product.id,
                name: product.name,
                imageUrl: product.imageUrl,
                unitPriceCents: unitCents,
                qty,
                variantLabel,
                deliveryClass: deliveryClassForProduct(product),
              });
              onOpenCart();
            }}
          >
            {soldOut
              ? 'Sold out'
              : `Add to cart · ${formatRm(unitCents * qty)}`}
          </button>
          {!soldOut ? <CashbackNote cashback={cashbackOf(unitCents * qty)} /> : null}
        </div>
      </article>
    </>
  );
}

function CartScreen({
  cart,
  groups,
  fulfillmentMethod,
  appliedVoucher,
  appliedReward,
  onBack,
  onContinueShopping,
  onCheckout,
  setLineQty,
  removeLine,
}: {
  cart: CartLine[];
  /** The cart split by where each product can go; empty groups are left out. */
  groups: { cls: DeliveryClass; lines: CartLine[] }[];
  /** Chosen on the product page; can be changed again at checkout. */
  fulfillmentMethod: FulfillmentMethod | null;
  appliedVoucher: MockVoucher | null;
  appliedReward: MockReward | null;
  onBack: () => void;
  onContinueShopping: () => void;
  onCheckout: () => void;
  setLineQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
}) {
  const subtotal = cartSubtotalCents(cart);
  const discount = computeDiscountCents(subtotal, appliedVoucher, appliedReward);
  const mixed = groups.length > 1;
  const methodLabel = fulfillmentMethod === 'shipping' ? 'Ship nationwide' : 'Self pickup';

  const renderLine = (l: CartLine) => (
    <CartLineRow key={l.lineId} line={l} setLineQty={setLineQty} removeLine={removeLine} />
  );

  return (
    <>
      <header className="shopTopBar pmTopBar">
        <button
          type="button"
          className="textAction shopBackLink"
          onClick={onBack}
        >
          ← Shop
        </button>
        <h2 className="shopTitleCenter">Cart</h2>
        <span className="shopTopSpacer" />
      </header>

      {cart.length === 0 ? (
        <section className="pmCard shopCartEmpty">
          <p className="caption">Your cart is empty.</p>
          <button type="button" onClick={onContinueShopping}>
            Browse products
          </button>
        </section>
      ) : (
        <>
          {groups.map((g) => {
            const label = DELIVERY_CLASS_LABELS[g.cls];
            return (
              <section key={g.cls} className="shopCartGroup">
                {mixed ? (
                  <div className="shopCartGroupHead">
                    <h3 className="shopSectionTitle">{label.title}</h3>
                    <span
                      className={
                        g.cls === 'NATIONWIDE'
                          ? 'shopCartGroupTag shopCartGroupTagOk'
                          : 'shopCartGroupTag'
                      }
                    >
                      {label.tag}
                    </span>
                  </div>
                ) : null}
                <div className="shopCartList">{g.lines.map(renderLine)}</div>
              </section>
            );
          })}

          <section className="pmCard shopSummaryCard">
            {appliedVoucher ? (
              <p className="caption">
                Voucher: <strong>{appliedVoucher.title}</strong>
              </p>
            ) : null}
            {appliedReward ? (
              <p className="caption">
                Reward: <strong>{appliedReward.title}</strong>
              </p>
            ) : null}
            <p className="caption" style={{ marginTop: 0 }}>
              Receive by: <strong>{methodLabel}</strong> · you can change this at
              checkout.
            </p>
            {mixed ? (
              <div className="shopNotice" role="note">
                <strong>Self pickup only</strong>
                <span>
                  Your cart has both cakes and cookies, so nationwide shipping
                  isn&apos;t available for this order. To ship cookies, order them
                  on their own.
                </span>
              </div>
            ) : null}
            <div className="shopSummaryTotals">
              <div>
                <span>Subtotal</span>
                <span>{formatRm(subtotal)}</span>
              </div>
              {discount > 0 ? (
                <div className="discountLine">
                  <span>Discount</span>
                  <span>−{formatRm(discount)}</span>
                </div>
              ) : null}
              <div className="totalLine">
                <span>Total</span>
                <span>{formatRm(subtotal - discount)}</span>
              </div>
            </div>
            <div className="row shopCartActions">
              <button
                type="button"
                className="ghost"
                onClick={onContinueShopping}
              >
                Continue
              </button>
              <button type="button" onClick={onCheckout}>
                Checkout
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}

/** One cart item with its quantity stepper and Remove, in the cart and at checkout. */
function CartLineRow({
  line: l,
  setLineQty,
  removeLine,
}: {
  line: CartLine;
  setLineQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
}) {
  return (
    <div className="pmCard shopCartLine">
      <div
        className="shopCartThumb"
        style={{ backgroundImage: `url("${l.imageUrl}")` }}
      />
      <div className="shopCartLineBody">
        <strong>{l.name}</strong>
        {l.variantLabel ? <span className="caption">{l.variantLabel}</span> : null}
        <div className="shopCartLineFoot">
          <div className="shopStepper">
            <button type="button" className="ghost" onClick={() => setLineQty(l.lineId, l.qty - 1)}>
              −
            </button>
            <span>{l.qty}</span>
            <button type="button" className="ghost" onClick={() => setLineQty(l.lineId, l.qty + 1)}>
              +
            </button>
          </div>
          <span className="shopLineTotal">{formatRm(l.unitPriceCents * l.qty)}</span>
        </div>
        <button type="button" className="textAction shopRemoveLine" onClick={() => removeLine(l.lineId)}>
          Remove
        </button>
      </div>
    </div>
  );
}

export function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z" />
      <path d="M3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" />
      <path d="M18 17v1a3 3 0 0 1-3 3h-3" />
    </svg>
  );
}

function ClampedDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="productDesc">
      <p ref={ref}>{text}</p>
      {/* Always rendered so every card keeps the same height; hidden when not needed. */}
      <span
        className="productDescMore"
        style={overflowing ? undefined : { visibility: 'hidden' }}
        aria-hidden={!overflowing}
      >
        more...
      </span>
    </div>
  );
}

/** Top-right tag on a product photo: can it be posted anywhere, or is it for pickup / nearby delivery only? */
function ShippingBadge({ shippable }: { shippable: boolean }) {
  return (
    <span
      className={shippable ? 'shipBadge shipBadgeOk' : 'shipBadge'}
      title={
        shippable
          ? 'Can be shipped anywhere in Malaysia'
          : 'Pickup only'
      }
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {shippable ? (
          <>
            <path d="M3 7h11v9H3z" />
            <path d="M14 10h4l3 3v3h-7z" />
            <circle cx="7" cy="18" r="1.6" />
            <circle cx="17" cy="18" r="1.6" />
          </>
        ) : (
          <>
            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
            <circle cx="12" cy="10" r="2.4" />
          </>
        )}
      </svg>
      {shippable ? 'Ships nationwide' : 'Local only'}
    </span>
  );
}

/**
 * "Earn 82 pts · RM8.20 member cashback". Points are only credited to signed-in
 * members, after payment; Gold / Platinum members see their boosted rate.
 */
function CashbackNote({ cashback }: { cashback: Cashback | null }) {
  if (!cashback || cashback.points <= 0) return null;
  const boost = cashback.multiplier > 1 ? ` (${cashback.multiplier}×)` : '';
  return (
    <p className="shopCashback">
      <span className="shopCashbackIcon" aria-hidden>★</span>
      Earn {cashback.points} pts{boost} · {formatRm(cashback.valueSen)} member cashback
    </p>
  );
}

/** Product-list badge: points only — the RM value is on the product page. */
function PointsPill({ cashback }: { cashback: Cashback | null }) {
  if (!cashback || cashback.points <= 0) return <span />;
  return (
    <span
      className="productPointsPill"
      title={cashback.multiplier > 1 ? `Your tier earns ${cashback.multiplier}×` : undefined}
    >
      <span className="productPointsStar" aria-hidden>★</span>
      Earn {cashback.points} pts
    </span>
  );
}
