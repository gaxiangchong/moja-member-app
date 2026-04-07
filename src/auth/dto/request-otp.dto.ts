import { IsString, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MinLength(5)
  phone!: string;
}
