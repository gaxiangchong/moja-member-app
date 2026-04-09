import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditActorType = 'customer' | 'admin' | 'system';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorType: AuditActorType;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
    adminUserId?: string | null;
    adminRole?: string | null;
    ipAddress?: string | null;
    reason?: string | null;
    beforeValue?: Prisma.InputJsonValue;
    afterValue?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: params.metadata ?? undefined,
        adminUserId: params.adminUserId ?? undefined,
        adminRole: params.adminRole ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
        reason: params.reason ?? undefined,
        beforeValue: params.beforeValue ?? undefined,
        afterValue: params.afterValue ?? undefined,
      },
    });
  }
}
