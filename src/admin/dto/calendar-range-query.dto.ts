import { IsDateString } from 'class-validator';

export class CalendarRangeQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
