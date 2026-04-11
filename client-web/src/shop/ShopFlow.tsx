import { useEffect, useMemo, useState } from 'react';

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
import { fetchShopCatalogProducts } from '../api';

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

type Screen = 'browse' | 'product' | 'cart' | 'checkout';

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

  const handlePlaceOrder = () => {
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
    setCheckoutErrors(null);
    const lines = fulfillmentSummaryLines(
      draft.fulfillmentMethod,
      draft.pickupDate,
      draft.pickupTime,
      draft.deliveryCompany,
      draft.deliveryPickupTime,
    );
    useOrderHistoryStore.getState().addOrder({
      lines: cart.map((l) => ({
        productId: l.productId,
        name: l.name,
        imageUrl: l.imageUrl,
        unitPriceCents: l.unitPriceCents,
        qty: l.qty,
        variantLabel: l.variantLabel,
      })),
      totalCents: total,
      fulfillmentSummary: lines,
    });
    window.alert(
      `Order placed (demo)\n\nTotal: ${formatRm(total)}\n${lines.join('\n')}\n\nPayment step would follow in production.`,
    );
    resetAfterOrder();
    goBrowse();
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
                  {MOCK_VOUCHERS.map((v) => (
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
                  {MOCK_REWARDS.map((r) => {
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
            <p className="caption">Payment is a placeholder in this demo build.</p>
            <button type="button" onClick={handlePlaceOrder}>
              Place order
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
        <section className="pmCard">
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
