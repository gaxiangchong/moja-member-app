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
