import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import parsePhoneNumberFromString from 'libphonenumber-js';

@Injectable()
export class PhoneNormalizerService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Returns E.164 (e.g. +6591234567). Throws if invalid.
   */
  normalizeToE164(raw: string): string {
    const trimmed = raw?.trim();
    if (!trimmed) {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'Phone number is required',
      });
    }

    const defaultRegion = this.config.get<string>('PHONE_DEFAULT_REGION', 'SG');
    const parsed = parsePhoneNumberFromString(trimmed, defaultRegion as never);
    if (!parsed || !parsed.isValid()) {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'Phone number is not valid',
      });
    }

    return parsed.number;
  }
}
