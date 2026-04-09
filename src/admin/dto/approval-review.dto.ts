import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApprovalReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
