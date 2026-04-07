import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
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
      return existing;
    }

    const customer = await this.prisma.customer.create({
      data: {
        phoneE164,
        status: CustomerStatus.DRAFT,
      },
    });
    await this.loyalty.ensureWallet(customer.id);
    return customer;
  }

  async getProfileBundle(customerId: string) {
    const customer = await this.findByIdOrThrow(customerId);
    const loyalty = await this.loyalty.getWalletSummary(customerId);
    return {
      id: customer.id,
      phoneE164: customer.phoneE164,
      status: customer.status,
      displayName: customer.displayName,
      email: customer.email,
      loyalty: {
        pointsBalance: loyalty.pointsBalance,
        walletId: loyalty.walletId || null,
      },
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
