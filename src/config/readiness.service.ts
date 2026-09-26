import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { accessSync, constants, mkdirSync } from 'node:fs';
import { EmailOtpService } from '../auth/email-otp.service';
import { SmsOtpService } from '../auth/sms-otp.service';
import { TwilioVerifyService } from '../auth/twilio-verify.service';
import { WhatsappOtpService } from '../auth/whatsapp-otp.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { dataDir } from './data-dir';
import { envFlagTrue } from './env-flags';

export type ReadinessLevel = 'critical' | 'warn' | 'info';

export type ReadinessCheck = {
  id: string;
  /** `critical` = unsafe to take real customers; `warn` = degraded; `info` = FYI. */
  level: ReadinessLevel;
  ok: boolean;
  message: string;
};

export type ReadinessReport = {
  environment: string;
  production: boolean;
  /** False when any critical check fails. */
  ready: boolean;
  checkedAt: string;
  checks: ReadinessCheck[];
};

const WEAK_SECRETS = new Set([
  '',
  'secret',
  'changeme',
  'change-me',
  'dev-secret',
  'generate-a-long-random-string',
  'comma-separated-admin-keys',
]);

/**
 * Boot-time and on-demand production readiness checks. In production a
 * failing critical check aborts startup (set `READINESS_ALLOW_UNSAFE=true`
 * to boot anyway, e.g. during a staged cut-over) — a bakery taking real
 * orders on demo payments or mock OTP is worse than a failed deploy.
 * `GET /health/readiness` (admin) returns the same report after deploy.
 */
