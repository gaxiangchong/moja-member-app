import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SegmentFiltersDto } from './segment-filters.dto';

export class CampaignRunDto {
  @IsOptional()
  @IsUUID()
  audienceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentFiltersDto)
  filters?: SegmentFiltersDto;

  @IsIn(['push_voucher', 'wallet_bonus', 'points_bonus'])
  action!: 'push_voucher' | 'wallet_bonus' | 'points_bonus';

  /** push_voucher: { voucherCode }; wallet_bonus: { amountCents, reason }; points_bonus: { deltaPoints, reason } */
  payload!: Record<string, unknown>;
}
