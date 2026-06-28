import { IsDateString } from 'class-validator';

export class AdminDailyCommerceDateDto {
  @IsDateString()
  date!: string;
}
