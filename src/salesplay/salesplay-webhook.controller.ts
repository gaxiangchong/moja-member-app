import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SalesplayWebhookService } from './salesplay-webhook.service';

@Controller('webhooks')
export class SalesplayWebhookController {
  constructor(private readonly webhook: SalesplayWebhookService) {}

  /**
   * SalesPlay POS posts receipt/customer events here. Configure the URL in
   * SalesPlay (Integrations → Webhooks) as:
   *   https://<api-host>/webhooks/salesplay?token=<SALESPLAY_WEBHOOK_TOKEN>
   * Always responds 2xx quickly so SalesPlay does not retry/disable the hook.
   */
  @Post('salesplay')
  @HttpCode(200)
  @SkipThrottle()
  async salesplay(
    @Query('token') token: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    await this.webhook.handleWebhook(token, body);
    return { received: true };
  }
}
