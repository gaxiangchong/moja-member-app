import { IsInt, Min } from 'class-validator';

export class SetStockQtyDto {
  @IsInt()
  @Min(0)
  qty!: number;
}
