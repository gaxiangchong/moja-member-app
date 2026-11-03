import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { buildOrderNotice, type OrderNoticeKind } from './order-notice';
import { buildStaffOrderAlert } from './staff-order-alert';
import {
  WhatsappMessagingService,
  WhatsappTemplateNotConfiguredError,
} from './whatsapp-messaging.service';

export type OrderNoticeChannel = 'whatsapp' | 'email' | 'none';

const TEMPLATE_ENV: Record<OrderNoticeKind, { meta: string; twilio: string }> =
  {
    ready: {
      meta: 'WHATSAPP_ORDER_READY_TEMPLATE_NAME',
      twilio: 'TWILIO_WHATSAPP_ORDER_READY_CONTENT_SID',
    },
    placed: {
      meta: 'WHATSAPP_ORDER_PLACED_TEMPLATE_NAME',
      twilio: 'TWILIO_WHATSAPP_ORDER_PLACED_CONTENT_SID',
    },
    cancelled: {
      meta: 'WHATSAPP_ORDER_CANCELLED_TEMPLATE_NAME',
      twilio: 'TWILIO_WHATSAPP_ORDER_CANCELLED_CONTENT_SID',
    },
  };

/**
 * Tells the member when a paid order is confirmed, ready, or cancelled.
 *
 * WhatsApp is a business-initiated utility template. Until Meta approves it,
 * `ready` and `cancelled` go out by email. `placed` does not send a second
 * email — the payment receipt already confirms the order.
 *
 * Never throws. A missed message must not roll back a kitchen status change
 * or a captured payment.
 */
@Injectable()
export class OrderNotificationService {
  private readonly logger = new Logger(OrderNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappMessagingService,
    private readonly config: ConfigService,
  ) {}

  /** True when this event has an approved template id for the active provider. */
  isWhatsappTemplateConfigured(kind: OrderNoticeKind): boolean {
    if (!this.whatsapp.isConfigured()) return false;
    const env = TEMPLATE_ENV[kind];
    const key = this.provider() === 'twilio' ? env.twilio : env.meta;
    return Boolean(this.config.get<string>(key)?.trim());
  }

