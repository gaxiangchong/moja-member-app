import { BadRequestException } from '@nestjs/common';
import { birthdayWindow } from '../common/birthday.util';

/** How far ahead of the birthday a voucher is usable when a campaign sets no value. */
export const BIRTHDAY_DEFAULT_LEAD_DAYS = 30;
const BIRTHDAY_DEFAULT_AFTER_DAYS = 7;

type CampaignLike = {
  template?: string | null;
  autoCreditTrigger?: string | null;
  autoCreditThreshold?: number | null;
  voucherValidDays?: number | null;
};

/** A birthday campaign is one made from the Birthday template or triggered by birthdays. */
export function isBirthdayCampaign(
  campaign: CampaignLike | null | undefined,
): boolean {
  return (
    campaign?.template === 'BIRTHDAY' ||
    campaign?.autoCreditTrigger === 'BIRTHDAY'
  );
}

/** Days before and after the birthday that the campaign's vouchers are usable. */
export function birthdayCampaignWindow(campaign: CampaignLike): {
  leadDays: number;
  afterDays: number;
} {
  return {
    leadDays:
      campaign.autoCreditThreshold && campaign.autoCreditThreshold > 0
        ? campaign.autoCreditThreshold
        : BIRTHDAY_DEFAULT_LEAD_DAYS,
    afterDays:
      campaign.voucherValidDays && campaign.voucherValidDays > 0
        ? campaign.voucherValidDays
        : BIRTHDAY_DEFAULT_AFTER_DAYS,
  };
}

export type BirthdayVoucherBlock = {
  code: 'BIRTHDAY_NOT_SET' | 'BIRTHDAY_OUTSIDE_WINDOW';
  message: string;
  /** `yyyy-mm-dd` the voucher becomes usable, when that is known. */
  opensOn?: string;
};

/**
 * Why a birthday voucher cannot be used right now, or null when it can (or when
 * the campaign is not a birthday one). Birthday vouchers are only meant for the
 * stretch around the member's birthday, so a member whose birthday is months
 * away — or who has not given one — must not be able to spend it.
 */
export function birthdayVoucherBlock(
  campaign: CampaignLike | null | undefined,
  birthday: Date | null,
  now: Date = new Date(),
): BirthdayVoucherBlock | null {
  if (!campaign || !isBirthdayCampaign(campaign)) return null;
  const { leadDays, afterDays } = birthdayCampaignWindow(campaign);
  if (!birthday) {
    return {
      code: 'BIRTHDAY_NOT_SET',
      message:
        'Add your birthday to your profile to use this birthday voucher.',
    };
  }
  const window = birthdayWindow(birthday, leadDays, afterDays, now);
  if (window.open) return null;
  return {
    code: 'BIRTHDAY_OUTSIDE_WINDOW',
    message: `This birthday voucher can be used from ${window.opensOn} — ${leadDays} days before your birthday.`,
    opensOn: window.opensOn,
  };
}

/** Throws the 400 the apps show to the member when the voucher is not usable yet. */
export function assertBirthdayVoucherUsable(
  campaign: CampaignLike | null | undefined,
  birthday: Date | null,
  now: Date = new Date(),
): void {
  const block = birthdayVoucherBlock(campaign, birthday, now);
  if (block) throw new BadRequestException(block);
}
