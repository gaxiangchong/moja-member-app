import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  listActiveDefinitions() {
    return this.prisma.voucherDefinition.findMany({
      where: { isActive: true },
      orderBy: { title: 'asc' },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        pointsCost: true,
      },
    });
  }
}
