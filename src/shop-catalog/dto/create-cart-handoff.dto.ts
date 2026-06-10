import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartHandoffLineDto {
  @IsString()
  @MaxLength(120)
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  variantId?: string | null;

  @IsString()
  @MaxLength(200)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  variantLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string | null;
}

export class CartHandoffFulfillmentDto {
  /** Fulfilment mode chosen on the public shop site. Only `pickup` is offered at the moment. */
  @IsOptional()
  @IsIn(['pickup'])
  method?: 'pickup';

  /**
   * Preferred slot start time in 24h HH:mm. Member-app prefills
   * `pickupTime` / `deliveryPickupTime` with this value.
   */
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'preferredTime must be HH:mm (24h)',
  })
  preferredTime?: string | null;

  /** Original human-readable slot label shown on the shop site (for display only). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredTimeLabel?: string | null;
}

export class CreateCartHandoffDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartHandoffLineDto)
  lines!: CartHandoffLineDto[];

  /** Optional shop page the user came from (for audit). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsUrl({ require_tld: false })
  sourceUrl?: string;

  /** Delivery / pickup selection synced from the public shop site. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CartHandoffFulfillmentDto)
  fulfillment?: CartHandoffFulfillmentDto;
}
