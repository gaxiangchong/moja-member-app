import { IsString, IsUUID } from 'class-validator';

export class DemoCompleteBentoSubscriptionDto {
  @IsUUID()
  subscriptionId!: string;
}