@Injectable()
export class ReadinessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly whatsappOtp: WhatsappOtpService,
    private readonly smsOtp: SmsOtpService,
    private readonly twilioVerify: TwilioVerifyService,
    private readonly emailOtp: EmailOtpService,
  ) {}

  isProduction(): boolean {
    return (
      (this.config.get<string>('NODE_ENV') ?? '').trim().toLowerCase() ===
      'production'
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    const report = await this.report();
    const failing = report.checks.filter((c) => !c.ok);
    if (failing.length === 0) {
      this.logger.log(
        `Readiness: all ${report.checks.length} checks passed (${report.environment}).`,
      );
      return;
    }
    for (const c of failing) {
      const line = `[${c.level}] ${c.id}: ${c.message}`;
      if (c.level === 'critical') this.logger.error(line);
      else if (c.level === 'warn') this.logger.warn(line);
      else this.logger.log(line);
    }
    if (report.production && !report.ready) {
      if (envFlagTrue(this.config.get<string>('READINESS_ALLOW_UNSAFE'))) {
        this.logger.error(
          'Booting with failing critical readiness checks because READINESS_ALLOW_UNSAFE=true.',
        );
        return;
      }
      throw new Error(
        'Refusing to start in production with failing critical readiness checks (see log above; set READINESS_ALLOW_UNSAFE=true to override).',
      );
    }
  }

  async report(): Promise<ReadinessReport> {
    const production = this.isProduction();
    const checks: ReadinessCheck[] = [];
    const add = (
      id: string,
      level: ReadinessLevel,
      ok: boolean,
      message: string,
    ) => checks.push({ id, level, ok, message });
    const secret = (name: string) =>
      (this.config.get<string>(name) ?? '').trim();
    const strongSecret = (v: string) => v.length >= 32 && !WEAK_SECRETS.has(v);

    // --- Database -----------------------------------------------------------
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      add('database', 'critical', true, 'PostgreSQL reachable.');
    } catch (err) {
      add(
        'database',
        'critical',
        false,
        `PostgreSQL unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // --- Secrets ------------------------------------------------------------
    const jwt = secret('JWT_SECRET');
    add(
      'jwt_secret',
      'critical',
      strongSecret(jwt),
      strongSecret(jwt)
        ? 'JWT_SECRET is set.'
        : 'JWT_SECRET missing or weak — use a random string of 32+ chars.',
    );
    const adminJwt = secret('ADMIN_JWT_SECRET');
    add(
      'admin_jwt_secret',
      'warn',
      !adminJwt || strongSecret(adminJwt),
      adminJwt
        ? strongSecret(adminJwt)
          ? 'ADMIN_JWT_SECRET is set.'
          : 'ADMIN_JWT_SECRET is weak.'
        : 'ADMIN_JWT_SECRET unset — admin sessions share JWT_SECRET.',
    );
    const adminKeys = secret('ADMIN_API_KEYS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const weakAdminKey = adminKeys.some(
      (k) => k.length < 24 || WEAK_SECRETS.has(k),
    );
    add(
      'admin_api_keys',
      production ? 'critical' : 'warn',
      adminKeys.length === 0 || !weakAdminKey,
      adminKeys.length === 0
        ? 'ADMIN_API_KEYS unset (admin JWT login only).'
        : weakAdminKey
          ? 'ADMIN_API_KEYS contains a short/placeholder key.'
          : `${adminKeys.length} admin API key(s) configured.`,
    );
    const opsKey = secret('OPS_QUEUE_API_KEY');
    add(
      'ops_queue_api_key',
      production ? 'critical' : 'warn',
      opsKey.length >= 24 && !WEAK_SECRETS.has(opsKey),
      opsKey
        ? opsKey.length >= 24
          ? 'OPS_QUEUE_API_KEY is set.'
          : 'OPS_QUEUE_API_KEY is short — use 24+ random chars.'
        : 'OPS_QUEUE_API_KEY unset — kitchen/ops screens cannot sign in.',
    );

    // --- Payments -----------------------------------------------------------
    const demo = this.payments.paymentsDemoModeEnabled();
    add(
      'payments_demo_mode',
      'critical',
      !production || !demo,
      demo
        ? 'PAYMENTS_DEMO_MODE is ON — orders complete without charging. Turn off before launch.'
        : 'Live payments (demo mode off).',
    );
    const xenditKey = secret('XENDIT_SECRET_KEY');
    const xenditLive = xenditKey.startsWith('xnd_production_');
    add(
      'xendit_key',
      production ? 'critical' : 'info',
      !production || (Boolean(xenditKey) && xenditLive) || demo,
      xenditKey
        ? xenditLive
          ? 'Xendit production key configured.'
          : 'Xendit key is a development/test key.'
        : 'XENDIT_SECRET_KEY unset.',
    );
    const xenditWebhook = secret('XENDIT_WEBHOOK_TOKEN');
    add(
      'xendit_webhook_token',
      production ? 'critical' : 'warn',
      Boolean(xenditWebhook) || demo,
      xenditWebhook
        ? 'Xendit webhook token set — paste the same value in the Xendit dashboard.'
        : 'XENDIT_WEBHOOK_TOKEN unset — payment webhooks will be rejected and orders never confirm.',
    );

    // --- OTP / member login --------------------------------------------------
    const otpMode = (this.config.get<string>('OTP_DELIVERY_MODE') ?? 'auto')
      .trim()
      .toLowerCase();
    const wa = this.whatsappOtp.isConfigured();
    const sms = this.smsOtp.isConfigured();
    const verify = this.twilioVerify.isConfigured();
    const email = this.emailOtp.isConfigured();
    const anyRealChannel = wa || sms || verify || email;
    const otpIsMock =
      otpMode === 'mock' || (!anyRealChannel && otpMode === 'auto');
    add(
      'otp_delivery',
      'critical',
      !production || !otpIsMock,
      otpIsMock
        ? `OTP_DELIVERY_MODE=${otpMode} with no real channel — codes are returned in the API response.`
        : `OTP mode=${otpMode}; channels: whatsapp=${wa} email=${email} sms=${sms} verify=${verify}.`,
    );
    add(
      'whatsapp_otp',
      'warn',
      wa,
      wa
        ? `WhatsApp OTP configured (provider=${(this.config.get<string>('WHATSAPP_PROVIDER') ?? 'meta').trim() || 'meta'}).`
        : 'WhatsApp OTP not configured — first-time registration falls back to email/SMS.',
    );
    const waTemplate =
      secret('WHATSAPP_OTP_TEMPLATE_NAME') ||
      secret('TWILIO_WHATSAPP_CONTENT_SID');
    add(
      'whatsapp_template',
      production ? 'warn' : 'info',
      !wa || Boolean(waTemplate),
      waTemplate
        ? 'WhatsApp OTP uses an approved template.'
        : 'No WhatsApp template configured — plain-text OTP only works in sandbox / 24h reply window.',
    );
    const waProvider = (this.config.get<string>('WHATSAPP_PROVIDER') ?? 'meta')
      .trim()
      .toLowerCase();
    const orderReadyTemplate = secret(
      waProvider === 'twilio'
        ? 'TWILIO_WHATSAPP_ORDER_READY_CONTENT_SID'
        : 'WHATSAPP_ORDER_READY_TEMPLATE_NAME',
    );
    const receiptEmail =
      Boolean(secret('RESEND_API_KEY')) &&
      Boolean(secret('RECEIPT_EMAIL_FROM') || secret('OTP_EMAIL_FROM'));
    add(
      'order_ready_notification',
      production ? 'warn' : 'info',
      Boolean(orderReadyTemplate),
      orderReadyTemplate
        ? 'Order-ready WhatsApp template configured.'
        : receiptEmail
          ? 'Order-ready WhatsApp template is not set — members are emailed when the kitchen marks an order ready, until Meta approves the template.'
          : 'No order-ready WhatsApp template and no email sender — members will not be told when an order is ready.',
    );

    // --- Web origins ----------------------------------------------------------
    const origins = secret('CLIENT_WEB_ORIGIN');
    const hasLocalhostOrigin = /localhost|127\.0\.0\.1/.test(origins);
    add(
      'client_web_origin',
      production ? 'critical' : 'info',
      Boolean(origins) && (!production || !hasLocalhostOrigin),
      origins
        ? hasLocalhostOrigin && production
          ? `CLIENT_WEB_ORIGIN contains a localhost origin (${origins}).`
          : `CORS origins: ${origins}.`
        : 'CLIENT_WEB_ORIGIN unset — CORS allows any origin.',
    );
    const publicUrl =
      secret('MEMBER_APP_PUBLIC_URL') || secret('API_PUBLIC_URL');
    add(
      'public_urls',
      'warn',
      Boolean(publicUrl),
      publicUrl
        ? `Public URL: ${publicUrl}.`
        : 'MEMBER_APP_PUBLIC_URL / API_PUBLIC_URL unset — links in emails may be wrong.',
    );

    // --- Persistent data dir --------------------------------------------------
    const dir = dataDir();
    let writable = true;
    try {
      mkdirSync(dir, { recursive: true });
      accessSync(dir, constants.W_OK);
    } catch {
      writable = false;
    }
    add(
      'data_dir_writable',
      'critical',
      writable,
      writable ? `Data dir writable: ${dir}` : `Data dir not writable: ${dir}`,
    );
    const dataDirConfigured = Boolean(secret('DATA_DIR'));
    add(
      'data_dir_persistent',
      production ? 'warn' : 'info',
      !production || dataDirConfigured,
      dataDirConfigured
        ? `DATA_DIR=${dir} (mount a persistent volume here).`
        : `DATA_DIR unset — uploads live in ${dir}; on ephemeral hosts they vanish on redeploy. Set DATA_DIR to a mounted volume.`,
    );

    // --- SalesPlay ------------------------------------------------------------
    const spEnabled = envFlagTrue(this.config.get<string>('SALESPLAY_ENABLED'));
    const spWebhook = secret('SALESPLAY_WEBHOOK_TOKEN');
    add(
      'salesplay',
      'warn',
      !spEnabled || Boolean(spWebhook),
      spEnabled
        ? spWebhook
          ? 'SalesPlay enabled with webhook token.'
          : 'SALESPLAY_ENABLED but SALESPLAY_WEBHOOK_TOKEN unset — in-store receipts will not sync.'
        : 'SalesPlay integration disabled.',
    );

    // --- Email ----------------------------------------------------------------
    const resend = secret('RESEND_API_KEY');
    add(
      'email',
      'warn',
      Boolean(resend),
      resend
        ? 'Resend configured (receipts, campaigns, email OTP).'
        : 'RESEND_API_KEY unset — receipt emails and email OTP are disabled.',
    );

    const ready = checks.every((c) => c.ok || c.level !== 'critical');
    return {
      environment: this.config.get<string>('NODE_ENV') ?? 'development',
      production,
      ready,
      checkedAt: new Date().toISOString(),
      checks,
    };
  }
}
