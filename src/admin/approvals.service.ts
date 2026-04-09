import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalRequestKind,
  ApprovalRequestStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { auditActorBase } from '../admin-auth/audit-context.util';
import type { AdminAuthState } from '../admin-auth/types/admin-auth.types';
import type { RequestWalletReversalDto } from './dto/request-wallet-reversal.dto';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
  ) {}

  async requestWalletReversal(
    customerId: string,
    dto: RequestWalletReversalDto,
    auth: AdminAuthState,
  ) {
    if (auth.kind !== 'user' || !auth.adminUserId) {
      throw new ForbiddenException({
        code: 'WALLET_REVERSAL_REQUEST_REQUIRES_USER',
        message: 'Reversal requests must be submitted by a signed-in admin user.',
      });
    }
    await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const txn = await this.prisma.storedWalletLedgerEntry.findFirst({
      where: { id: dto.transactionId, customerId },
    });
    if (!txn) {
      throw new NotFoundException({
        code: 'WALLET_TXN_NOT_FOUND',
        message: 'Transaction not found for this member',
      });
    }
    const req = await this.prisma.approvalRequest.create({
      data: {
        kind: ApprovalRequestKind.WALLET_REVERSAL,
        status: ApprovalRequestStatus.PENDING,
        payload: {
          customerId,
          transactionId: dto.transactionId,
          reason: dto.reason,
        },
        requesterId: auth.adminUserId,
      },
    });
    const base = auditActorBase(auth);
    await this.audit.log({
      ...base,
      action: 'wallet.reversal_requested',
      entityType: 'approval_request',
      entityId: req.id,
      reason: dto.reason,
      metadata: { customerId, transactionId: dto.transactionId },
    });
    return {
      id: req.id,
      status: req.status,
      kind: req.kind,
      createdAt: req.createdAt,
    };
  }

  async listPendingWalletReversals() {
    return this.prisma.approvalRequest.findMany({
      where: {
        kind: ApprovalRequestKind.WALLET_REVERSAL,
        status: ApprovalRequestStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        requester: {
          select: { id: true, email: true, displayName: true, role: true },
        },
      },
    });
  }

  async approveWalletReversal(
    id: string,
    auth: AdminAuthState,
    reviewNote?: string,
  ) {
    const ar = await this.prisma.approvalRequest.findUnique({
      where: { id },
    });
    if (!ar || ar.kind !== ApprovalRequestKind.WALLET_REVERSAL) {
      throw new NotFoundException({
        code: 'APPROVAL_NOT_FOUND',
        message: 'Approval request not found',
      });
    }
    if (ar.status !== ApprovalRequestStatus.PENDING) {
      throw new BadRequestException({
        code: 'APPROVAL_NOT_PENDING',
        message: 'This request is no longer pending',
      });
    }
    const payload = ar.payload as {
      customerId: string;
      transactionId: string;
      reason: string;
    };
    const reversed = await this.wallet.reverseTransaction({
      customerId: payload.customerId,
      transactionId: payload.transactionId,
      reason: payload.reason,
      createdByType: 'admin',
      createdBy: auth.actorLabel,
    });
    const summary = await this.wallet.getSummary(payload.customerId);
    const reviewerId = auth.kind === 'user' ? auth.adminUserId ?? null : null;
    await this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: ApprovalRequestStatus.APPROVED,
        reviewerId,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      },
    });
    const base = auditActorBase(auth);
    await this.audit.log({
      ...base,
      action: 'wallet.reversal_approved',
      entityType: 'approval_request',
      entityId: id,
      reason: reviewNote ?? payload.reason,
      metadata: {
        customerId: payload.customerId,
        originalTransactionId: reversed.original.id,
        reversalTransactionId: reversed.reversal.id,
      },
    });
    await this.audit.log({
      ...base,
      action: 'wallet.reversed',
      entityType: 'customer',
      entityId: payload.customerId,
      reason: payload.reason,
      metadata: {
        originalTransactionId: reversed.original.id,
        reversalTransactionId: reversed.reversal.id,
        viaApprovalRequestId: id,
      },
    });
    return { ...reversed, summary };
  }

  async rejectWalletReversal(
    id: string,
    auth: AdminAuthState,
    reviewNote?: string,
  ) {
    const ar = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!ar || ar.kind !== ApprovalRequestKind.WALLET_REVERSAL) {
      throw new NotFoundException({
        code: 'APPROVAL_NOT_FOUND',
        message: 'Approval request not found',
      });
    }
    if (ar.status !== ApprovalRequestStatus.PENDING) {
      throw new BadRequestException({
        code: 'APPROVAL_NOT_PENDING',
        message: 'This request is no longer pending',
      });
    }
    const reviewerId = auth.kind === 'user' ? auth.adminUserId ?? null : null;
    await this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: ApprovalRequestStatus.REJECTED,
        reviewerId,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      },
    });
    await this.audit.log({
      ...auditActorBase(auth),
      action: 'wallet.reversal_rejected',
      entityType: 'approval_request',
      entityId: id,
      reason: reviewNote ?? null,
    });
    return { id, status: ApprovalRequestStatus.REJECTED };
  }
}
