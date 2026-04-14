import { Type } from 'class-transformer';
import {
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
    return Boolean(channel || token);
  }

  defaultMessage(): string {
    return 'Either channelCode or paymentTokenId is required.';
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

  @Validate(HasChannelOrTokenConstraint)
  _channelOrTokenCheck?: boolean;

  @ValidateNested()
  @Type(() => SubmitMemberOrderDto)
  order!: SubmitMemberOrderDto;
}
