import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CATEGORY_LABELS,
  type CartLine,
  type MockReward,
  type MockVoucher,
  type Product,
  type ProductCategory,
} from './types';
import { formatRm, MOCK_REWARDS, MOCK_VOUCHERS } from './data/mockCatalog';
import { fulfillmentSummaryLines, validateCheckout } from './lib/checkoutValidation';
import { useOrderHistoryStore } from './store/useOrderHistoryStore';
import { useShopStore } from './store/useShopStore';
import {
  completeDemoShopOrder,
  createXenditCardTokenSession,
  createShopOrderCheckout,
  fetchShopCatalogProducts,
  fetchXenditShopChannels,
  getXenditCardTokenSessionStatus,
} from '../api';

const PICKUP_TIMES = [
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
];

const DELIVERY_PRESETS = ['GrabFood', 'Foodpanda', 'Lalamove', 'Other'] as const;

type Screen = 'browse' | 'product' | 'cart' | 'checkout' | 'paymentDemo';
type PaymentMethodMode = 'channel' | 'card_token';

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

function paymentChannelIcon(code: string): string {
  if (code === 'TOUCHNGO' || code === 'TOUCHNGO_MY') return 'TnG';
  if (code === 'SHOPEEPAY' || code === 'SHOPEEPAY_MY') return 'SP';
  if (code === 'FPX' || code === 'FPX_MY') return 'FPX';
  return 'PAY';
}

