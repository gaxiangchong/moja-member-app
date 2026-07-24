/** Snapshot passed from shop order finalization into SalesPlay online_orders. */
export type SalesplayOnlineOrderInput = {
  orderId: string;
  orderNumber: number;
  totalCents: number;
  placedAt: Date;
  fulfillmentSummaryLines: string[];
  lines: {
    productId: string;
    name: string;
    variantLabel: string | null;
    unitPriceCents: number;
    qty: number;
    /**
     * SalesPlay product code mapped in the shop catalog admin. When set it is
     * sent as `product_code` (instead of our catalog product id) so the order
     * lines match SalesPlay's own product catalog.
     */
    salesplayProductCode?: string | null;
  }[];
  customer: {
    displayName: string | null;
    phoneE164: string;
    email: string | null;
  };
};

export type SalesplayOnlineOrderPushResult = {
  systemUniqueId: string;
  orderReferenceId: string;
  orderReferenceNumber: string;
};

/** Query for one page of a paginated SalesPlay GET (pull sync). */
export type SalesplayPageQuery = {
  cursor?: string | null;
  limit?: number;
  /** Lower date bound (YYYY-MM-DD), when the resource supports date filtering. */
  fromDate?: string | null;
};

/** One page of records from a SalesPlay GET, with the forward cursor. */
export type SalesplayPage = {
  items: unknown[];
  /** Cursor for the next page, or null when this is the last page. */
  nextCursor: string | null;
};
