import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * An admin changing their **own** password. Requires the current one, so a
 * borrowed browser session cannot be used to lock the real owner out.
 */
export class ChangeAdminPasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword!: string;
}