export function ShopFlow({ pointsBalance }: { pointsBalance: number }) {
  const [screen, setScreen] = useState<Screen>('browse');
  const [productId, setProductId] = useState<string | null>(null);
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [checkoutErrors, setCheckoutErrors] = useState<string[] | null>(null);
  const [deliveryOther, setDeliveryOther] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [channels, setChannels] = useState<Array<{ code: string; label: string }>>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [selectedChannelCode, setSelectedChannelCode] = useState('');
  const [paymentMethodMode, setPaymentMethodMode] = useState<PaymentMethodMode>('channel');
  const [cardPaymentTokenId, setCardPaymentTokenId] = useState('');
  const [cardSessionId, setCardSessionId] = useState<string | null>(null);
  const [cardSessionLoading, setCardSessionLoading] = useState(false);
  const [cardSessionError, setCardSessionError] = useState<string | null>(null);
  const [cardSubmitReady, setCardSubmitReady] = useState(false);
  const [cardSubmitBusy, setCardSubmitBusy] = useState(false);
  const [cardInitAttempted, setCardInitAttempted] = useState(false);
  const [demoCheckout, setDemoCheckout] = useState<DemoCheckoutSnapshot | null>(null);
  const [demoCompleting, setDemoCompleting] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const xenditComponentsRef = useRef<{
    submit: () => void;
    addEventListener: (name: string, cb: () => void) => void;
    createChannelPickerComponent: () => HTMLElement;
  } | null>(null);
  const cardSessionIdRef = useRef<string | null>(null);

  const cart = useShopStore((s) => s.cart);
  const addToCart = useShopStore((s) => s.addToCart);
  const setLineQty = useShopStore((s) => s.setLineQty);
  const removeLine = useShopStore((s) => s.removeLine);
  const fulfillmentMethod = useShopStore((s) => s.fulfillmentMethod);
  const setFulfillmentMethod = useShopStore((s) => s.setFulfillmentMethod);
  const pickupDate = useShopStore((s) => s.pickupDate);
  const setPickupDate = useShopStore((s) => s.setPickupDate);
  const pickupTime = useShopStore((s) => s.pickupTime);
  const setPickupTime = useShopStore((s) => s.setPickupTime);
  const deliveryCompany = useShopStore((s) => s.deliveryCompany);
  const setDeliveryCompany = useShopStore((s) => s.setDeliveryCompany);
  const deliveryPickupTime = useShopStore((s) => s.deliveryPickupTime);
  const setDeliveryPickupTime = useShopStore((s) => s.setDeliveryPickupTime);
  const appliedVoucher = useShopStore((s) => s.appliedVoucher);
  const appliedReward = useShopStore((s) => s.appliedReward);
  const applyVoucher = useShopStore((s) => s.applyVoucher);
  const applyReward = useShopStore((s) => s.applyReward);
  const getSubtotalCents = useShopStore((s) => s.getSubtotalCents);
  const getDiscountCents = useShopStore((s) => s.getDiscountCents);
  const getTotalCents = useShopStore((s) => s.getTotalCents);
  const getCartItemCount = useShopStore((s) => s.getCartItemCount);
  const resetAfterOrder = useShopStore((s) => s.resetAfterOrder);

  const itemCount = getCartItemCount();
  const subtotal = getSubtotalCents();
  const discount = getDiscountCents();
  const total = getTotalCents();

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
        setCatalogError(err instanceof Error ? err.message : 'Failed to load products');
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
        setChannels(r.channels);
        setSelectedChannelCode((prev) => prev || r.channels[0]?.code || '');
      })
      .catch((err) => {
        if (!alive) return;
        setChannelsError(err instanceof Error ? err.message : 'Could not load payment methods');
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
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      return `${p.name} ${p.shortDescription}`.toLowerCase().includes(q);
    });
  }, [category, query, products]);

  const product = productId ? products.find((p) => p.id === productId) : undefined;

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
      xenditComponentsRef.current = components as typeof xenditComponentsRef.current;
      components.addEventListener('submission-ready', () => setCardSubmitReady(true));
      components.addEventListener('submission-not-ready', () => setCardSubmitReady(false));
      components.addEventListener('submission-begin', () => setCardSubmitBusy(true));
      components.addEventListener('submission-end', () => setCardSubmitBusy(false));
      components.addEventListener('session-expired-or-canceled', () => {
        setCardSessionError('Card tokenization session expired or canceled. Start a new one.');
      });
      components.addEventListener('fatal-error', () => {
        setCardSessionError(
          'Card form origin is not authorized for this session. Open checkout from the same HTTPS domain configured in XENDIT_COMPONENTS_ORIGINS.',
        );
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
          } catch (err) {
            setCardSessionError(
              err instanceof Error ? err.message : 'Could not fetch card token status.',
            );
          }
        })();
      });
      const picker = components.createChannelPickerComponent();
      if (cardContainerRef.current) {
        cardContainerRef.current.replaceChildren(picker);
      }
    } catch (err) {
      setCardSessionError(
        err instanceof Error ? err.message : 'Could not initialize card tokenization.',
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

  const handleTokenizeCard = () => {
    setCardSessionError(null);
    const sdk = xenditComponentsRef.current;
    if (!sdk) {
      setCardSessionError('Initialize card form first.');
      return;
    }
    try {
      sdk.submit();
    } catch (err) {
      setCardSessionError(err instanceof Error ? err.message : 'Card submission failed.');
    }
  };

  const handlePlaceOrder = async () => {
    const draft = {
      cart,
      fulfillmentMethod,
      pickupDate,
      pickupTime,
      deliveryCompany:
        deliveryCompany === 'Other' ? deliveryOther.trim() || null : deliveryCompany,
      deliveryPickupTime,
    };
    const { valid, errors } = validateCheckout(draft);
    if (!valid) {
      setCheckoutErrors(errors);
      return;
    }
    if (paymentMethodMode === 'channel' && !selectedChannelCode.trim()) {
      setCheckoutErrors(['Select a payment method.']);
      return;
    }
    if (paymentMethodMode === 'card_token' && !cardPaymentTokenId.trim()) {
      setCheckoutErrors(['Generate a card payment token first.']);
      return;
    }
    if (
      paymentMethodMode === 'card_token' &&
      !cardPaymentTokenId.trim().toLowerCase().startsWith('pt-')
    ) {
      setCheckoutErrors(['Card payment token ID must start with "pt-".']);
      return;
    }
    setCheckoutErrors(null);
    const lines = fulfillmentSummaryLines(
      draft.fulfillmentMethod,
      draft.pickupDate,
      draft.pickupTime,
      draft.deliveryCompany,
      draft.deliveryPickupTime,
    );
    const linePayload = cart.map((l) => ({
      productId: l.productId,
      name: l.name,
      imageUrl: l.imageUrl,
      unitPriceCents: l.unitPriceCents,
      qty: l.qty,
      variantLabel: l.variantLabel ?? null,
    }));
    setPlacingOrder(true);
    try {
      const result = await createShopOrderCheckout({
        ...(paymentMethodMode === 'card_token'
          ? { paymentTokenId: cardPaymentTokenId.trim() }
          : { channelCode: selectedChannelCode.trim() }),
        order: {
          totalCents: total,
          fulfillmentSummary: lines,
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
          `Order placed (no payment required)\n\nPickup code: ${o.orderNumber}\nTotal: ${formatRm(o.totalCents)}\n${lines.join('\n')}`,
        );
        resetAfterOrder();
        goBrowse();
        return;
      }

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      setCheckoutErrors([
        'No payment redirect URL. Use Xendit test keys and a valid channel, or enable PAYMENTS_DEMO_MODE for local test checkout.',
      ]);
    } catch (err) {
      setCheckoutErrors([err instanceof Error ? err.message : 'Checkout could not start.']);
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
        `Payment complete (test)\n\nPickup code: ${order.orderNumber}\nTotal: ${formatRm(order.totalCents)}\n${demoCheckout.fulfillmentSummary.join('\n')}`,
      );
      setDemoCheckout(null);
      resetAfterOrder();
      setScreen('browse');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not complete test payment.');
    } finally {
      setDemoCompleting(false);
    }
  };

  const selectDeliveryPreset = (p: (typeof DELIVERY_PRESETS)[number]) => {
    if (p === 'Other') {
      setDeliveryCompany('Other');
      return;
    }
    setDeliveryOther('');
    setDeliveryCompany(p);
  };

  return (
    <>
      {screen === 'browse' && (
        <>
          <header className="shopTopBar pmTopBar">
            <h2>Shop</h2>
            <button type="button" className="shopCartBtn" onClick={openCart} aria-label="Open cart">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 2h12l1.5 4H4.5z" />
                <path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                <path d="M9 11h6" />
              </svg>
              {itemCount > 0 ? <span className="shopCartBadge">{itemCount > 99 ? '99+' : itemCount}</span> : null}
            </button>
          </header>
          <section className="pmCard shopSearchCard">
            <input
              className="searchInput"
              style={{ marginBottom: 0 }}
              placeholder="Search cakes & drinks"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="chips shopCategoryChips">
              <button
                type="button"
                className={category === 'all' ? 'chip active' : 'chip'}
                onClick={() => setCategory('all')}
              >
                All
              </button>
              {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={category === c ? 'chip active' : 'chip'}
                  onClick={() => setCategory(c)}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
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
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                className="productCard shopProductHit"
                onClick={() => openProduct(p.id)}
              >
                <div
                  className="productImage"
                  style={{ backgroundImage: `linear-gradient(180deg, rgba(20,16,14,0.06), rgba(20,16,14,0.35)), url("${p.imageUrl}")` }}
                />
                <div className="productBody">
                  <strong>{p.name}</strong>
                  <p>{p.shortDescription}</p>
                  <div className="productFoot">
                    <span>{formatRm(p.variants?.[0]?.priceCents ?? p.basePriceCents)}</span>
                    <span className="shopFromLabel">from</span>
                  </div>
                </div>
              </button>
            ))}
            {!filteredProducts.length ? (
              <section className="pmCard">
                <p className="caption">No products match your filters.</p>
              </section>
            ) : null}
          </div>
        </>
      )}

      {screen === 'product' && product && (
        <ProductDetailScreen product={product} onBack={goBrowse} onOpenCart={openCart} itemCount={itemCount} addToCart={addToCart} />
      )}

      {screen === 'cart' && (
        <CartScreen
          cart={cart}
          subtotal={subtotal}
          discount={discount}
          total={total}
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
            <button type="button" className="textAction shopBackLink" onClick={openCart}>
              ← Cart
            </button>
            <h2 className="shopTitleCenter">Checkout</h2>
            <span className="shopTopSpacer" />
          </header>

          {checkoutErrors?.length ? (
            <div className="shopErrorBox" role="alert">
              {checkoutErrors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          ) : null}

          <section className="pmCard">
            <h3 className="shopSectionTitle">Fulfillment</h3>
            <div className="shopFulfillmentRow">
              <button
                type="button"
                className={fulfillmentMethod === 'in_store' ? 'chip active shopFulfillmentChip' : 'chip shopFulfillmentChip'}
                onClick={() => setFulfillmentMethod('in_store')}
              >
                In store · now
              </button>
              <button
                type="button"
                className={fulfillmentMethod === 'pickup' ? 'chip active shopFulfillmentChip' : 'chip shopFulfillmentChip'}
                onClick={() => setFulfillmentMethod('pickup')}
              >
                Self pickup
              </button>
              <button
                type="button"
                className={
                  fulfillmentMethod === 'delivery' ? 'chip active shopFulfillmentChip' : 'chip shopFulfillmentChip'
                }
                onClick={() => setFulfillmentMethod('delivery')}
              >
                Delivery
              </button>
            </div>
            {fulfillmentMethod === 'in_store' ? (
              <p className="caption" style={{ marginTop: 8, marginBottom: 0 }}>
                We will prepare this order right away at the counter. Show your order QR when you collect.
              </p>
            ) : null}
            {fulfillmentMethod === 'pickup' ? (
              <div className="shopFieldGrid">
                <label htmlFor="pickupDate">Pickup date</label>
                <input
                  id="pickupDate"
                  type="date"
                  min={todayIsoDate()}
                  value={pickupDate ?? ''}
                  onChange={(e) => setPickupDate(e.target.value || null)}
                />
                <label htmlFor="pickupTime">Pickup time</label>
                <select
                  id="pickupTime"
                  value={pickupTime ?? ''}
                  onChange={(e) => setPickupTime(e.target.value || null)}
                >
                  <option value="">Select time</option>
                  {PICKUP_TIMES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {fulfillmentMethod === 'delivery' ? (
              <div className="shopFieldGrid">
                <span className="caption" style={{ marginBottom: 4 }}>
                  Platform / company
                </span>
                <div className="chips">
                  {DELIVERY_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={deliveryCompany === p ? 'chip active' : 'chip'}
                      onClick={() => selectDeliveryPreset(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {deliveryCompany === 'Other' ? (
                  <>
                    <label htmlFor="deliveryOther">Custom name</label>
                    <input
                      id="deliveryOther"
                      placeholder="e.g. Borong rider"
                      value={deliveryOther}
                      onChange={(e) => setDeliveryOther(e.target.value)}
                    />
                  </>
                ) : null}
                <label htmlFor="riderTime">Expected rider pickup</label>
                <input
                  id="riderTime"
                  type="time"
                  value={deliveryPickupTime ?? ''}
                  onChange={(e) => setDeliveryPickupTime(e.target.value || null)}
                />
              </div>
            ) : null}
          </section>

          <section className="pmCard">
            <h3 className="shopSectionTitle">Voucher or reward</h3>
            <p className="caption" style={{ marginTop: 0 }}>
              Apply one voucher or one points reward — not both.
            </p>
            <div className="shopPromoGrid">
              <div>
                <p className="caption">Vouchers</p>
                <div className="shopPromoList">
                  {MOCK_VOUCHERS.map((v: MockVoucher) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`shopPromoItem ${appliedVoucher?.id === v.id ? 'active' : ''}`}
                      onClick={() => applyVoucher(appliedVoucher?.id === v.id ? null : v)}
                    >
                      <strong>{v.title}</strong>
                      <small>{v.code}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="caption">Rewards ({pointsBalance} pts)</p>
                <div className="shopPromoList">
                  {MOCK_REWARDS.map((r: MockReward) => {
                    const affordable = pointsBalance >= r.pointsCost;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        disabled={!affordable}
                        className={`shopPromoItem ${appliedReward?.id === r.id ? 'active' : ''}`}
                        onClick={() => applyReward(appliedReward?.id === r.id ? null : r)}
                      >
                        <strong>{r.title}</strong>
                        <small>{r.pointsCost} pts · up to {formatRm(r.valueCents)}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {(appliedVoucher || appliedReward) && (
              <button type="button" className="ghost shopClearPromo" onClick={() => {
                applyVoucher(null);
                applyReward(null);
              }}>
                Clear promotion
              </button>
            )}
          </section>

          <section className="pmCard">
            <h3 className="shopSectionTitle">Payment</h3>
            <p className="caption" style={{ marginTop: 0 }}>
              Pick a channel (Xendit supports many methods per country). You will complete payment on the secure Xendit page
              (use test keys in the dashboard for test cards and wallets).
            </p>
            <div className="shopFieldGrid" style={{ marginTop: 8 }}>
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
            {channelsLoading ? <p className="caption">Loading payment methods…</p> : null}
            {channelsError ? <p className="err">{channelsError}</p> : null}
            {paymentMethodMode === 'channel' && !channelsLoading && !channelsError && channels.length ? (
              <div className="shopFieldGrid" style={{ marginTop: 8 }}>
                <p className="caption" style={{ marginTop: 0, marginBottom: 4 }}>
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
                          border: active ? '1px solid #5b6cff' : '1px solid rgba(255,255,255,0.12)',
                          background: active ? 'rgba(91,108,255,0.12)' : 'rgba(255,255,255,0.03)',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                          color: 'var(--text, #1a1a1a)',
                        }}
                      >
                        <span
                          style={{
                            minWidth: 42,
                            height: 24,
                            borderRadius: 999,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 0.3,
                            background: 'rgba(255,255,255,0.16)',
                          }}
                        >
                          {paymentChannelIcon(c.code)}
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                          <strong style={{ fontSize: 13, color: 'var(--primary,rgb(34, 44, 229))' }}>{c.label}</strong>
                          <small className="caption" style={{ margin: 0, color: 'rgba(26,26,26,0.72)' }}>
                            {c.code}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : paymentMethodMode === 'channel' && !channelsLoading && !channelsError ? (
              <p className="caption">No channels configured. Set XENDIT_SHOP_CHANNEL_CODES on the server.</p>
            ) : null}
            {paymentMethodMode === 'card_token' ? (
              <div className="shopFieldGrid" style={{ marginTop: 8 }}>
                <p className="caption" style={{ marginTop: 0 }}>
                  Fill in card details below, then click "Use this card" to proceed.
                </p>
                {cardSessionError ? <p className="err">{cardSessionError}</p> : null}
                {cardSessionLoading ? <p className="caption">Preparing secure card form...</p> : null}
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
                <button
                  type="button"
                  onClick={handleTokenizeCard}
                  disabled={!cardSessionId || !cardSubmitReady || cardSubmitBusy}
                >
                  {cardSubmitBusy ? 'Tokenizing...' : 'Use this card'}
                </button>
                {cardPaymentTokenId ? (
                  <p className="caption" style={{ marginTop: 0 }}>
                    Token ready: {cardPaymentTokenId}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="pmCard shopSummaryCard">
            <h3 className="shopSectionTitle">Order summary</h3>
            <ul className="shopSummaryList">
              {cart.map((l) => (
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
              <div className="totalLine">
                <span>Total</span>
                <span>{formatRm(total)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handlePlaceOrder()}
              disabled={
                placingOrder ||
                (paymentMethodMode === 'channel' &&
                  (channelsLoading || (!channels.length && !channelsLoading))) ||
                (paymentMethodMode === 'card_token' && !cardPaymentTokenId.trim())
              }
            >
              {placingOrder ? 'Starting payment…' : 'Continue to payment'}
            </button>
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
              Demo mode (server PAYMENTS_DEMO_MODE): no Xendit redirect. Tap below to simulate a successful payment and
              confirm your order.
            </p>
            <p style={{ marginTop: 12 }}>
              <strong>Order #{demoCheckout.orderNumber}</strong> · {formatRm(demoCheckout.totalCents)}
            </p>
            <button type="button" onClick={() => void handleCompleteDemoPayment()} disabled={demoCompleting}>
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
};

function ProductDetailScreen({
  product,
  onBack,
  onOpenCart,
  itemCount,
  addToCart,
}: {
  product: Product;
  onBack: () => void;
  onOpenCart: () => void;
  itemCount: number;
  addToCart: (input: AddToCartInput) => void;
}) {
  const variants = product.variants;
  const [variantId, setVariantId] = useState<string | null>(variants?.[0]?.id ?? null);
  const [qty, setQty] = useState(1);

  const selectedVariant = variants?.find((v) => v.id === variantId);
  const unitCents = selectedVariant?.priceCents ?? product.basePriceCents;
  const variantLabel = selectedVariant?.label;

  return (
    <>
      <header className="shopTopBar pmTopBar">
        <button type="button" className="textAction shopBackLink" onClick={onBack}>
          ← Browse
        </button>
        <h2 className="shopTitleCenter">Details</h2>
        <button type="button" className="shopCartBtn" onClick={onOpenCart} aria-label="Open cart">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 2h12l1.5 4H4.5z" />
            <path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
            <path d="M9 11h6" />
          </svg>
          {itemCount > 0 ? <span className="shopCartBadge">{itemCount > 99 ? '99+' : itemCount}</span> : null}
        </button>
      </header>

      <article className="pmCard shopDetailCard">
        <div
          className="shopDetailHero"
          style={{ backgroundImage: `linear-gradient(180deg, rgba(20,16,14,0.02), rgba(20,16,14,0.45)), url("${product.imageUrl}")` }}
        />
        <div className="shopDetailBody">
          <h2>{product.name}</h2>
          <p className="shopDetailPrice">{formatRm(unitCents)}</p>
          <p className="caption" style={{ marginTop: 0 }}>
            {product.description}
          </p>
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
          <div className="shopQtyRow">
            <span className="caption">Quantity</span>
            <div className="shopStepper">
              <button type="button" className="ghost" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                −
              </button>
              <span>{qty}</span>
              <button type="button" className="ghost" onClick={() => setQty((q) => Math.min(99, q + 1))}>
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              addToCart({
                productId: product.id,
                name: product.name,
                imageUrl: product.imageUrl,
                unitPriceCents: unitCents,
                qty,
                variantLabel,
              });
              onOpenCart();
            }}
          >
            Add to cart · {formatRm(unitCents * qty)}
          </button>
        </div>
      </article>
    </>
  );
}

function CartScreen({
  cart,
  subtotal,
  discount,
  total,
  appliedVoucher,
  appliedReward,
  onBack,
  onContinueShopping,
  onCheckout,
  setLineQty,
  removeLine,
}: {
  cart: CartLine[];
  subtotal: number;
  discount: number;
  total: number;
  appliedVoucher: MockVoucher | null;
  appliedReward: MockReward | null;
  onBack: () => void;
  onContinueShopping: () => void;
  onCheckout: () => void;
  setLineQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
}) {
  return (
    <>
      <header className="shopTopBar pmTopBar">
        <button type="button" className="textAction shopBackLink" onClick={onBack}>
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
          <div className="shopCartList">
            {cart.map((l) => (
              <div key={l.lineId} className="pmCard shopCartLine">
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
            ))}
          </div>

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
                <span>{formatRm(total)}</span>
              </div>
            </div>
            <div className="row shopCartActions">
              <button type="button" className="ghost" onClick={onContinueShopping}>
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
