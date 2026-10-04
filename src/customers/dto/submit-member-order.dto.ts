import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class MemberOrderLineDto {
  @IsString()
  @MaxLength(120)
  productId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  variantLabel?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceCents!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string | null;
}

/** Where a delivery goes and who arranges the courier. Validated in `delivery.ts`. */
export class DeliveryDetailsDto {
  @IsString()
  @MaxLength(600)
  address!: string;

  @IsString()
  @MaxLength(160)
  contactName!: string;

  @IsString()
  @MaxLength(40)
  contactPhone!: string;

  /** Not needed for shipping, which Moja Maison always arranges. */
  @IsOptional()
  @IsIn(['SELF', 'MOJA'])
  arrangement?: 'SELF' | 'MOJA';
}

export class SubmitMemberOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountCents?: number;

  @IsOptional()
  fulfillmentSummary?: string[] | null;

  /** How the customer receives the order. Defaults to PICKUP server-side. */
  @IsOptional()
  @IsIn(['IN_STORE', 'PICKUP', 'DELIVERY'])
  fulfilmentType?: 'IN_STORE' | 'PICKUP' | 'DELIVERY';

  /**
   * Collection day (yyyy-mm-dd, shop timezone). Stock is reserved against this
   * date, so a cake ordered for Saturday does not consume today's count.
   * Omitted for in-store "prepare now" orders, which use today.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'scheduledDate must be yyyy-mm-dd',
  })
  scheduledDate?: string | null;

  /** Slot start in 24h HH:mm, matching the published pickup windows. */
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'scheduledSlot must be HH:mm (24h)',
  })
  scheduledSlot?: string | null;

  /**
   * With DELIVERY: LOCAL (a courier, the default) or SHIPPING (a parcel,
   * nationwide products only).
   */
  @IsOptional()
  @IsIn(['LOCAL', 'SHIPPING'])
  deliveryMethod?: 'LOCAL' | 'SHIPPING';

  /** Required when `fulfilmentType` is DELIVERY. */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryDetailsDto)
  delivery?: DeliveryDetailsDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MemberOrderLineDto)
  lines!: MemberOrderLineDto[];
}
