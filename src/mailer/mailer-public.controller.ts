import { Controller, Get, Header, Query } from '@nestjs/common';
import { MailerService } from './mailer.service';

/**
 * Public (unauthenticated) unsubscribe endpoint linked from every marketing
 * email footer. The signed token prevents third parties from unsubscribing
 * arbitrary members.
 */
@Controller('mailer')
export class MailerPublicController {
  constructor(private readonly mailer: MailerService) {}

  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribe(
    @Query('c') customerId?: string,
    @Query('t') token?: string,
  ): Promise<string> {
    const ok = await this.mailer.unsubscribe(
      (customerId ?? '').trim(),
      (token ?? '').trim(),
    );
    const title = ok ? 'You are unsubscribed' : 'Link not valid';
    const message = ok
      ? 'You will no longer receive marketing emails from us. You can opt back in anytime from your member account page.'
      : 'This unsubscribe link is invalid or has expired. Please contact our support team if you keep receiving unwanted emails.';
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f4f1ec;display:flex;min-height:100vh;align-items:center;justify-content:center;">
  <div style="background:#fff;border-radius:12px;padding:32px 28px;max-width:420px;margin:16px;text-align:center;box-shadow:0 8px 24px rgba(43,33,24,0.08);">
    <div style="font-size:40px;margin-bottom:8px;">${ok ? '✅' : '⚠️'}</div>
    <h1 style="font-size:20px;color:#2b2118;margin:0 0 8px;">${title}</h1>
    <p style="font-size:14px;color:#57534e;line-height:1.6;margin:0;">${message}</p>
  </div>
</body>
</html>`;
  }
}
