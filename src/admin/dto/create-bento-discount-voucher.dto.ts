import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBentoDiscountVoucherDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Fixed amount off in sen (RM5 off = 500). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountOffCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSpendCents?: number;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  redemptionCap!: number;
}
