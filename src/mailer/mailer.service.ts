import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerStatus,
  EmailAudienceKind,
  EmailCampaign,
  EmailCampaignStatus,
  EmailRecipientStatus,
  Prisma,
  VoucherStatus,
} from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { daysUntilBirthdayUtc } from '../common/birthday.util';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/upsert-campaign.dto';
import {
  renderCampaignEmail,
  RenderVoucherInfo,
  TEMPLATE_PRESETS,
} from './mailer-templates';

/** States in which the draft content may still be edited. */
const EDITABLE_STATUSES: EmailCampaignStatus[] = [
  EmailCampaignStatus.DRAFT,
  EmailCampaignStatus.SCHEDULED,
];

/** How often the dispatcher looks for due campaigns. */
const DISPATCH_POLL_MS = 30_000;
/** Default BIRTHDAY_UPCOMING window when the campaign doesn't set one. */
const DEFAULT_BIRTHDAY_WINDOW_DAYS = 14;
/** referenceType stamped on vouchers issued by an email campaign. */
const VOUCHER_REF_EMAIL_CAMPAIGN = 'email_campaign';
/** Pause between individual sends — Resend free tier allows ~2 req/s. */
const SEND_GAP_MS = 600;

@Injectable()
export class MailerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private dispatchTimer: NodeJS.Timeout | null = null;
  private dispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  onModuleInit(): void {
    // Skip the background dispatcher in tests to keep runs deterministic.
    if (process.env.NODE_ENV === 'test') return;
    this.dispatchTimer = setInterval(() => {
      void this.dispatchDueCampaigns().catch((err) => {
        this.logger.error(
          `Mailer dispatch tick failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, DISPATCH_POLL_MS);
    this.dispatchTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
  }

  // ---- Template presets -------------------------------------------------

  getTemplates() {
    return { templates: TEMPLATE_PRESETS };
  }

  // ---- Campaign CRUD ----------------------------------------------------

  async listCampaigns() {
    const campaigns = await this.prisma.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { campaigns: campaigns.map((c) => this.toSummary(c)) };
  }

  async getCampaign(id: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const recipientErrors = await this.prisma.emailCampaignRecipient.findMany({
      where: { campaignId: id, status: EmailRecipientStatus.FAILED },
      take: 20,
      select: { email: true, error: true },
    });
    return { campaign: this.toDetail(campaign), recipientErrors };
  }

  async createCampaign(dto: CreateCampaignDto, actorLabel: string | null) {
    if (dto.voucherDefinitionId) {
      await this.requireActiveVoucherDefinition(dto.voucherDefinitionId);
    }
    const campaign = await this.prisma.emailCampaign.create({
      data: {
        name: dto.name.trim(),
        templateKind: dto.templateKind,
        subject: dto.subject.trim(),
        preheader: dto.preheader?.trim() || null,
        bodyHtml: dto.bodyHtml,
        audience: dto.audience,
        tierFilter: this.normalizeTier(dto.tierFilter),
        birthdayWindowDays: dto.birthdayWindowDays ?? null,
        voucherDefinitionId: dto.voucherDefinitionId ?? null,
        voucherValidDays: dto.voucherValidDays ?? null,
        createdBy: actorLabel,
      },
    });
    return { campaign: this.toDetail(campaign) };
  }

  async updateCampaign(id: string, dto: UpdateCampaignDto) {
    const existing = await this.requireCampaign(id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        `Campaign can no longer be edited (status: ${existing.status})`,
      );
    }
    if (dto.voucherDefinitionId) {
      await this.requireActiveVoucherDefinition(dto.voucherDefinitionId);
    }
    const campaign = await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.templateKind !== undefined
          ? { templateKind: dto.templateKind }
          : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
        ...(dto.preheader !== undefined
          ? { preheader: dto.preheader?.trim() || null }
          : {}),
        ...(dto.bodyHtml !== undefined ? { bodyHtml: dto.bodyHtml } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.tierFilter !== undefined
          ? { tierFilter: this.normalizeTier(dto.tierFilter) }
          : {}),
        ...(dto.birthdayWindowDays !== undefined
          ? { birthdayWindowDays: dto.birthdayWindowDays }
          : {}),
        ...(dto.voucherDefinitionId !== undefined
          ? { voucherDefinitionId: dto.voucherDefinitionId }
          : {}),
        ...(dto.voucherValidDays !== undefined
          ? { voucherValidDays: dto.voucherValidDays }
          : {}),
      },
    });
    return { campaign: this.toDetail(campaign) };
  }

  async duplicateCampaign(id: string, actorLabel: string | null) {
    const existing = await this.requireCampaign(id);
    const campaign = await this.prisma.emailCampaign.create({
      data: {
        name: `${existing.name} (copy)`.slice(0, 120),
        templateKind: existing.templateKind,
        subject: existing.subject,
        preheader: existing.preheader,
        bodyHtml: existing.bodyHtml,
        audience: existing.audience,
        tierFilter: existing.tierFilter,
        birthdayWindowDays: existing.birthdayWindowDays,
        voucherDefinitionId: existing.voucherDefinitionId,
        voucherValidDays: existing.voucherValidDays,
        createdBy: actorLabel,
      },
    });
    return { campaign: this.toDetail(campaign) };
  }

  async deleteCampaign(id: string) {
    const existing = await this.requireCampaign(id);
    if (
      existing.status === EmailCampaignStatus.SENDING ||
      existing.status === EmailCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'Cancel the campaign before deleting it.',
      );
    }
    await this.prisma.emailCampaign.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Scheduling -------------------------------------------------------

  async scheduleCampaign(id: string, scheduledAtIso: string | undefined) {
    const existing = await this.requireCampaign(id);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        `Campaign cannot be scheduled (status: ${existing.status})`,
      );
    }
    if (!existing.subject.trim() || !existing.bodyHtml.trim()) {
      throw new BadRequestException(
        'Campaign needs a subject and body before it can be scheduled.',
      );
    }
    const scheduledAt = scheduledAtIso ? new Date(scheduledAtIso) : new Date();
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt datetime.');
    }
    if (existing.voucherDefinitionId) {
      await this.requireActiveVoucherDefinition(existing.voucherDefinitionId);
    }
    const { count } = await this.audiencePreview(
      existing.audience,
      existing.tierFilter,
      existing.birthdayWindowDays,
    );
    if (count === 0) {
      throw new BadRequestException(
        'The selected audience has no recipients with an email address.',
      );
    }
    // Atomic status guard: never overwrite SENDING/SENT/FAILED back to
    // SCHEDULED. A check-then-update race with the dispatcher would reopen
    // the campaign and start a second runCampaign against the same PENDING
    // recipients (duplicate emails + duplicate wallet vouchers).
    const claimed = await this.prisma.emailCampaign.updateMany({
      where: { id, status: { in: EDITABLE_STATUSES } },
      data: { status: EmailCampaignStatus.SCHEDULED, scheduledAt },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        'Campaign can no longer be scheduled (it may already be sending).',
      );
    }
    const campaign = await this.requireCampaign(id);
    // Fire the dispatcher soon after "send now" instead of waiting a tick.
    if (scheduledAt.getTime() <= Date.now()) {
      setTimeout(() => void this.dispatchDueCampaigns().catch(() => {}), 100);
    }
    return { campaign: this.toDetail(campaign) };
  }

  async cancelCampaign(id: string) {
    const existing = await this.requireCampaign(id);
    if (existing.status !== EmailCampaignStatus.SCHEDULED) {
      throw new BadRequestException(
        'Only scheduled campaigns can be cancelled. Campaigns already sending will finish the current run.',
      );
    }
    // Atomic status guard so a cancel that raced the dispatcher cannot flip
    // SENDING/SENT back to CANCELLED (or reopen a finished campaign).
    const claimed = await this.prisma.emailCampaign.updateMany({
      where: { id, status: EmailCampaignStatus.SCHEDULED },
      data: { status: EmailCampaignStatus.CANCELLED, scheduledAt: null },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        'Only scheduled campaigns can be cancelled. Campaigns already sending will finish the current run.',
      );
    }
    const campaign = await this.requireCampaign(id);
    return { campaign: this.toDetail(campaign) };
  }

  // ---- Audience ---------------------------------------------------------

  async audiencePreview(
    audience: EmailAudienceKind,
    tierFilter: string | null,
    birthdayWindowDays?: number | null,
  ) {
    if (audience === EmailAudienceKind.BIRTHDAY_UPCOMING) {
      const windowDays = birthdayWindowDays ?? DEFAULT_BIRTHDAY_WINDOW_DAYS;
      const members = await this.resolveAudience(
        audience,
        tierFilter,
        windowDays,
      );
      return {
        audience,
        tierFilter,
        birthdayWindowDays: windowDays,
        count: members.length,
        // Sorted soonest-birthday-first so the admin can review the list.
        recipients: members.slice(0, 200).map((m) => ({
          id: m.id,
          name: m.displayName,
          email: m.email,
          birthday: m.birthday,
          birthdayDaysUntil: m.birthdayDaysUntil,
        })),
      };
    }
    const where = this.audienceWhere(audience, tierFilter);
    const count = await this.prisma.customer.count({ where });
    return { audience, tierFilter, count };
  }

  /**
   * Materialize the audience as customer rows. For BIRTHDAY_UPCOMING the
   * day-of-year window cannot be expressed in a Prisma where, so candidates
   * (opted-in members with a birthday) are filtered here and sorted by
   * soonest birthday first.
   */
  private async resolveAudience(
    audience: EmailAudienceKind,
    tierFilter: string | null,
    birthdayWindowDays: number | null,
  ) {
    const customers = await this.prisma.customer.findMany({
      where: this.audienceWhere(audience, tierFilter),
      select: {
        id: true,
        email: true,
        displayName: true,
        birthday: true,
      },
    });
    const withDays = customers.map((c) => ({
      ...c,
      birthdayDaysUntil: daysUntilBirthdayUtc(c.birthday),
    }));
    if (audience !== EmailAudienceKind.BIRTHDAY_UPCOMING) return withDays;
    const windowDays = birthdayWindowDays ?? DEFAULT_BIRTHDAY_WINDOW_DAYS;
    return withDays
      .filter(
        (c) =>
          c.birthdayDaysUntil !== null && c.birthdayDaysUntil <= windowDays,
      )
      .sort(
        (a, b) =>
          (a.birthdayDaysUntil ?? 0) - (b.birthdayDaysUntil ?? 0) ||
          (a.displayName ?? '').localeCompare(b.displayName ?? ''),
      );
  }

  private audienceWhere(
    audience: EmailAudienceKind,
    tierFilter: string | null,
  ): Prisma.CustomerWhereInput {
    return {
      status: CustomerStatus.ACTIVE,
      email: { not: null },
      // Birthday vouchers are marketing content — respect the opt-in flag.
      ...(audience === EmailAudienceKind.OPTED_IN ||
      audience === EmailAudienceKind.BIRTHDAY_UPCOMING
        ? { marketingConsent: true }
        : {}),
      ...(audience === EmailAudienceKind.BIRTHDAY_UPCOMING
        ? { birthday: { not: null } }
        : {}),
      ...(tierFilter ? { memberTier: tierFilter } : {}),
    };
  }

  /** Load a voucher series and fail with a friendly error if unusable. */
  private async requireActiveVoucherDefinition(id: string) {
    const def = await this.prisma.voucherDefinition.findUnique({
      where: { id },
    });
    if (!def || !def.isActive) {
      throw new BadRequestException(
        'The selected voucher series does not exist or is inactive.',
      );
    }
    return def;
  }

  // ---- Test send & preview ----------------------------------------------

  async previewCampaign(id: string) {
    const campaign = await this.requireCampaign(id);
    const rendered = renderCampaignEmail({
      subject: campaign.subject,
      preheader: campaign.preheader,
      bodyHtml: campaign.bodyHtml,
      recipientName: 'Preview Member',
      unsubscribeUrl: this.unsubscribeUrl('00000000-0000-0000-0000-000000000000'),
      brandName: this.brandName(),
      voucher: await this.sampleVoucherInfo(campaign),
    });
    return { subject: rendered.subject, html: rendered.html };
  }

  async testSend(id: string, to: string) {
    const campaign = await this.requireCampaign(id);
    const address = to.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      throw new BadRequestException('Invalid test email address.');
    }
    if (!this.email.isConfigured()) {
      throw new BadRequestException(
        'Email sending is not configured (RESEND_API_KEY / from address missing).',
      );
    }
    const rendered = renderCampaignEmail({
      subject: `[TEST] ${campaign.subject}`,
      preheader: campaign.preheader,
      bodyHtml: campaign.bodyHtml,
      recipientName: 'Test Member',
      unsubscribeUrl: this.unsubscribeUrl('00000000-0000-0000-0000-000000000000'),
      brandName: this.brandName(),
      voucher: await this.sampleVoucherInfo(campaign),
    });
    const ok = await this.email.send({
      to: address,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      from: this.marketingFrom(),
    });
    if (!ok) {
      throw new BadRequestException(
        'Test send failed — check server logs for the Resend error.',
      );
    }
    return { ok: true };
  }

  // ---- Unsubscribe ------------------------------------------------------

  unsubscribeToken(customerId: string): string {
    const secret =
      this.config.get<string>('ADMIN_JWT_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      '';
    return createHmac('sha256', `mailer-unsub:${secret}`)
      .update(customerId)
      .digest('hex')
      .slice(0, 32);
  }

  verifyUnsubscribeToken(customerId: string, token: string): boolean {
    const expected = Buffer.from(this.unsubscribeToken(customerId));
    const given = Buffer.from(token);
    return (
      expected.length === given.length && timingSafeEqual(expected, given)
    );
  }

  unsubscribeUrl(customerId: string): string | null {
    const base = (this.config.get<string>('API_PUBLIC_URL') ?? '')
      .trim()
      .replace(/\/$/, '');
    if (!base) return null;
    return `${base}/mailer/unsubscribe?c=${customerId}&t=${this.unsubscribeToken(customerId)}`;
  }

  async unsubscribe(customerId: string, token: string): Promise<boolean> {
    if (!customerId || !token) return false;
    if (!this.verifyUnsubscribeToken(customerId, token)) return false;
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) return false;
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { marketingConsent: false },
    });
    this.logger.log(`Customer ${customerId} unsubscribed from marketing email.`);
    return true;
  }

  // ---- Dispatcher -------------------------------------------------------

  /**
   * Pick up campaigns whose schedule time has arrived and send them.
   * Claiming flips SCHEDULED → SENDING atomically (updateMany with status
   * guard) so parallel instances never double-send a campaign.
   */
  async dispatchDueCampaigns(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const due = await this.prisma.emailCampaign.findMany({
        where: {
          status: EmailCampaignStatus.SCHEDULED,
          scheduledAt: { lte: new Date() },
        },
        select: { id: true },
        take: 5,
      });
      for (const { id } of due) {
        const claimed = await this.prisma.emailCampaign.updateMany({
          where: { id, status: EmailCampaignStatus.SCHEDULED },
          data: {
            status: EmailCampaignStatus.SENDING,
            startedAt: new Date(),
          },
        });
        if (claimed.count === 0) continue;
        await this.runCampaign(id);
      }
    } finally {
      this.dispatching = false;
    }
  }

  private async runCampaign(id: string): Promise<void> {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id },
    });
    if (!campaign) return;
    this.logger.log(`Mailer: sending campaign "${campaign.name}" (${id})`);

    if (!this.email.isConfigured()) {
      await this.prisma.emailCampaign.update({
        where: { id },
        data: {
          status: EmailCampaignStatus.FAILED,
          lastError:
            'Email transport not configured (RESEND_API_KEY / from address missing).',
          completedAt: new Date(),
        },
      });
      return;
    }

    // Voucher series attached to the campaign (birthday gift etc.) — resolve
    // once up front so a broken reference fails the run visibly.
    let voucherDef: { id: string; code: string; title: string } | null = null;
    if (campaign.voucherDefinitionId) {
      const def = await this.prisma.voucherDefinition.findUnique({
        where: { id: campaign.voucherDefinitionId },
        select: { id: true, code: true, title: true, isActive: true },
      });
      if (!def || !def.isActive) {
        await this.prisma.emailCampaign.update({
          where: { id },
          data: {
            status: EmailCampaignStatus.FAILED,
            lastError:
              'Attached voucher series no longer exists or is inactive.',
            completedAt: new Date(),
          },
        });
        return;
      }
      voucherDef = def;
    }
    const voucherExpiresAt = campaign.voucherValidDays
      ? new Date(Date.now() + campaign.voucherValidDays * 24 * 60 * 60 * 1000)
      : null;

    // Materialize the recipient list (idempotent via skipDuplicates so a
    // restarted run doesn't re-add rows).
    const customers = await this.resolveAudience(
      campaign.audience,
      campaign.tierFilter,
      campaign.birthdayWindowDays,
    );
    await this.prisma.emailCampaignRecipient.createMany({
      data: customers.map((c) => ({
        campaignId: id,
        customerId: c.id,
        email: (c.email ?? '').trim().toLowerCase(),
      })),
      skipDuplicates: true,
    });
    await this.prisma.emailCampaign.update({
      where: { id },
      data: { totalRecipients: customers.length },
    });

    const nameByCustomer = new Map(
      customers.map((c) => [c.id, c.displayName ?? null]),
    );
    const from = this.marketingFrom();
    const brand = this.brandName();

    // Send PENDING recipients one by one; each row is marked before moving
    // on, so a crash mid-run resumes where it left off.
    let sent = 0;
    let failed = 0;
    // Track counts already recorded from a previous interrupted run.
    const prior = await this.prisma.emailCampaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { _all: true },
    });
    for (const row of prior) {
      if (row.status === EmailRecipientStatus.SENT) sent += row._count._all;
      if (row.status === EmailRecipientStatus.FAILED)
        failed += row._count._all;
    }

    for (;;) {
      const batch = await this.prisma.emailCampaignRecipient.findMany({
        where: { campaignId: id, status: EmailRecipientStatus.PENDING },
        take: 50,
      });
      if (batch.length === 0) break;

      for (const recipient of batch) {
        if (!recipient.email) {
          await this.prisma.emailCampaignRecipient.updateMany({
            where: {
              id: recipient.id,
              status: EmailRecipientStatus.PENDING,
            },
            data: {
              status: EmailRecipientStatus.SKIPPED,
              error: 'No email address',
            },
          });
          continue;
        }
        // Claim PENDING → SENT before side effects so a parallel runCampaign
        // (e.g. multi-instance race) cannot double-email or double-issue.
        // Prefer at-most-once delivery over resume-after-crash for marketing.
        const claimedRecipient = await this.prisma.emailCampaignRecipient.updateMany(
          {
            where: {
              id: recipient.id,
              status: EmailRecipientStatus.PENDING,
            },
            data: {
              status: EmailRecipientStatus.SENT,
              sentAt: new Date(),
              error: null,
            },
          },
        );
        if (claimedRecipient.count === 0) continue;

        // Put the voucher in the member's wallet before the email goes out
        // so the message never references a gift that doesn't exist yet.
        let voucherInfo: RenderVoucherInfo | null = null;
        if (voucherDef) {
          const row = await this.ensureCampaignVoucher(
            id,
            recipient.customerId,
            voucherDef.id,
            voucherExpiresAt,
          );
          voucherInfo = {
            code: voucherDef.code,
            title: voucherDef.title,
            expiresAt: row.expiresAt,
          };
        }
        const rendered = renderCampaignEmail({
          subject: campaign.subject,
          preheader: campaign.preheader,
          bodyHtml: campaign.bodyHtml,
          recipientName: nameByCustomer.get(recipient.customerId) ?? null,
          unsubscribeUrl: this.unsubscribeUrl(recipient.customerId),
          brandName: brand,
          voucher: voucherInfo,
        });
        const ok = await this.email.send({
          to: recipient.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          from,
        });
        if (ok) {
          sent += 1;
        } else {
          failed += 1;
          // Roll the optimistic SENT claim back to FAILED so ops can see it.
          await this.prisma.emailCampaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: EmailRecipientStatus.FAILED,
              error: 'Send failed (see server logs)',
              sentAt: null,
            },
          });
        }
        await this.prisma.emailCampaign.update({
          where: { id },
          data: { sentCount: sent, failedCount: failed },
        });
        await sleep(SEND_GAP_MS);
      }
    }

    await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status:
          sent === 0 && failed > 0
            ? EmailCampaignStatus.FAILED
            : EmailCampaignStatus.SENT,
        sentCount: sent,
        failedCount: failed,
        completedAt: new Date(),
        lastError:
          failed > 0 ? `${failed} recipient(s) failed — see campaign detail.` : null,
      },
    });
    this.logger.log(
      `Mailer: campaign "${campaign.name}" done — sent=${sent} failed=${failed}`,
    );
  }

  // ---- Helpers ----------------------------------------------------------

  /**
   * Find-or-create the voucher issued to this customer by this campaign.
   * Keyed on referenceType/referenceId so restarted runs never double-issue.
   */
  private async ensureCampaignVoucher(
    campaignId: string,
    customerId: string,
    definitionId: string,
    expiresAt: Date | null,
  ) {
    const existing = await this.prisma.customerVoucher.findFirst({
      where: {
        customerId,
        definitionId,
        referenceType: VOUCHER_REF_EMAIL_CAMPAIGN,
        referenceId: campaignId,
      },
    });
    if (existing) return existing;
    return this.prisma.customerVoucher.create({
      data: {
        customerId,
        definitionId,
        status: VoucherStatus.ISSUED,
        expiresAt,
        referenceType: VOUCHER_REF_EMAIL_CAMPAIGN,
        referenceId: campaignId,
      },
    });
  }

  /** Sample voucher values for preview/test sends (nothing is issued). */
  private async sampleVoucherInfo(
    campaign: EmailCampaign,
  ): Promise<RenderVoucherInfo | null> {
    if (!campaign.voucherDefinitionId) return null;
    const def = await this.prisma.voucherDefinition.findUnique({
      where: { id: campaign.voucherDefinitionId },
      select: { code: true, title: true },
    });
    if (!def) return null;
    return {
      code: def.code,
      title: def.title,
      expiresAt: campaign.voucherValidDays
        ? new Date(
            Date.now() + campaign.voucherValidDays * 24 * 60 * 60 * 1000,
          )
        : null,
    };
  }

  private async requireCampaign(id: string): Promise<EmailCampaign> {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  private normalizeTier(tier: string | null | undefined): string | null {
    const t = (tier ?? '').trim().toLowerCase();
    return t || null;
  }

  private brandName(): string {
    return this.email.getSubjectPrefix();
  }

  /** Marketing from-address; falls back to the transactional from. */
  private marketingFrom(): string | undefined {
    const from = this.config.get<string>('MARKETING_EMAIL_FROM')?.trim();
    return from || undefined;
  }

  private toSummary(c: EmailCampaign) {
    return {
      id: c.id,
      name: c.name,
      templateKind: c.templateKind,
      subject: c.subject,
      audience: c.audience,
      tierFilter: c.tierFilter,
      birthdayWindowDays: c.birthdayWindowDays,
      voucherDefinitionId: c.voucherDefinitionId,
      voucherValidDays: c.voucherValidDays,
      status: c.status,
      scheduledAt: c.scheduledAt,
      completedAt: c.completedAt,
      totalRecipients: c.totalRecipients,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      createdBy: c.createdBy,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  private toDetail(c: EmailCampaign) {
    return {
      ...this.toSummary(c),
      preheader: c.preheader,
      bodyHtml: c.bodyHtml,
      startedAt: c.startedAt,
      lastError: c.lastError,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
