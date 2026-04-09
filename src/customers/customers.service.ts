import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly wallet: WalletService,
  ) {}

  async findByIdOrThrow(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Member not found',
      });
    }
    return customer;
  }

  async findByPhoneE164(phoneE164: string) {
    return this.prisma.customer.findUnique({ where: { phoneE164 } });
  }

  /**
   * Creates a draft member keyed by normalized phone (first successful OTP verify).
   */
  async ensureCustomerForPhone(phoneE164: string) {
    const existing = await this.findByPhoneE164(phoneE164);
    if (existing) {
      await this.loyalty.ensureWallet(existing.id);
      await this.wallet.ensureWallet(existing.id);
      return existing;
    }

    const customer = await this.prisma.customer.create({
      data: {
        phoneE164,
        status: CustomerStatus.DRAFT,
      },
    });
    await this.loyalty.ensureWallet(customer.id);
    await this.wallet.ensureWallet(customer.id);
    return customer;
  }

  async getProfileBundle(customerId: string) {
    const customer = await this.findByIdOrThrow(customerId);
    const loyalty = await this.loyalty.getWalletSummary(customerId);
    const storedWallet = await this.wallet.getSummary(customerId);
    return {
      id: customer.id,
      phoneE164: customer.phoneE164,
      status: customer.status,
      displayName: customer.displayName,
      email: customer.email,
      birthday: customer.birthday,
      gender: customer.gender,
      preferredStore: customer.preferredStore,
      signupSource: customer.signupSource,
      memberTier: customer.memberTier,
      marketingConsent: customer.marketingConsent,
      lastLoginAt: customer.lastLoginAt,
      loyalty: {
        pointsBalance: loyalty.pointsBalance,
        walletId: loyalty.walletId || null,
      },
      storedWallet,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  async touchLastLogin(customerId: string): Promise<void> {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { lastLoginAt: new Date() },
    });
  }

  async updateMe(
    customerId: string,
    dto: {
      displayName?: string;
      email?: string;
      birthday?: string;
      gender?: string;
      preferredStore?: string;
      marketingConsent?: boolean;
    },
  ) {
    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        displayName: dto.displayName ?? undefined,
        email: dto.email ?? undefined,
        birthday:
          dto.birthday !== undefined
            ? dto.birthday
              ? new Date(dto.birthday)
              : null
            : undefined,
        gender: dto.gender ?? undefined,
        preferredStore: dto.preferredStore ?? undefined,
        marketingConsent: dto.marketingConsent ?? undefined,
      },
    });
    return this.getProfileBundle(updated.id);
  }

  async getMeRewards(customerId: string) {
    const [wallet, vouchers, rewardCatalog] = await this.prisma.$transaction([
      this.prisma.loyaltyWallet.findUnique({
        where: { customerId },
      }),
      this.prisma.customerVoucher.findMany({
        where: { customerId, status: 'ISSUED' },
        include: {
          definition: {
            select: {
              id: true,
              code: true,
              title: true,
              description: true,
              pointsCost: true,
            },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.voucherDefinition.findMany({
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          pointsCost: true,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      wallet: {
        pointsBalance: wallet?.pointsCached ?? 0,
      },
      vouchers: vouchers.map((v) => ({
        id: v.id,
        status: v.status,
        issuedAt: v.issuedAt,
        expiresAt: v.expiresAt,
        definition: v.definition,
      })),
      rewards: rewardCatalog,
    };
  }

  async getMeWallet(customerId: string) {
    const [summary, entries] = await Promise.all([
      this.wallet.getSummary(customerId),
      this.wallet.listLedger(customerId, 100),
    ]);
    return {
      summary,
      transactions: entries,
    };
  }

  async topUpMyWallet(
    customerId: string,
    dto: { amountCents: number; channel: 'online' | 'cashier' },
  ) {
    const entry = await this.wallet.appendTransaction({
      customerId,
      type: 'TOPUP',
      amountCents: dto.amountCents,
      reason: `customer_topup_${dto.channel}`,
      createdByType: 'customer',
      createdBy: customerId,
      metadata: { channel: dto.channel },
    });
    const summary = await this.wallet.getSummary(customerId);
    return { entry, summary };
  }
}