  async notify(
    orderId: string,
    kind: OrderNoticeKind,
  ): Promise<OrderNoticeChannel> {
    try {
      const order = await this.prisma.customerOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          orderNumber: true,
          fulfilmentType: true,
          scheduledDate: true,
          scheduledSlot: true,
          cancelReason: true,
          customer: {
            select: {
              displayName: true,
              phoneE164: true,
              email: true,
            },
          },
        },
      });
      if (!order) {
        this.logger.warn(`Order notice ${kind} skipped: ${orderId} not found.`);
        return 'none';
      }
      if (order.status !== kind) {
        this.logger.warn(
          `Order notice ${kind} skipped for ${orderId}: status is ${order.status}.`,
        );
        return 'none';
      }
      if (
        kind === 'cancelled' &&
        order.cancelReason === 'Payment not completed'
      ) {
        return 'none';
      }

      const notice = buildOrderNotice({
        kind,
        displayName: order.customer.displayName,
        orderNumber: order.orderNumber,
        fulfilmentType: order.fulfilmentType,
        scheduledDate: order.scheduledDate,
        scheduledSlot: order.scheduledSlot,
        cancelReason: order.cancelReason,
        ordersUrl: this.ordersUrl(),
      });

      const phone = order.customer.phoneE164?.trim();
      if (phone && this.isWhatsappTemplateConfigured(kind)) {
        try {
          const env = TEMPLATE_ENV[kind];
          await this.whatsapp.sendUtilityTemplate({
            label: `order_${kind}`,
            toE164: phone,
            metaTemplateName: this.config.get<string>(env.meta),
            metaTemplateLang: this.templateLang(),
            twilioContentSid: this.config.get<string>(env.twilio),
            bodyParameters: [...notice.whatsappBodyParameters],
          });
          this.logger.log(
            `Order ${kind} notice sent via WhatsApp for #${order.orderNumber}.`,
          );
          return 'whatsapp';
        } catch (err) {
          if (!(err instanceof WhatsappTemplateNotConfiguredError)) {
            this.logger.warn(
              `WhatsApp ${kind} notice failed for order ${orderId}: ${
                err instanceof Error ? err.message : String(err)
              }. Falling back to email.`,
            );
          }
        }
      }

      // The receipt email is the placed confirmation. A second mail would
      // land in the same minute as "Payment received".
      if (kind === 'placed') {
        this.logger.log(
          `Order placed notice for #${order.orderNumber} has no WhatsApp template — receipt email is the confirmation.`,
        );
        return 'none';
      }

      const recipient = order.customer.email?.trim();
      if (!recipient || !this.email.isConfigured()) {
        this.logger.warn(
          `Order ${kind} notice for #${order.orderNumber} was not delivered: no WhatsApp template and no email recipient.`,
        );
        return 'none';
      }

      const sent = await this.email.send({
        to: recipient,
        subject: `${this.email.getSubjectPrefix()} ${notice.emailSubject}`,
        html: notice.emailHtml,
        text: notice.emailText,
      });
      if (sent) {
        this.logger.log(
          `Order ${kind} notice emailed for #${order.orderNumber}.`,
        );
        return 'email';
      }
      return 'none';
    } catch (err) {
      this.logger.error(
        `Order ${kind} notice failed for ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 'none';
    }
  }

  /**
   * Where new-order alerts go: SHOP_ORDER_NOTIFY_EMAIL, else the same inbox
   * bento alerts use. "off" turns the alert off.
   */
  private staffAlertRecipient(): string | null {
    const raw =
      this.config.get<string>('SHOP_ORDER_NOTIFY_EMAIL')?.trim() ||
      this.config.get<string>('BENTO_ADMIN_NOTIFY_EMAIL')?.trim() ||
      'admin@mojamaison.com';
    return raw.toLowerCase() === 'off' ? null : raw;
  }

  /** Whether the shop is emailed about new orders, for the ops screen. */
  staffAlertStatus(): {
    on: boolean;
    recipient: string | null;
    reason: string | null;
  } {
    const recipient = this.staffAlertRecipient();
    if (!recipient) {
      return {
        on: false,
        recipient: null,
        reason: 'Turned off (SHOP_ORDER_NOTIFY_EMAIL=off).',
      };
    }
    if (!this.email.isConfigured()) {
      return {
        on: false,
        recipient,
        reason: 'Email sending is not set up on the server.',
      };
    }
    return { on: true, recipient, reason: null };
  }

  /**
   * Emails the shop about a new paid online order. Separate from the
   * member's receipt; sent even when the member has no email. Never throws.
   */
  async notifyStaffNewOrder(orderId: string): Promise<boolean> {
    try {
      const status = this.staffAlertStatus();
      if (!status.on || !status.recipient) {
        this.logger.warn(
          `New-order staff email skipped for ${orderId}: ${status.reason}`,
        );
        return false;
      }
      const order = await this.prisma.customerOrder.findUnique({
        where: { id: orderId },
        select: {
          orderNumber: true,
          fulfilmentType: true,
          fulfillmentSummary: true,
          totalCents: true,
          customer: { select: { displayName: true, phoneE164: true } },
          lines: { select: { name: true, variantLabel: true, qty: true } },
        },
      });
      if (!order) return false;
      const alert = buildStaffOrderAlert({
        orderNumber: order.orderNumber,
        fulfilmentType: order.fulfilmentType,
        fulfillmentSummary: Array.isArray(order.fulfillmentSummary)
          ? order.fulfillmentSummary.filter(
              (l): l is string => typeof l === 'string',
            )
          : [],
        customerName: order.customer.displayName,
        customerPhone: order.customer.phoneE164,
        totalCents: order.totalCents,
        lines: order.lines,
        queueUrl:
          this.config.get<string>('OPS_QUEUE_PUBLIC_URL')?.trim() || null,
      });
      const sent = await this.email.send({
        to: status.recipient,
        subject: `${this.email.getSubjectPrefix()} ${alert.subject}`,
        html: alert.html,
        text: alert.text,
      });
      if (sent) {
        this.logger.log(
          `New-order staff email sent for #${order.orderNumber}.`,
        );
      }
      return Boolean(sent);
    } catch (err) {
      this.logger.error(
        `New-order staff email failed for ${orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  private provider(): 'meta' | 'twilio' {
    const raw = (this.config.get<string>('WHATSAPP_PROVIDER') ?? 'meta')
      .trim()
      .toLowerCase();
    return raw === 'twilio' ? 'twilio' : 'meta';
  }

  private templateLang(): string {
    return (
      this.config.get<string>('WHATSAPP_ORDER_TEMPLATE_LANG')?.trim() ||
      this.config.get<string>('WHATSAPP_OTP_TEMPLATE_LANG')?.trim() ||
      'en'
    );
  }

  private ordersUrl(): string | null {
    const base = this.config.get<string>('MEMBER_APP_PUBLIC_URL')?.trim();
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/?tab=orders`;
  }
}
