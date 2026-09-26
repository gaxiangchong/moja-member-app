import { CustomerStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { BooleanQueryParam } from '../../common/boolean-query.decorator';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const YMD = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export class AdminListCustomersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  /** Matches phone, email, display name, or exact UUID */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  // --- Per-column filters (admin grid). Each narrows one column only, and
  // combines with `search` and the others via AND. ---

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  /** Lifetime spend range, in cents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSpentCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxSpentCents?: number;

  /** Joined on/after this date (yyyy-mm-dd, inclusive). */
  @IsOptional()
  @IsString()
  @Matches(YMD, { message: 'joinedFrom must be yyyy-mm-dd' })
  joinedFrom?: string;

  /** Joined on/before this date (yyyy-mm-dd, inclusive). */
  @IsOptional()
  @IsString()
  @Matches(YMD, { message: 'joinedTo must be yyyy-mm-dd' })
  joinedTo?: string;

  @IsOptional()
  @IsString()
  @Matches(YMD, { message: 'lastLoginFrom must be yyyy-mm-dd' })
  lastLoginFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(YMD, { message: 'lastLoginTo must be yyyy-mm-dd' })
  lastLoginTo?: string;

  /** `true` = has never signed in. Overrides the lastLogin range when set. */
  @IsOptional()
  @BooleanQueryParam()
  @IsBoolean()
  neverLoggedIn?: boolean;

  @IsOptional()
  @BooleanQueryParam()
  @IsBoolean()
  marketingConsent?: boolean;

  /** `true` = an email is on file (so forgot-PIN recovery can work). */
  @IsOptional()
  @BooleanQueryParam()
  @IsBoolean()
  hasEmail?: boolean;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  memberTier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  signupSource?: string;

  /** Comma-separated tags; matches customers having ANY of them (e.g. `bento,cake`) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minPoints?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxPoints?: number;

  @IsOptional()
  @BooleanQueryParam()
  @IsBoolean()
  hasActiveVoucher?: boolean;

  @IsOptional()
  @IsIn(['createdAt', 'lastLoginAt', 'points', 'spent', 'name', 'referrals'])
  sortBy?:
    | 'createdAt'
    | 'lastLoginAt'
    | 'points'
    | 'spent'
    | 'name'
    | 'referrals';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
