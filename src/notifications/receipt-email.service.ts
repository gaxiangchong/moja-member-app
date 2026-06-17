import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';

interface SendShopOrderReceiptInput {
  orderId: string;
  paymentIntentId: string;
}

interface SendWalletTopUpReceiptInput {
  paymentIntentId: string;
}

interface SendBentoSubscriptionReceiptInput {
  subscriptionId: string;
  paymentIntentId?: string | null;
}

/**
 * Sends transactional receipts after a payment is captured.
 *
 * All public methods are best-effort and never throw — callers should fire
 * them with `void` from webhook handlers so a transient email failure can
 * never roll back a successful payment.
 */
@Injectable()
export class ReceiptEmailService {
  private readonly logger = new Logger(ReceiptEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async sendShopOrderReceipt(input: SendShopOrderReceiptInput): Promise<void> {
    try {
      if (!this.email.isConfigured()) {
        this.logger.warn(
          `Skipping shop order receipt for order ${input.orderId}: email transport not configured.`,
        );
        return;
      }

      const order = await this.prisma.customerOrder.findUnique({
        where: { id: input.orderId },
        include: { lines: { orderBy: { id: 'asc' } }, customer: true },
      });
      if (!order) {
        this.logger.warn(
          `Skipping receipt: order ${input.orderId} not found.`,
        );
        return;
      }

      const recipient = order.customer.email?.trim();
      if (!recipient) {
        this.logger.warn(
          `Skipping shop order receipt: customer ${order.customerId} has no email on file.`,
        );
        return;
      }

      const intent = await this.prisma.paymentIntent.findUnique({
        where: { id: input.paymentIntentId },
      });

      const currency = intent?.currency || 'MYR';
      const channelLabel = this.formatChannelLabel(intent?.channelCode);
      const reference = intent?.referenceId || order.id;

      const subject = `${this.email.getSubjectPrefix()} Order #${order.orderNumber} confirmed`;

      const lineRowsHtml = order.lines
        .map((line) => {
          const lineTotalCents = line.unitPriceCents * line.qty;
          const variant = line.variantLabel
            ? `<div style="font-size:12px;color:#6b7280;">${escapeHtml(line.variantLabel)}</div>`
            : '';
          return `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <div style="font-weight:600;color:#111827;">${escapeHtml(line.name)}</div>
                ${variant}
                <div style="font-size:12px;color:#6b7280;">Qty ${line.qty} × ${formatMoney(line.unitPriceCents, currency)}</div>
              </td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-variant-numeric:tabular-nums;color:#111827;">
                ${formatMoney(lineTotalCents, currency)}
              </td>
            </tr>
          `;
        })
        .join('');

      const lineTextRows = order.lines
        .map((line) => {
          const lineTotalCents = line.unitPriceCents * line.qty;
          const variant = line.variantLabel ? ` (${line.variantLabel})` : '';
          return `- ${line.name}${variant} × ${line.qty}  ${formatMoney(lineTotalCents, currency)}`;
        })
        .join('\n');

      const greetingName =
        order.customer.displayName?.trim() || 'there';

      const placedAtStr = formatDateTime(order.placedAt);

      const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <h1 style="font-size:20px;margin:0 0 4px;">Payment received</h1>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Thanks, ${escapeHtml(greetingName)} — we got your payment for order #${order.orderNumber}.</p>

        <div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px;">
          <div><strong>Order:</strong> #${order.orderNumber}</div>
          <div><strong>Placed:</strong> ${escapeHtml(placedAtStr)}</div>
          ${channelLabel ? `<div><strong>Paid with:</strong> ${escapeHtml(channelLabel)}</div>` : ''}
          <div><strong>Reference:</strong> <span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;">${escapeHtml(reference)}</span></div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Item</th>
              <th style="text-align:right;padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineRowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td style="padding:12px 0 0;text-align:right;font-weight:700;color:#111827;">Total</td>
              <td style="padding:12px 0 0;text-align:right;font-weight:700;color:#111827;font-variant-numeric:tabular-nums;">
                ${formatMoney(order.totalCents, currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
          Your order is now being prepared. You'll see status updates inside the Moja Maison app.
        </p>
      </div>

      <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#9ca3af;">
        This is a transactional receipt — please keep it for your records.
      </p>
    </div>
  </body>
</html>`;

      const text = [
        `Payment received — Order #${order.orderNumber}`,
        ``,
        `Thanks, ${greetingName}. We received your payment.`,
        ``,
        `Order:     #${order.orderNumber}`,
        `Placed:    ${placedAtStr}`,
        channelLabel ? `Paid with: ${channelLabel}` : null,
        `Reference: ${reference}`,
        ``,
        `Items:`,
        lineTextRows,
        ``,
        `Total: ${formatMoney(order.totalCents, currency)}`,
        ``,
        `Your order is now being prepared.`,
      ]
        .filter((line) => line !== null)
        .join('\n');

      await this.email.send({ to: recipient, subject, html, text });
    } catch (err) {
      this.logger.error(
        `sendShopOrderReceipt failed for order ${input.orderId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async sendWalletTopUpReceipt(
    input: SendWalletTopUpReceiptInput,
  ): Promise<void> {
    try {
      if (!this.email.isConfigured()) {
        this.logger.warn(
          `Skipping wallet top-up receipt for intent ${input.paymentIntentId}: email transport not configured.`,
        );
        return;
      }

      const intent = await this.prisma.paymentIntent.findUnique({
        where: { id: input.paymentIntentId },
        include: { customer: true },
      });
      if (!intent) {
        this.logger.warn(
          `Skipping wallet top-up receipt: payment intent ${input.paymentIntentId} not found.`,
        );
        return;
      }
      const recipient = intent.customer.email?.trim();
      if (!recipient) {
        this.logger.warn(
          `Skipping wallet top-up receipt: customer ${intent.customerId} has no email on file.`,
        );
        return;
      }

      const currency = intent.currency || 'MYR';
      const channelLabel = this.formatChannelLabel(intent.channelCode);
      const greetingName =
        intent.customer.displayName?.trim() || 'there';
      const subject = `${this.email.getSubjectPrefix()} Wallet top-up confirmed`;
      const amountStr = formatMoney(intent.amountCents, currency);
      const placedAtStr = formatDateTime(intent.updatedAt);

      const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <h1 style="font-size:20px;margin:0 0 4px;">Wallet top-up successful</h1>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Hi ${escapeHtml(greetingName)}, your stored-value wallet has been topped up.</p>

        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:16px;font-size:14px;">
          <div style="font-size:28px;font-weight:700;color:#111827;margin-bottom:8px;">${amountStr}</div>
          <div><strong>Completed:</strong> ${escapeHtml(placedAtStr)}</div>
          ${channelLabel ? `<div><strong>Paid with:</strong> ${escapeHtml(channelLabel)}</div>` : ''}
          <div><strong>Reference:</strong> <span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;">${escapeHtml(intent.referenceId)}</span></div>
        </div>

        <p style="margin:0;font-size:13px;color:#6b7280;">
          The new balance is now available in your Moja Maison wallet.
        </p>
      </div>

      <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#9ca3af;">
        This is a transactional receipt — please keep it for your records.
      </p>
    </div>
  </body>
</html>`;

      const text = [
        `Wallet top-up successful`,
        ``,
        `Hi ${greetingName}, your wallet has been topped up.`,
        ``,
        `Amount:    ${amountStr}`,
        `Completed: ${placedAtStr}`,
        channelLabel ? `Paid with: ${channelLabel}` : null,
        `Reference: ${intent.referenceId}`,
      ]
        .filter((line) => line !== null)
        .join('\n');

      await this.email.send({ to: recipient, subject, html, text });
    } catch (err) {
      this.logger.error(
        `sendWalletTopUpReceipt failed for intent ${input.paymentIntentId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async sendBentoSubscriptionReceipt(
    input: SendBentoSubscriptionReceiptInput,
  ): Promise<void> {
    try {
      if (!this.email.isConfigured()) {
        this.logger.warn(
          `Skipping bento receipt for subscription ${input.subscriptionId}: email transport not configured.`,
        );
        return;
      }

      const sub = await this.prisma.bentoSubscription.findUnique({
        where: { id: input.subscriptionId },
        include: { package: true, customer: true },
      });
      if (!sub) {
        this.logger.warn(
          `Skipping bento receipt: subscription ${input.subscriptionId} not found.`,
        );
        return;
      }

      const recipient = sub.customer.email?.trim();
      if (!recipient) {
        this.logger.warn(
          `Skipping bento receipt: customer ${sub.customerId} has no email on file.`,
        );
        return;
      }

      const intent = input.paymentIntentId
        ? await this.prisma.paymentIntent.findUnique({
            where: { id: input.paymentIntentId },
          })
        : sub.paymentIntentId
          ? await this.prisma.paymentIntent.findUnique({
              where: { id: sub.paymentIntentId },
            })
          : null;

      const currency = intent?.currency || 'MYR';
      const channelLabel = this.formatChannelLabel(intent?.channelCode);
      const reference = intent?.referenceId || sub.id;
      const greetingName = sub.customer.displayName?.trim() || 'there';
      const subject = `${this.email.getSubjectPrefix()} Bento meal plan confirmed`;
      const totalStr = formatMoney(sub.totalCents, currency);
      const paidAtStr = formatDateTime(intent?.updatedAt ?? sub.createdAt);

      const mealOptionLabel =
        sub.mealOption === 'BOTH'
          ? 'Lunch + Dinner'
          : sub.mealOption === 'LUNCH'
            ? 'Lunch only'
            : 'Dinner only';
      const dietLabel = (v: string) => (v === 'VEG' ? 'Vegetarian' : 'Regular');
      const riceLabel = sub.riceType === 'BROWN' ? 'Brown rice' : 'White rice';

      // Build a compact list of plan detail rows (label/value pairs).
      const details: Array<[string, string]> = [
        ['Package', sub.package.label],
        ['Meals included', `${sub.mealCreditsTotal} meals`],
        ['Schedule', mealOptionLabel],
      ];
      if (sub.mealOption === 'LUNCH' || sub.mealOption === 'BOTH') {
        details.push([
          'Lunch',
          `${sub.lunchCredits} meals · ${dietLabel(sub.lunchVariant)}`,
        ]);
      }
      if (sub.mealOption === 'DINNER' || sub.mealOption === 'BOTH') {
        details.push([
          'Dinner',
          `${sub.dinnerCredits} meals · ${dietLabel(sub.dinnerVariant)}`,
        ]);
      }
      details.push(['Rice', riceLabel]);
      if (sub.includeDrinkAddon) details.push(['Add-on', 'Drink included']);
      if (sub.startDate && sub.endDate) {
        details.push([
          'Valid',
          `${formatDate(sub.startDate)} – ${formatDate(sub.endDate)}`,
        ]);
      }

      const detailRowsHtml = details
        .map(
          ([label, value]) => `
            <tr>
              <td style="padding:6px 0;color:#6b7280;">${escapeHtml(label)}</td>
              <td style="padding:6px 0;text-align:right;color:#111827;font-weight:600;">${escapeHtml(value)}</td>
            </tr>`,
        )
        .join('');

      const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <h1 style="font-size:20px;margin:0 0 4px;">Your bento meal plan is confirmed 🍱</h1>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Thanks, ${escapeHtml(greetingName)} — we received your payment and your meal plan is now active.</p>

        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:16px;font-size:14px;">
          <div style="font-size:28px;font-weight:700;color:#111827;margin-bottom:8px;">${totalStr}</div>
          <div><strong>Paid:</strong> ${escapeHtml(paidAtStr)}</div>
          ${channelLabel ? `<div><strong>Paid with:</strong> ${escapeHtml(channelLabel)}</div>` : ''}
          <div><strong>Reference:</strong> <span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;">${escapeHtml(reference)}</span></div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tbody>
            ${detailRowsHtml}
          </tbody>
        </table>

        <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
          Pick your pickup days and dishes anytime in the Moja Bento app. We'll have your meals ready for collection.
        </p>
      </div>

      <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#9ca3af;">
        This is a transactional receipt — please keep it for your records.
      </p>
    </div>
  </body>
</html>`;

      const text = [
        `Your bento meal plan is confirmed`,
        ``,
        `Thanks, ${greetingName}. We received your payment and your meal plan is now active.`,
        ``,
        `Total paid: ${totalStr}`,
        `Paid:       ${paidAtStr}`,
        channelLabel ? `Paid with:  ${channelLabel}` : null,
        `Reference:  ${reference}`,
        ``,
        `Plan details:`,
        ...details.map(([label, value]) => `- ${label}: ${value}`),
        ``,
        `Pick your pickup days and dishes anytime in the Moja Bento app.`,
      ]
        .filter((line) => line !== null)
        .join('\n');

      await this.email.send({ to: recipient, subject, html, text });
    } catch (err) {
      this.logger.error(
        `sendBentoSubscriptionReceipt failed for subscription ${input.subscriptionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private formatChannelLabel(code: string | null | undefined): string | null {
    if (!code) return null;
    const upper = code.toUpperCase();
    const map: Record<string, string> = {
      TOUCHNGO: "Touch 'n Go eWallet",
      SHOPEEPAY: 'ShopeePay',
      FPX: 'FPX online banking',
      GCASH: 'GCash',
      CARDS: 'Card',
      CREDIT_CARD: 'Card',
    };
    return map[upper] ?? upper.replace(/_/g, ' ');
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(amountCents: number, currency: string): string {
  const major = amountCents / 100;
  try {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

function formatDateTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat('en-MY', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat('en-MY', {
      dateStyle: 'medium',
      timeZone: 'Asia/Kuala_Lumpur',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
