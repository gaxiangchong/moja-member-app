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
  IsOptional,
  IsString,
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
