import { IsNotEmpty, IsString } from 'class-validator';

/** Look up a member (and their bento subscriptions) by phone number. */
export class BentoCustomerLookupQueryDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
