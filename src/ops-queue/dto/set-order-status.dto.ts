import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ORDER_STATUS } from '../../orders/order-status';

/** Statuses the kitchen/counter may move an order to. */
export const OPS_SETTABLE_STATUSES = [
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.CANCELLED,
] as const;

export class SetOrderStatusDto {
  @IsIn(OPS_SETTABLE_STATUSES as unknown as string[])
  status!: (typeof OPS_SETTABLE_STATUSES)[number];

  /** Why an order was cancelled — shown to the member and in the audit log. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  staffCode?: string;
}
