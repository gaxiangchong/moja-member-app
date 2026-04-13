import { IsString, Length, Matches, MinLength } from 'class-validator';

export class SetPinDto {
  @IsString()
  @MinLength(20)
  setupToken!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'PIN must be 6 digits' })
  pin!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'PIN confirmation must be 6 digits' })
  pinConfirm!: string;
}
