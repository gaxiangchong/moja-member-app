import { IsUUID } from 'class-validator';

export class DemoCompleteShopOrderDto {
  @IsUUID('4')
  orderId!: string;
}
