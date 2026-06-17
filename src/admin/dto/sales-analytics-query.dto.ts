import { IsDateString, IsIn, IsOptional } from 'class-validator';

export type SalesAnalyticsCategory = 'cake' | 'bento';

export interface SalesAnalyticsResult {
  meta: {
    from: string;
    to: string;
    bucket: 'day' | 'week' | 'month';
    category: SalesAnalyticsCategory;
    generatedAt: string;
  };
  series: Array<{
    periodStart: string;
    orderCount: number;
    gmvCents: number;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    qtySold: number;
    revenueCents: number;
    orders: number;
  }>;
  bestSeller: {
    productId: string;
    name: string;
    qtySold: number;
    revenueCents: number;
    orders: number;
  } | null;
  summary: {
    completedOrders: number;
    totalGmvCents: number;
    averageOrderValueCents: number;
    openOrdersPlacedInRange: number;
    loyaltyPointsIssuedInRange: number;
    loyaltyPointsRedeemedInRange: number;
    storedWalletSpendCentsInRange: number;
    storedWalletTopUpCentsInRange: number;
    vouchersIssuedInRange: number;
    vouchersRedeemedInRange: number;
  };
}

export interface BentoMemberFunnelResult {
  meta: {
    from: string;
    to: string;
    bucket: 'day' | 'week' | 'month';
    generatedAt: string;
  };
  /** All-time totals (the full marketing funnel). */
  totals: {
    /** Every registered member (the Bento app shares the main member login). */
    totalMembers: number;
    /** Distinct members with at least one successful bento payment. */
    paidMembers: number;
    /** Total successful bento payments (repeat buyers counted each time). */
    payingTransactions: number;
    /** Lifetime successful bento revenue, in cents. */
    totalGmvCents: number;
    /** paidMembers / totalMembers, 0..1. */
    conversionRate: number;
  };
  /** Deltas scoped to the selected from/to window. */
  inRange: {
    newMembers: number;
    newPaidMembers: number;
    payments: number;
    gmvCents: number;
  };
  /** Registrations vs payments per bucket, for the funnel chart. */
  series: Array<{
    periodStart: string;
    registrations: number;
    payments: number;
    gmvCents: number;
  }>;
}

export interface BentoTransactionRow {
  paymentIntentId: string;
  paidAt: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  packageCode: string | null;
  packageLabel: string | null;
  mealOption: string | null;
  amountCents: number;
}

export class SalesAnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  bucket?: 'day' | 'week' | 'month';

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';

  /** Cake = shop catalogue orders; Bento = successful bento subscription payments. */
  @IsOptional()
  @IsIn(['cake', 'bento'])
  category?: SalesAnalyticsCategory;
}
