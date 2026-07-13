import { EmailTemplateKind } from '@prisma/client';

/**
 * Starter content the admin can load into the editor. `bodyHtml` is the inner
 * content only — the branded layout (header, footer, unsubscribe link) is
 * applied at send time by `renderCampaignEmail`.
 *
 * Supported personalization placeholders (replaced per recipient at send
 * time): {{name}} — customer display name (falls back to "there").
 * When the campaign has an attached voucher series: {{voucher_title}},
 * {{voucher_code}}, {{voucher_expiry}} (localized date or "no expiry").
 */
export type MailerTemplatePreset = {
  kind: EmailTemplateKind;
  label: string;
  description: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
};

export const TEMPLATE_PRESETS: MailerTemplatePreset[] = [
  {
    kind: EmailTemplateKind.WELCOME,
    label: 'Welcome message',
    description: 'Greet new members and point them at their first perks.',
    subject: 'Welcome to Moja Maison, {{name}}!',
    preheader: 'Your member perks are ready — here is how to start.',
    bodyHtml: [
      '<h2>Welcome aboard, {{name}} 👋</h2>',
      '<p>Thank you for joining the Moja Maison member family. Your account is ready and you can start collecting points on every visit.</p>',
      '<ul>',
      '  <li><strong>Collect points</strong> — show your member QR at the counter every time you pay.</li>',
      '  <li><strong>Redeem rewards</strong> — exchange points for vouchers and perks in the app.</li>',
      '  <li><strong>Bento subscriptions</strong> — fresh, chef-prepared meals on your schedule.</li>',
      '</ul>',
      '<p>We are glad to have you with us. See you soon!</p>',
    ].join('\n'),
  },
  {
    kind: EmailTemplateKind.WEEKLY,
    label: 'Weekly marketing content',
    description: 'Weekly menu highlights, promos, and what is new this week.',
    subject: 'This week at Moja Maison 🍱',
    preheader: 'Menu highlights and member deals for the week ahead.',
    bodyHtml: [
      '<h2>Hi {{name}}, here is what is cooking this week</h2>',
      '<p>Our kitchen has lined up a fresh rotation for the week. A few highlights:</p>',
      '<ul>',
      '  <li><strong>Monday</strong> — (dish highlight)</li>',
      '  <li><strong>Wednesday</strong> — (dish highlight)</li>',
      '  <li><strong>Friday</strong> — (dish highlight)</li>',
      '</ul>',
      '<p><strong>Member deal of the week:</strong> (describe the promo here).</p>',
      '<p>Order ahead in the bento app and skip the queue.</p>',
    ].join('\n'),
  },
  {
    kind: EmailTemplateKind.EVENT,
    label: 'Occasional event',
    description: 'Festive greetings, special events, one-off announcements.',
    subject: 'You are invited: (event name)',
    preheader: 'Something special is happening at Moja Maison.',
    bodyHtml: [
      '<h2>Dear {{name}},</h2>',
      '<p>We are excited to share that <strong>(event name)</strong> is happening on <strong>(date)</strong> at <strong>(location)</strong>.</p>',
      '<p>(Describe the event, what members get, and any terms.)</p>',
      '<p style="text-align:center;margin:24px 0;">',
      '  <a href="(link)" style="background:#c2410c;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;display:inline-block;font-weight:bold;">Find out more</a>',
      '</p>',
      '<p>We hope to see you there!</p>',
    ].join('\n'),
  },
  {
    kind: EmailTemplateKind.BIRTHDAY,
    label: 'Birthday voucher',
    description:
      'Birthday greeting with an attached voucher the member can spend online.',
    subject: 'Happy early birthday, {{name}} — a gift from us 🎂',
    preheader: 'Your birthday voucher is waiting in your member wallet.',
    bodyHtml: [
      '<h2>Happy birthday month, {{name}} 🎂</h2>',
      '<p>Your special day is coming up and we want to celebrate with you. We have added a gift to your member wallet:</p>',
      '<div style="background:#fff7ed;border:1px dashed #c2410c;border-radius:10px;padding:16px 20px;margin:16px 0;text-align:center;">',
      '  <p style="margin:0 0 4px;font-size:17px;"><strong>{{voucher_title}}</strong></p>',
      '  <p style="margin:0 0 4px;">Voucher code: <strong>{{voucher_code}}</strong></p>',
      '  <p style="margin:0;font-size:13px;color:#9a3412;">Valid until: {{voucher_expiry}}</p>',
      '</div>',
      '<p>The voucher is already in your account — just open the member app, shop as usual, and pick it at checkout to enjoy your birthday treat.</p>',
      '<p>We wish you a wonderful celebration! 🎉</p>',
    ].join('\n'),
  },
  {
    kind: EmailTemplateKind.PLAIN,
    label: 'Blank announcement',
    description: 'Start from a clean slate with just the branded layout.',
    subject: '',
    preheader: '',
    bodyHtml: '<h2>Hi {{name}},</h2>\n<p>(Write your message here.)</p>',
  },
];

export type RenderVoucherInfo = {
  code: string;
  title: string;
  expiresAt: Date | null;
};

export type RenderEmailInput = {
  subject: string;
  preheader: string | null;
  bodyHtml: string;
  recipientName: string | null;
  unsubscribeUrl: string | null;
  brandName: string;
  /** Voucher issued to this recipient; fills the {{voucher_*}} placeholders. */
  voucher?: RenderVoucherInfo | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyPlaceholders(
  html: string,
  name: string | null,
  voucher: RenderVoucherInfo | null | undefined,
): string {
  const safeName = escapeHtml((name ?? '').trim()) || 'there';
  const expiry = voucher
    ? voucher.expiresAt
      ? voucher.expiresAt.toLocaleDateString('en-MY', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Kuala_Lumpur',
        })
      : 'no expiry'
    : '';
  return html
    .replace(/\{\{\s*name\s*\}\}/gi, safeName)
    .replace(/\{\{\s*voucher_code\s*\}\}/gi, escapeHtml(voucher?.code ?? ''))
    .replace(/\{\{\s*voucher_title\s*\}\}/gi, escapeHtml(voucher?.title ?? ''))
    .replace(/\{\{\s*voucher_expiry\s*\}\}/gi, escapeHtml(expiry));
}

/** Strip tags for the plain-text alternative part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Wrap the admin-drafted inner HTML in the branded email layout and apply
 * per-recipient personalization. Returns subject/html/text ready for send.
 */
export function renderCampaignEmail(input: RenderEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = applyPlaceholders(
    input.subject,
    input.recipientName,
    input.voucher,
  )
    // Subjects are plain text: undo entity escaping from placeholder fill.
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  const body = applyPlaceholders(
    input.bodyHtml,
    input.recipientName,
    input.voucher,
  );
  const preheader = (input.preheader ?? '').trim();
  const brand = escapeHtml(input.brandName);

  const footerLinks = input.unsubscribeUrl
    ? `<a href="${input.unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe from marketing emails</a>`
    : '';

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f1ec;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:0 16px 12px;text-align:center;">
          <span style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#2b2118;">${brand}</span>
        </td></tr>
        <tr><td style="padding:0 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;">
            <tr><td style="padding:28px 28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2b2b2b;">
${body}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 24px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;">
          <p style="margin:0 0 4px;">You are receiving this email as a ${brand} member.</p>
          ${footerLinks ? `<p style="margin:0;">${footerLinks}</p>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textParts = [htmlToText(body)];
  if (input.unsubscribeUrl) {
    textParts.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  }

  return { subject, html, text: textParts.join('\n\n') };
}
