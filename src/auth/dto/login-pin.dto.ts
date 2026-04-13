import { IsString, Length, Matches, MinLength } from 'class-validator';

export class LoginPinDto {
  @IsString()
  @MinLength(5)
  phone!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'PIN must be 6 digits' })
  pin!: string;
}
