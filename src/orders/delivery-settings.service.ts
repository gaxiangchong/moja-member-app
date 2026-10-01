import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_DELIVERY_SETTINGS,
  DeliverySettingsError,
  normalizeDeliverySettings,
  type DeliverySettings,
} from './delivery';

const SETTINGS_KEY = 'shop_delivery_settings';

/** Admin-controlled delivery settings (on/off, WhatsApp number), in `app_settings`. */
@Injectable()
export class DeliverySettingsService {
  private readonly logger = new Logger(DeliverySettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<DeliverySettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row) return { ...DEFAULT_DELIVERY_SETTINGS };
    try {
      return normalizeDeliverySettings(row.value);
    } catch (err) {
      // A bad stored value must not take checkout down.
      this.logger.error(
        `${SETTINGS_KEY} is invalid and was ignored: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { ...DEFAULT_DELIVERY_SETTINGS };
    }
  }

  async setSettings(input: unknown): Promise<DeliverySettings> {
    let next: DeliverySettings;
    try {
      next = normalizeDeliverySettings(input);
    } catch (err) {
      throw new BadRequestException({
        code: 'DELIVERY_SETTINGS_INVALID',
        message:
          err instanceof DeliverySettingsError
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
