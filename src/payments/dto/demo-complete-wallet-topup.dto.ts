import { IsUUID } from 'class-validator';

export class DemoCompleteWalletTopUpDto {
  @IsUUID('4')
  referenceId!: string;
}
