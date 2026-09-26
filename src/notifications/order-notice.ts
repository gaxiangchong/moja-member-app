import type { OrderFulfilmentType } from '@prisma/client';

/** Customer-facing order messages. `placed` is the payment confirmation. */
export type OrderNoticeKind = 'ready' | 'placed' | 'cancelled';

export type OrderNoticeInput = {
  kind: OrderNoticeKind;
  displayName: string | null;
  orderNumber: number;
  fulfilmentType: OrderFulfilmentType;
  scheduledDate: Date | null;
  scheduledSlot: string | null;
  cancelReason: string | null;
  /** Absolute member-app URL, when one is configured. */
  ordersUrl: string | null;
};

export type OrderNotice = {
  kind: OrderNoticeKind;
  /**
   * Utility-template body variables, always three non-empty strings:
   * `{{1}}` name, `{{2}}` order number, `{{3}}` short detail.
   */
  whatsappBodyParameters: [string, string, string];
  emailSubject: string;
  emailText: string;
  emailHtml: string;
};

const SHOP_TZ = 'Asia/Kuala_Lumpur';

/**
 * Copy for the order-status WhatsApp templates and the email fallback.
 *
 * Submit these as Utility templates (language `en`). Variables must stay in
 * this order — the sender always passes exactly three:
 *
 * - `order_ready`: Hi {{1}}, your Moja Maison order #{{2}} is ready for pickup. {{3}}
 * - `order_placed`: Hi {{1}}, we received your Moja Maison order #{{2}}. {{3}}
 * - `order_cancelled`: Hi {{1}}, your Moja Maison order #{{2}} was cancelled. {{3}}
 */
export function buildOrderNotice(input: OrderNoticeInput): OrderNotice {
  const name = memberName(input.displayName);
  const orderNo = String(input.orderNumber);
  const when = formatWhen(input.scheduledDate, input.scheduledSlot);
  const detail = detailFor(input.kind, input, when);
  const headline = headlineFor(input);
  const ordersLine = input.ordersUrl
    ? `Open your order: ${input.ordersUrl}`
    : 'Open the Moja Maison app to see your order.';

  const text = [
    `Hi ${name},`,
    '',
    headline,
    '',
    `Order: #${orderNo}`,
    when ? `When: ${when}` : null,
    detail,
    '',
    ordersLine,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const html = renderEmailHtml({
    headline,
    name,
    orderNo,
    when,
    detail,
    ordersUrl: input.ordersUrl,
  });

  return {
    kind: input.kind,
    whatsappBodyParameters: [
      name,
      orderNo,
      sanitizeWhatsappParam(detail, 'Please check the Moja Maison app.'),
    ],
    emailSubject: subjectFor(input),
    emailText: text,
    emailHtml: html,
  };
}

function subjectFor(input: OrderNoticeInput): string {
  const n = input.orderNumber;
  switch (input.kind) {
    case 'ready':
      return input.fulfilmentType === 'DELIVERY'
        ? `Order #${n} is ready`
        : `Order #${n} is ready for pickup`;
    case 'placed':
      return `Order #${n} confirmed`;
    case 'cancelled':
      return `Order #${n} was cancelled`;
  }
}

function headlineFor(input: OrderNoticeInput): string {
  const n = input.orderNumber;
  switch (input.kind) {
    case 'ready':
      return input.fulfilmentType === 'DELIVERY'
        ? `Order #${n} is ready and will be delivered.`
        : `Order #${n} is ready for pickup.`;
    case 'placed':
      return `We received your payment for order #${n}.`;
    case 'cancelled':
      return `Order #${n} was cancelled.`;
  }
}

function detailFor(
  kind: OrderNoticeKind,
  input: OrderNoticeInput,
  when: string | null,
): string {
  if (kind === 'cancelled') {
    const reason = input.cancelReason?.trim();
    if (reason && reason !== 'Payment not completed') {
      return sanitizeWhatsappParam(reason, 'Contact us if you need a refund.');
    }
    return 'Contact us if you need a refund.';
  }

  if (kind === 'placed') {
    if (when) {
      return `Pickup ${when}. We will message you when it is ready.`;
    }
    return 'We will message you when it is ready for pickup.';
  }

  if (input.fulfilmentType === 'DELIVERY') {
    return when
      ? `Delivery ${when}. We will send it out shortly.`
      : 'We will send it out for delivery shortly.';
  }
  if (when) {
    return `Collect ${when}. Show order #${input.orderNumber} at the counter.`;
  }
  return `Please collect it at the counter and show order #${input.orderNumber}.`;
}

function formatWhen(
  scheduledDate: Date | null,
  scheduledSlot: string | null,
): string | null {
  const dateLabel = scheduledDate ? formatPickupDate(scheduledDate) : null;
  const slotLabel = scheduledSlot ? formatSlot(scheduledSlot) : null;
  if (dateLabel && slotLabel) return `${dateLabel} at ${slotLabel}`;
  if (dateLabel) return dateLabel;
  if (slotLabel) return `at ${slotLabel}`;
  return null;
}

function formatPickupDate(d: Date): string {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: SHOP_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}

function formatSlot(hhmm: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minutes = String(minute).padStart(2, '0');
  return `${hour12}:${minutes} ${suffix}`;
}

function memberName(displayName: string | null): string {
  const cleaned = sanitizeWhatsappParam(displayName ?? '', '');
  if (!cleaned || !/\p{L}|\p{N}/u.test(cleaned)) return 'there';
  return cleaned.slice(0, 40);
}

/** WhatsApp rejects empty params, newlines, and long runs of spaces. */
export function sanitizeWhatsappParam(value: string, fallback: string): string {
  const collapsed = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  const text = collapsed || fallback;
  return text.slice(0, 200);
}

function renderEmailHtml(input: {
  headline: string;
  name: string;
  orderNo: string;
  when: string | null;
  detail: string;
  ordersUrl: string | null;
}): string {
  const whenRow = input.when
    ? `<div><strong>When:</strong> ${escapeHtml(input.when)}</div>`
    : '';
  const link = input.ordersUrl
    ? `<p style="margin:24px 0 0;font-size:14px;"><a href="${escapeHtml(input.ordersUrl)}" style="color:#111827;">Open your order</a></p>`
    : `<p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Open the Moja Maison app to see your order.</p>`;
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif;color:#111827;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <h1 style="font-size:20px;margin:0 0 4px;">${escapeHtml(input.headline)}</h1>
        <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Hi ${escapeHtml(input.name)},</p>
        <div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:14px;">
          <div><strong>Order:</strong> #${escapeHtml(input.orderNo)}</div>
          ${whenRow}
          <div style="margin-top:8px;">${escapeHtml(input.detail)}</div>
        </div>
        ${link}
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
