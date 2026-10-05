import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AdminBackfillLoyaltyDto {
  @IsInt()
  @Min(1)
  deltaPoints!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  /**
   * Identifier of the legacy purchase being credited (invoice / receipt no.).
   * When given, the same reference can only be backfilled once per member.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  legacyReference?: string;

  /** Set after the admin has seen a possible-duplicate warning and chose to continue. */
  @IsOptional()
  @IsBoolean()
  confirmDuplicate?: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  adminPassword!: string;
}
