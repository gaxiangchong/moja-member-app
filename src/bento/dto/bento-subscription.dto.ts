import {
  BentoDinnerVariant,
  BentoMealOption,
  BentoPackageCode,
  BentoRiceType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BentoQuoteDto {
  @IsEnum(BentoPackageCode)
  packageCode!: BentoPackageCode;

  @IsEnum(BentoMealOption)
  mealOption!: BentoMealOption;

  @IsEnum(BentoDinnerVariant)
  lunchVariant!: BentoDinnerVariant;

  @IsEnum(BentoDinnerVariant)
  dinnerVariant!: BentoDinnerVariant;

  @IsEnum(BentoRiceType)
  riceType!: BentoRiceType;

  @IsBoolean()
  includeDrinkAddon!: boolean;

  /** Group-buy quantity (defaults to 1). Used for capacity checks before payment. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  sets?: number;
}

export class BentoCheckoutDto extends BentoQuoteDto {
  @IsOptional()
  @IsString()
  channelCode?: string;
}

export class BentoScheduleSlotDto {
  @IsDateString()
  date!: string;

  @IsBoolean()
  includeLunch!: boolean;

  @IsBoolean()
  includeDinner!: boolean;

  /**
   * How many lunch packs to collect this day (allows sharing). Defaults to
   * `includeLunch ? 1 : 0` when omitted, for backward compatibility.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  lunchQty?: number;

  /** How many dinner packs to collect this day. Defaults from `includeDinner`. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  dinnerQty?: number;
}

export class BentoScheduleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BentoScheduleSlotDto)
  slots!: BentoScheduleSlotDto[];
}

export class BentoWeeklyOptInDto {
  @IsBoolean()
  optedIn!: boolean;
}
