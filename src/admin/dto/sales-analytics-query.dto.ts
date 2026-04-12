import { IsDateString, IsIn, IsOptional } from 'class-validator';

export interface SalesAnalyticsResult {
  meta: {
    from: string;
    to: string;
    bucket: 'day' | 'week' | 'month';
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
}
