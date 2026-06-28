import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { envFlagTrue } from '../config/env-flags';

/**
 * Feature flags for bento meal plans. When drinks/soup are disabled, pricing
 * skips dinner soup surcharges and drink add-ons, and the client hides those options.
 */
@Injectable()
export class BentoFeaturesService {
  constructor(private readonly config: ConfigService) {}

  /** When false, soup surcharges and drink add-ons are unavailable. Default: true. */
  drinksAndSoupEnabled(): boolean {
    const raw = this.config.get<string>('BENTO_DRINKS_AND_SOUP_ENABLED');
    if (raw == null || raw.trim() === '') return true;
    return envFlagTrue(raw);
  }
}
