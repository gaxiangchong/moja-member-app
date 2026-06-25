import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BENTO_WEEKDAY_CODES } from '../../bento/bento-menu.service';

class BentoMealDishesDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  regular?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  veg?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  regularZh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vegZh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  image?: string;
}

class BentoWeekdayMenuDto {
  @IsIn(BENTO_WEEKDAY_CODES as unknown as string[])
  weekday!: string;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => BentoMealDishesDto)
  lunch?: BentoMealDishesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BentoMealDishesDto)
  dinner?: BentoMealDishesDto;
}

export class UpdateBentoMenuDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BentoWeekdayMenuDto)
  weekdays!: BentoWeekdayMenuDto[];
}
