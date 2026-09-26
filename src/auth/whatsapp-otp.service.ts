import { Injectable } from '@nestjs/common';
import { WhatsappMessagingService } from '../notifications/whatsapp-messaging.service';

/**
 * Login OTP over WhatsApp. Transport lives in {@link WhatsappMessagingService};
 * this wrapper keeps the auth module's public surface stable.
 */
@Injectable()
export class WhatsappOtpService {
  constructor(private readonly messaging: WhatsappMessagingService) {}

  isConfigured(): boolean {
    return this.messaging.isConfigured();
  }

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    await this.messaging.sendOtp(phoneE164, code);
  }
}
