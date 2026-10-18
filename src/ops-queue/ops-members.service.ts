import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, VoucherStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { PhoneNormalizerService } from '../customers/phone-normalizer.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { tierForPoints } from '../loyalty/member-tier';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAutomationService } from '../rewards-workflow/campaign-automation.service';
import { WalletService } from '../wallet/wallet.service';
import { OpsCreateMemberDto, OpsMemberLookupDto } from './dto/ops-member.dto';

/**
 * What the member (or the cashier helping them) has to do next.
 *
 * `activate_in_app`  — account exists but has no PIN yet: the member signs in
 *                      on their own phone, gets an OTP, and sets a PIN.
 * `recover_via_otp`  — has a PIN but can't get in: forgot-PIN recovery, which
 *                      needs an email on file.
 * `needs_email`      — recovery is blocked because no email was ever saved;
 *                      an admin has to add one (or the member visits with ID).
 * `ready`            — nothing to do, they can sign in normally.
 */
export type MemberNextStep =
  | 'activate_in_app'
  | 'recover_via_otp'
  | 'needs_email'
  | 'ready';

@Injectable()
export class OpsMembersService {
  private readonly logger = new Logger(OpsMembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly phoneNormalizer: PhoneNormalizerService,
    private readonly loyalty: LoyaltyService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly campaignAutomation: CampaignAutomationService,
  ) {}

