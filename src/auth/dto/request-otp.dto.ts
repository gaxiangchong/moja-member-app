import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MinLength(5)
  phone!: string;

  /** When omitted, the server infers register vs recovery from the phone record. */
  @IsOptional()
  @IsIn(['register', 'recovery'])
  purpose?: 'register' | 'recovery';
}
