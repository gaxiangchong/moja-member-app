import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

/** SalesPlay product codes typed in the product editor, to check before saving. */
export class CheckSalesplayCodesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  codes!: string[];
}
