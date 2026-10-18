import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_EARLY_ORDER_DISCOUNT,
  EarlyOrderDiscountSettingsError,
  normalizeEarlyOrderDiscount,
  type EarlyOrderDiscountSettings,
} from './early-order-discount';

const SETTINGS_KEY = 'early_order_discount';

/** Admin-controlled early-order cake discount, in `app_settings`. */
@Injectable()
export class EarlyOrderDiscountService {
  private readonly logger = new Logger(EarlyOrderDiscountService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<EarlyOrderDiscountSettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row) return { ...DEFAULT_EARLY_ORDER_DISCOUNT };
    try {
      return normalizeEarlyOrderDiscount(row.value);
    } catch (err) {
      // A bad stored value must not break checkout: treat it as switched off.
      this.logger.error(
        `${SETTINGS_KEY} is invalid and was ignored: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { ...DEFAULT_EARLY_ORDER_DISCOUNT, enabled: false };
    }
  }

  async setSettings(input: unknown): Promise<EarlyOrderDiscountSettings> {
    let next: EarlyOrderDiscountSettings;
    try {
      next = normalizeEarlyOrderDiscount(input);
    } catch (err) {
      throw new BadRequestException({
        code: 'EARLY_ORDER_DISCOUNT_INVALID',
        message:
          err instanceof EarlyOrderDiscountSettingsError
            ? err.message
            : 'The settings are invalid.',
      });
    }
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: {
        key: SETTINGS_KEY,
        value: next as unknown as Prisma.InputJsonValue,
      },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }
}