  /**
   * Counter staff share one `OPS_QUEUE_API_KEY`, so the employee code is the
   * only attribution we get. It is recorded on every lookup and registration.
   */
  private async resolveStaffLabel(staffCode?: string): Promise<string | null> {
    const code = staffCode?.trim();
    if (!code) return null;
    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: code },
      select: { displayName: true, isActive: true },
    });
    return employee ? `${code} (${employee.displayName})` : code;
  }

  private nextStep(customer: {
    loginPinHash: string | null;
    email: string | null;
  }): MemberNextStep {
    if (!customer.loginPinHash) return 'activate_in_app';
    if (!customer.email?.trim()) return 'needs_email';
    return 'ready';
  }

  /**
   * Full member profile for the counter. Excludes anything that would let
   * staff act as the member (never returns the PIN hash or any token).
   *
   * NOTE: this is real customer PII behind a single shop-wide API key. Every
   * call is written to the audit log, and `OPS_QUEUE_API_KEY` should be
   * rotated whenever a device or staff member leaves.
   */
  async lookup(dto: OpsMemberLookupDto, ip?: string | null) {
    const phoneE164 = this.normalizePhone(dto.phone);
    const staffLabel = await this.resolveStaffLabel(dto.staffCode);

    const customer = await this.prisma.customer.findUnique({
      where: { phoneE164 },
      select: {
        id: true,
        phoneE164: true,
        displayName: true,
        email: true,
        birthday: true,
        gender: true,
        address: true,
        status: true,
        memberTier: true,
        marketingConsent: true,
        tags: true,
        notes: true,
        preferredStore: true,
        referralCode: true,
        kitchenPickupCode: true,
        loginPinHash: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    await this.audit.log({
      actorType: 'system',
      action: 'ops.member_lookup',
      entityType: 'customer',
      entityId: customer?.id ?? null,
      ipAddress: ip ?? null,
      metadata: {
        phoneE164,
        found: Boolean(customer),
        staff: staffLabel,
      },
    });

    if (!customer) {
      return { found: false as const, phoneE164 };
    }

    const [points, walletSummary, orderStats, vouchers] = await Promise.all([
      this.loyalty.getWalletSummary(customer.id),
      this.wallet.getSummary(customer.id),
      this.prisma.customerOrder.aggregate({
        where: { customerId: customer.id },
        _count: { _all: true },
        _sum: { totalCents: true },
        _max: { placedAt: true },
      }),
      this.prisma.customerVoucher.count({
        where: { customerId: customer.id, status: VoucherStatus.ISSUED },
      }),
    ]);

    const { loginPinHash, ...profile } = customer;
    return {
      found: true as const,
      phoneE164,
      nextStep: this.nextStep(customer),
      member: {
        ...profile,
        memberTier: tierForPoints(points.pointsBalance),
        activated: Boolean(loginPinHash),
        canSelfRecover: Boolean(customer.email?.trim()),
        pointsBalance: points.pointsBalance,
        walletBalanceCents: walletSummary.currentWalletBalance,
        activeVouchers: vouchers,
        orderCount: orderStats._count._all,
        lifetimeSpendCents: orderStats._sum.totalCents ?? 0,
        lastOrderAt: orderStats._max.placedAt,
      },
    };
  }

  /**
   * Registers a walk-in member from the counter.
   *
   * Staff must never set or know a member's PIN, or they could sign in and
   * spend that member's wallet credit and vouchers. So a PIN is only taken
   * here when the **customer** types it themselves on the counter device, and
   * only for a member who has none yet. Without one, the member activates the
   * account on their own phone (`loginLookup` reports `hasPin: false`, which
   * routes the app to OTP → set PIN). Points still accrue against the phone
   * number in the meantime, so the account is useful even if never activated.
   *
   * Idempotent by phone number: registering an existing member returns that
   * member instead of failing, which is the common case when the cashier is
   * really just looking someone up.
   */
  async createMember(dto: OpsCreateMemberDto, ip?: string | null) {
    const phoneE164 = this.normalizePhone(dto.phone);
    const staffLabel = await this.resolveStaffLabel(dto.staffCode);

    const existing = await this.prisma.customer.findUnique({
      where: { phoneE164 },
      select: { id: true, salesplayCustomerId: true, loginPinHash: true },
    });

    const pin = dto.pin?.trim() || null;
    if (pin) {
      if (pin !== dto.pinConfirm?.trim()) {
        throw new BadRequestException({
          code: 'PIN_MISMATCH',
          message: 'The two PIN entries do not match. Ask the customer to type it again.',
        });
      }
      // Never replace a PIN the member already chose.
      if (existing?.loginPinHash) {
        throw new BadRequestException({
          code: 'PIN_ALREADY_SET',
          message:
            'This member already has a PIN. They sign in with it, or reset it in the app with "Forgot PIN".',
        });
      }
    }

    // Creates the DRAFT customer plus loyalty/stored wallets and referral code.
    // Deliberately does NOT fire the WELCOME campaign — that happens when the
    // member sets their first PIN, so staff cannot farm signup vouchers.
    const customer = await this.customers.ensureCustomerForPhone(phoneE164, {
      email: dto.email?.trim() || undefined,
      source: 'cake',
      skipSalesplaySync: true,
    });

    const displayName = dto.displayName?.trim();
    const birthday = dto.birthday ? new Date(dto.birthday) : undefined;
    if (birthday && Number.isNaN(birthday.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_BIRTHDAY',
        message: 'Birthday must be a valid date.',
      });
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        // Never overwrite details an existing member already has.
        ...(displayName && !customer.displayName ? { displayName } : {}),
        ...(birthday && !customer.birthday ? { birthday } : {}),
        ...(dto.marketingConsent === true ? { marketingConsent: true } : {}),
        ...(existing ? {} : { signupSource: 'counter' }),
      },
    });
    await this.customers.ensureKitchenPickupCode(customer.id);

    if (pin) {
      // Same as finishing sign-up in the app: active, signed-in-able, and the
      // welcome vouchers go out now that the member can actually log in.
      const hash = await bcrypt.hash(pin, 12);
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { loginPinHash: hash, status: CustomerStatus.ACTIVE },
      });
      void this.campaignAutomation
        .runNewMemberTrigger(customer.id)
        .catch((err) =>
          this.logger.error(
            `New-member campaign trigger failed for ${customer.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    }

    await this.audit.log({
      actorType: 'system',
      action: existing ? 'ops.member_register_existing' : 'ops.member_register',
      entityType: 'customer',
      entityId: customer.id,
      ipAddress: ip ?? null,
      metadata: {
        phoneE164,
        staff: staffLabel,
        displayName: displayName ?? null,
        marketingConsent: dto.marketingConsent === true,
        // Whether the customer set their PIN at the counter; never the PIN.
        pinSetAtCounter: Boolean(pin),
      },
    });

    if (!existing) {
      this.logger.log(
        `Counter registration: ${phoneE164} by ${staffLabel ?? 'unknown staff'}`,
      );
    }

    // Sent only now, with the name saved, so the till shows who they are.
    // A member already linked to a SalesPlay customer is left as is.
    const salesplay =
      existing?.salesplayCustomerId
        ? ('synced' as const)
        : await this.customers.pushToSalesplayNow(customer.id);

    const result = await this.lookupById(customer.id, phoneE164);
    return { ...result, alreadyExisted: Boolean(existing), salesplay };
  }

  /** Retries sending a member to SalesPlay when the push at registration failed. */
  async pushToSalesplay(dto: OpsMemberLookupDto, ip?: string | null) {
    const phoneE164 = this.normalizePhone(dto.phone);
    const staffLabel = await this.resolveStaffLabel(dto.staffCode);
    const customer = await this.prisma.customer.findUnique({
      where: { phoneE164 },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'No member with this phone number.',
      });
    }
    const salesplay = await this.customers.pushToSalesplayNow(customer.id);
    await this.audit.log({
      actorType: 'system',
      action: 'ops.member_salesplay_push',
      entityType: 'customer',
      entityId: customer.id,
      ipAddress: ip ?? null,
      metadata: { phoneE164, staff: staffLabel, result: salesplay },
    });
    return { salesplay };
  }

  private async lookupById(customerId: string, phoneE164: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        memberTier: true,
        marketingConsent: true,
        referralCode: true,
        kitchenPickupCode: true,
        loginPinHash: true,
        createdAt: true,
      },
    });
    const { loginPinHash, ...profile } = customer;
    return {
      phoneE164,
      nextStep: this.nextStep(customer),
      member: {
        ...profile,
        activated: Boolean(loginPinHash),
        canSelfRecover: Boolean(customer.email?.trim()),
      },
    };
  }

  private normalizePhone(raw: string): string {
    try {
      return this.phoneNormalizer.normalizeToE164(raw);
    } catch {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message:
          'Enter a valid mobile number, e.g. 012-345 6789 or +60 12-345 6789.',
      });
    }
  }
}

/** A suspended member should not be silently served at the counter. */
export function isServiceableStatus(status: CustomerStatus): boolean {
  return status !== CustomerStatus.SUSPENDED;
}
