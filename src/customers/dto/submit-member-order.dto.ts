import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
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

export class SubmitMemberOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalCents!: number;

  @IsOptional()
  fulfillmentSummary?: string[] | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MemberOrderLineDto)
  lines!: MemberOrderLineDto[];
}
