import type { SalesChannel } from './dto/unified-transactions-query.dto';

export type ChannelTotals = {
  channel: SalesChannel;
  revenueCents: number;
  orders: number;
  averageOrderValueCents: number;
  refundsCents: number;
};

export type FinanceSeriesPoint = {
  periodStart: string;
  posRevenueCents: number;
  onlineShopRevenueCents: number;
  bentoRevenueCents: number;
  totalRevenueCents: number;
  totalOrders: number;
};

export type FinanceOverviewResult = {
  meta: {
    from: string;
    to: string;
    bucket: 'day' | 'week' | 'month';
    generatedAt: string;
    previousFrom: string;
    previousTo: string;
  };
  totals: {
    revenueCents: number;
    orders: number;
    averageOrderValueCents: number;
    refundsCents: number;
    netRevenueCents: number;
  };
  previous: {
    revenueCents: number;
    orders: number;
  };
  deltas: {
    /** (current - previous) / previous, null when previous is 0. */
    revenuePct: number | null;
    ordersPct: number | null;
  };
  byChannel: ChannelTotals[];
  series: FinanceSeriesPoint[];
  paymentMethods: Array<{
    method: string;
    revenueCents: number;
    count: number;
  }>;
  refunds: {
    posCents: number;
    posCount: number;
    bentoCents: number;
    bentoCount: number;
    totalCents: number;
  };
  topProducts: Array<{
    channel: SalesChannel;
    productId: string;
    name: string;
    qtySold: number;
    revenueCents: number;
  }>;
};

export type UnifiedTransactionRow = {
  channel: SalesChannel;
  id: string;
  occurredAt: string;
  amountCents: number;
  paymentMethod: string | null;
  reference: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
};

export type UnifiedTransactionsResult = {
  meta: {
    from: string;
    to: string;
    generatedAt: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  totalsInFilter: {
    amountCents: number;
    count: number;
  };
  transactions: UnifiedTransactionRow[];
};
