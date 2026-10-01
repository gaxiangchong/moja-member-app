import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_WALLET_TOPUP_SETTINGS,
  normalizeWalletTopUpSettings,
  WalletTopUpSettingsError,
  type WalletTopUpSettings,
} from './topup-settings';

const SETTINGS_KEY = 'wallet_topup_settings';

/** Admin-controlled credit top-up settings, stored in `app_settings`. */
@Injectable()
export class WalletTopUpSettingsService {
  private readonly logger = new Logger(WalletTopUpSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<WalletTopUpSettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row) return structuredClone(DEFAULT_WALLET_TOPUP_SETTINGS);
    try {
      return normalizeWalletTopUpSettings(row.value);
    } catch (err) {
      // A bad stored value must not take payments down — and must not quietly
      // offer a bonus either, so fall back to the safe default (top-ups off).
      this.logger.error(
        `${SETTINGS_KEY} is invalid and was ignored: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return structuredClone(DEFAULT_WALLET_TOPUP_SETTINGS);
    }
  }

  async setSettings(input: unknown): Promise<WalletTopUpSettings> {
    let next: WalletTopUpSettings;
    try {
      next = normalizeWalletTopUpSettings(input);
    } catch (err) {
      throw new BadRequestException({
        code: 'WALLET_TOPUP_SETTINGS_INVALID',
        message:
          err instanceof WalletTopUpSettingsError
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
