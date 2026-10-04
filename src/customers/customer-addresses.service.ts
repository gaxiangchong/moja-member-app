import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CustomerAddress } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddressError,
  composeAddress,
  MAX_ADDRESSES_PER_MEMBER,
  validateAddressInput,
  type AddressInput,
} from './customer-address';

/** What the app gets for each saved address. */
export function toAddressView(a: CustomerAddress) {
  return {
    id: a.id,
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    city: a.city,
    state: a.state,
    postcode: a.postcode,
    isDefault: a.isDefault,
    /** The single line sent with an order. */
    fullAddress: composeAddress(a),
  };
}

/** A member's address book (Lazada / Shopee style): several addresses, one default. */
@Injectable()
export class CustomerAddressesService {
  constructor(private readonly prisma: PrismaService) {}

  private parse(raw: unknown): AddressInput {
    try {
      return validateAddressInput(raw);
    } catch (err) {
      if (err instanceof AddressError) {
        throw new BadRequestException({
          code: 'ADDRESS_INVALID',
          message: err.message,
        });
      }
      throw err;
    }
  }

  async list(customerId: string) {
    const rows = await this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toAddressView);
  }

  /**
   * Adds an address. The first one is always the default; later ones become
   * the default only when asked.
   */
  async create(customerId: string, raw: unknown, makeDefault = false) {
    const input = this.parse(raw);
    const created = await this.prisma.$transaction(async (tx) => {
      const count = await tx.customerAddress.count({ where: { customerId } });
      if (count >= MAX_ADDRESSES_PER_MEMBER) {
        throw new BadRequestException({
          code: 'ADDRESS_LIMIT',
          message: `You can save up to ${MAX_ADDRESSES_PER_MEMBER} addresses. Delete one to add another.`,
        });
      }
      const isDefault = makeDefault || count === 0;
      if (isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.create({
        data: { customerId, ...input, isDefault },
      });
    });
    return toAddressView(created);
  }

  async update(
    customerId: string,
    id: string,
    raw: unknown,
    makeDefault?: boolean,
  ) {
    const input = this.parse(raw);
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerAddress.findFirst({
        where: { id, customerId },
      });
      if (!existing) throw this.notFound();
      if (makeDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.update({
        where: { id },
        data: { ...input, ...(makeDefault ? { isDefault: true } : {}) },
      });
    });
    return toAddressView(updated);
  }

  async setDefault(customerId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerAddress.findFirst({
        where: { id, customerId },
      });
      if (!existing) throw this.notFound();
      await tx.customerAddress.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
      await tx.customerAddress.update({
        where: { id },
        data: { isDefault: true },
      });
    });
    return this.list(customerId);
  }

  /** Deleting the default promotes the most recently added address. */
  async remove(customerId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customerAddress.findFirst({
        where: { id, customerId },
      });
      if (!existing) throw this.notFound();
      await tx.customerAddress.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.customerAddress.findFirst({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.customerAddress.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });
    return this.list(customerId);
  }

  private notFound() {
    return new NotFoundException({
      code: 'ADDRESS_NOT_FOUND',
      message: 'That address was not found.',
    });
  }
}
