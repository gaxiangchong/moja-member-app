import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BentoPackageCode, type BentoPackage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AdminBentoPackageRow = {
  id: string;
  code: BentoPackageCode;
  label: string;
  durationDays: number;
  mealCredits: number;
  pricePerMealCents: number;
  pricePerMealRm: number;
  fixedCheckoutCents: number | null;
  fixedCheckoutRm: number | null;
  includeFreeSoupAndDrinks: boolean;
  isActive: boolean;
};

export type BentoPackagePricingUpdate = {
  code: BentoPackageCode;
  label?: string;
  pricePerMealCents?: number;
  fixedCheckoutCents?: number | null;
  isActive?: boolean;
};

@Injectable()
export class BentoPackagesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapRow(p: BentoPackage): AdminBentoPackageRow {
    return {
      id: p.id,
      code: p.code,
      label: p.label,
      durationDays: p.durationDays,
      mealCredits: p.mealCredits,
      pricePerMealCents: p.pricePerMealCents,
      pricePerMealRm: p.pricePerMealCents / 100,
      fixedCheckoutCents: p.fixedCheckoutCents,
      fixedCheckoutRm:
        p.fixedCheckoutCents != null ? p.fixedCheckoutCents / 100 : null,
      includeFreeSoupAndDrinks: p.includeFreeSoupAndDrinks,
      isActive: p.isActive,
    };
  }

  async listForAdmin(): Promise<{ packages: AdminBentoPackageRow[] }> {
    const rows = await this.prisma.bentoPackage.findMany({
      orderBy: [{ mealCredits: 'asc' }, { code: 'asc' }],
    });
    return { packages: rows.map((p) => this.mapRow(p)) };
  }

  async updatePricing(
    updates: BentoPackagePricingUpdate[],
  ): Promise<{ packages: AdminBentoPackageRow[] }> {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new BadRequestException({
        code: 'BENTO_PACKAGES_EMPTY',
        message: 'Provide at least one package to update.',
      });
    }

    const codes = new Set<BentoPackageCode>();
    for (const item of updates) {
      if (codes.has(item.code)) {
        throw new BadRequestException({
          code: 'BENTO_PACKAGES_DUPLICATE',
          message: `Duplicate package code: ${item.code}`,
        });
      }
      codes.add(item.code);

      if (
        item.pricePerMealCents != null &&
        (!Number.isInteger(item.pricePerMealCents) ||
          item.pricePerMealCents < 100)
      ) {
        throw new BadRequestException({
          code: 'BENTO_INVALID_PRICE',
          message: `${item.code}: price per meal must be at least RM1.00 (100 cents).`,
        });
      }

      if (
        item.fixedCheckoutCents != null &&
        item.fixedCheckoutCents !== undefined &&
        item.fixedCheckoutCents < 100
      ) {
        throw new BadRequestException({
          code: 'BENTO_INVALID_FIXED_PRICE',
          message: `${item.code}: fixed checkout must be at least RM1.00 or empty.`,
        });
      }

      const label = item.label?.trim();
      if (label !== undefined && !label.length) {
        throw new BadRequestException({
          code: 'BENTO_INVALID_LABEL',
          message: `${item.code}: label cannot be empty.`,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of updates) {
        const existing = await tx.bentoPackage.findUnique({
          where: { code: item.code },
        });
        if (!existing) {
          throw new NotFoundException({
            code: 'BENTO_PACKAGE_NOT_FOUND',
            message: `Package ${item.code} not found.`,
          });
        }

        const data: {
          label?: string;
          pricePerMealCents?: number;
          fixedCheckoutCents?: number | null;
          isActive?: boolean;
        } = {};

        if (item.label !== undefined) data.label = item.label.trim();
        if (item.pricePerMealCents !== undefined) {
          data.pricePerMealCents = item.pricePerMealCents;
        }
        if (item.fixedCheckoutCents !== undefined) {
          data.fixedCheckoutCents = item.fixedCheckoutCents;
        }
        if (item.isActive !== undefined) data.isActive = item.isActive;

        if (Object.keys(data).length === 0) continue;

        await tx.bentoPackage.update({
          where: { code: item.code },
          data,
        });
      }
    });

    return this.listForAdmin();
  }
}
