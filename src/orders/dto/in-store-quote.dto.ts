import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InStoreQuoteLineDto {
  @IsString()
  @MaxLength(160)
  productId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  variantLabel?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;
}

/** The cart, to ask whether it can be collected in store today. */
export class InStoreQuoteDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => InStoreQuoteLineDto)
  lines!: InStoreQuoteLineDto[];
}
