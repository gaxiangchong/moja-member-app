import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { memberRewardsCatalogWhere } from './member-rewards-catalog.util';

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  listActiveDefinitions() {
    return this.prisma.voucherDefinition.findMany({
      where: memberRewardsCatalogWhere(),
      orderBy: [{ rewardSortOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        pointsCost: true,
        imageUrl: true,
        rewardCategory: true,
      },
    });
  }
}
