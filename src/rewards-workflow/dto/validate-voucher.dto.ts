import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ValidateVoucherDto {
  @IsString()
  @MaxLength(64)
  voucherId!: string;

  @IsInt()
  @Min(0)
  orderTotalCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;
}
