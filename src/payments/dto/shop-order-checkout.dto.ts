import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { SubmitMemberOrderDto } from '../../customers/dto/submit-member-order.dto';

@ValidatorConstraint({ name: 'hasChannelOrToken', async: false })
class HasChannelOrTokenConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args?: ValidationArguments): boolean {
    void value;
    const obj = args?.object as ShopOrderCheckoutDto | undefined;
    if (!obj) return false;
    const channel = obj.channelCode?.trim();
    const token = obj.paymentTokenId?.trim();
    return Boolean(channel || token || obj.payWithCredits === true);
  }

  defaultMessage(): string {
    return 'Either channelCode, paymentTokenId or payWithCredits is required.';
  }
}

export class ShopOrderCheckoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  channelCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentTokenId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  voucherId?: string;

  /** Points-catalog reward (voucher definition id) to redeem at checkout. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  rewardDefinitionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  /** Pay the whole order from wallet credits instead of Xendit. */
  @IsOptional()
  @IsBoolean()
  payWithCredits?: boolean;

  @Validate(HasChannelOrTokenConstraint)
  _channelOrTokenCheck?: boolean;

  @ValidateNested()
  @Type(() => SubmitMemberOrderDto)
  order!: SubmitMemberOrderDto;
}
