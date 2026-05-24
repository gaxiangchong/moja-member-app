import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartHandoffLineDto {
  @IsString()
  @MaxLength(120)
  productId!: string;

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
}
