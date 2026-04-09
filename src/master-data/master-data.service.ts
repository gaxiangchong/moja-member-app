import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BusinessRuleKind,
  MasterEntryCategory,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMasterEntryDto,
  UpdateMasterEntryDto,
} from './dto/master-entry.dto';
import type { CreateBusinessRuleDto } from './dto/business-rule.dto';
import type { UpdateBusinessRuleDto } from './dto/business-rule.dto';

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  listEntries(category?: MasterEntryCategory) {
    return this.prisma.masterEntry.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async createEntry(dto: CreateMasterEntryDto) {
    return this.prisma.masterEntry.create({
      data: {
        category: dto.category,
        code: dto.code,
        label: dto.label,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async updateEntry(id: string, dto: UpdateMasterEntryDto) {
    await this.ensureEntry(id);
    return this.prisma.masterEntry.update({
      where: { id },
      data: {
        label: dto.label,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async deleteEntry(id: string) {
    await this.ensureEntry(id);
    await this.prisma.masterEntry.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureEntry(id: string) {
    const e = await this.prisma.masterEntry.findUnique({ where: { id } });
    if (!e) {
      throw new NotFoundException({ code: 'MASTER_ENTRY_NOT_FOUND', message: 'Entry not found' });
    }
    return e;
  }

  listRules(kind?: BusinessRuleKind) {
    return this.prisma.businessRule.findMany({
      where: kind ? { kind } : undefined,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  async createRule(dto: CreateBusinessRuleDto) {
    return this.prisma.businessRule.create({
      data: {
        kind: dto.kind,
        name: dto.name,
        config: dto.config as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateRule(id: string, dto: UpdateBusinessRuleDto) {
    await this.ensureRule(id);
    return this.prisma.businessRule.update({
      where: { id },
      data: {
        name: dto.name,
        config: dto.config as Prisma.InputJsonValue,
        isActive: dto.isActive,
      },
    });
  }

  async deleteRule(id: string) {
    await this.ensureRule(id);
    await this.prisma.businessRule.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureRule(id: string) {
    const r = await this.prisma.businessRule.findUnique({ where: { id } });
    if (!r) {
      throw new NotFoundException({ code: 'BUSINESS_RULE_NOT_FOUND', message: 'Rule not found' });
    }
    return r;
  }

  /** Idempotent baseline vocabulary for tiers, channels, and note categories. */
  async seedDefaults() {
    const entries: CreateMasterEntryDto[] = [
      { category: MasterEntryCategory.MEMBER_TIER, code: 'standard', label: 'Standard', sortOrder: 10 },
      { category: MasterEntryCategory.MEMBER_TIER, code: 'gold', label: 'Gold', sortOrder: 20 },
      { category: MasterEntryCategory.MEMBER_TIER, code: 'vip', label: 'VIP', sortOrder: 30 },
      { category: MasterEntryCategory.STORE, code: 'online', label: 'Online', sortOrder: 10 },
      { category: MasterEntryCategory.STORE, code: 'flagship', label: 'Flagship', sortOrder: 20 },
      { category: MasterEntryCategory.SOURCE_CHANNEL, code: 'otp', label: 'OTP signup', sortOrder: 10 },
      { category: MasterEntryCategory.SOURCE_CHANNEL, code: 'import', label: 'Import', sortOrder: 20 },
      { category: MasterEntryCategory.NOTE_CATEGORY, code: 'complaint', label: 'Complaint', sortOrder: 10 },
      { category: MasterEntryCategory.NOTE_CATEGORY, code: 'goodwill', label: 'Goodwill', sortOrder: 20 },
      { category: MasterEntryCategory.TAG_VOCAB, code: 'vip', label: 'VIP', sortOrder: 10 },
      { category: MasterEntryCategory.TAG_VOCAB, code: 'inactive', label: 'Inactive', sortOrder: 20 },
    ];
    for (const e of entries) {
      await this.prisma.masterEntry.upsert({
        where: {
          category_code: { category: e.category, code: e.code },
        },
        create: {
          category: e.category,
          code: e.code,
          label: e.label,
          sortOrder: e.sortOrder ?? 0,
        },
        update: { label: e.label, sortOrder: e.sortOrder ?? 0 },
      });
    }

    const rules: CreateBusinessRuleDto[] = [
      {
        kind: BusinessRuleKind.WALLET_BONUS,
        name: 'Top-up bonus (example)',
        config: {
          description: 'Example: top up 10000 cents → bonus 1000 cents',
          minTopUpCents: 10000,
          bonusCents: 1000,
        },
      },
      {
        kind: BusinessRuleKind.LOYALTY_EARN,
        name: 'Default earn placeholder',
        config: { description: 'Wire to POS / orders later' },
      },
    ];

    for (const r of rules) {
      const existing = await this.prisma.businessRule.findFirst({
        where: { kind: r.kind, name: r.name },
      });
      if (!existing) {
        await this.prisma.businessRule.create({
          data: {
            kind: r.kind,
            name: r.name,
            config: r.config as Prisma.InputJsonValue,
          },
        });
      }
    }

    return { ok: true, entriesSeeded: entries.length };
  }
}
