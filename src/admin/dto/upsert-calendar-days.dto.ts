import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { WorkCalendarDayType } from '@prisma/client';

export class CalendarDayItemDto {
  @IsDateString()
  date!: string;

  @IsEnum(WorkCalendarDayType)
  dayType!: WorkCalendarDayType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class UpsertCalendarDaysDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CalendarDayItemDto)
  days!: CalendarDayItemDto[];
}
