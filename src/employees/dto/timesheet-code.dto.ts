import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TimesheetCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  employeeCode!: string;
}
