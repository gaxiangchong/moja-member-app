import { CustomerStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minPoints?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxPoints?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  hasActiveVoucher?: boolean;

  @IsOptional()
  @IsIn(['createdAt', 'lastLoginAt', 'points', 'spent', 'name', 'referrals'])
  sortBy?: 'createdAt' | 'lastLoginAt' | 'points' | 'spent' | 'name' | 'referrals';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
