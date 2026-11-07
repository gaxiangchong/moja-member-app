/**
 * The email the shop gets for every new paid online order, so someone can
 * start on it even when nobody is watching the ops queue. Pure: the service
 * loads the order and sends it.
 */

export type StaffOrderAlertInput = {
  orderNumber: number;
  fulfilmentType: 'IN_STORE' | 'PICKUP' | 'DELIVERY';
  /** The same lines staff see on the ops queue card. */
  fulfillmentSummary: string[];
  customerName: string | null;
  customerPhone: string | null;
  totalCents: number;
  lines: { name: string; variantLabel: string | null; qty: number }[];
  /** Link to the ops order queue, when its public URL is configured. */
  queueUrl: string | null;
};

export type StaffOrderAlert = { subject: string; html: string; text: string };

const KIND_LABEL: Record<StaffOrderAlertInput['fulfilmentType'], string> = {
  IN_STORE: 'In store today',
  PICKUP: 'Pickup',
  DELIVERY: 'Delivery',
};

export function buildStaffOrderAlert(
  input: StaffOrderAlertInput,
): StaffOrderAlert {
  const total = `RM ${(input.totalCents / 100).toFixed(2)}`;
  const who = input.customerName?.trim() || 'Member';
  // An in-store order placed after hours is collected on a later day.
  const later = input.fulfillmentSummary.some((l) => /^date:/i.test(l));
  const kind =
    input.fulfilmentType === 'IN_STORE' && later
      ? 'In store'
      : KIND_LABEL[input.fulfilmentType];
  const subject = `New order #${input.orderNumber} · ${kind} · ${total}`;

  const items = input.lines.map(
    (l) =>
      `${l.qty} × ${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ''}`,
  );
  const text = [
    `New online order #${input.orderNumber} (${kind})`,
    '',
    ...input.fulfillmentSummary,
    '',
    ...items,
    '',
    `Total: ${total}`,
    `Customer: ${who}${input.customerPhone ? ` · ${input.customerPhone}` : ''}`,
    ...(input.queueUrl ? ['', `Open the order queue: ${input.queueUrl}`] : []),
  ].join('\n');

  const li = (s: string) => `<li style="margin:2px 0;">${escapeHtml(s)}</li>`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f5f2;font-family:Arial,Helvetica,sans-serif;color:#1f2328;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e0d8;border-radius:8px;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 4px;">New order #${input.orderNumber}</h1>
      <p style="margin:0 0 16px;color:#5b6168;font-size:14px;">${escapeHtml(kind)} · ${escapeHtml(total)}</p>
      <ul style="margin:0 0 16px;padding-left:18px;font-size:14px;color:#5b6168;">${input.fulfillmentSummary.map(li).join('')}</ul>
      <ul style="margin:0 0 16px;padding-left:18px;font-size:16px;">${items.map(li).join('')}</ul>
      <p style="margin:0;font-size:14px;">Customer: <strong>${escapeHtml(who)}</strong>${
        input.customerPhone ? ` · ${escapeHtml(input.customerPhone)}` : ''
      }</p>
      ${
        input.queueUrl
          ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(input.queueUrl)}" style="color:#1f2328;font-weight:600;">Open the order queue</a></p>`
          : ''
      }
    </div>
  </body>
</html>`;
  return { subject, html, text };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
