import { IsString, Length, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MinLength(5)
  phone!: string;

  @IsString()
  @Length(4, 8)
  code!: string;
}
