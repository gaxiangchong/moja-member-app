import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_MEMBER_ORDERS_SETTINGS,
  MemberOrdersSettingsError,
  normalizeMemberOrdersSettings,
  type MemberOrdersSettings,
} from './member-orders-settings';

const SETTINGS_KEY = 'member_orders_settings';

/** Admin-controlled settings for the member app's Orders page, in `app_settings`. */
@Injectable()
export class MemberOrdersSettingsService {
  private readonly logger = new Logger(MemberOrdersSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<MemberOrdersSettings> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row) return { ...DEFAULT_MEMBER_ORDERS_SETTINGS };
    try {
      return normalizeMemberOrdersSettings(row.value);
    } catch (err) {
      // A bad stored value must not break every member's Orders page.
      this.logger.error(
        `${SETTINGS_KEY} is invalid and was ignored: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { ...DEFAULT_MEMBER_ORDERS_SETTINGS };
    }
  }

  async setSettings(input: unknown): Promise<MemberOrdersSettings> {
    let next: MemberOrdersSettings;
    try {
      next = normalizeMemberOrdersSettings(input);
    } catch (err) {
      throw new BadRequestException({
        code: 'MEMBER_ORDERS_SETTINGS_INVALID',
        message:
          err instanceof MemberOrdersSettingsError
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
