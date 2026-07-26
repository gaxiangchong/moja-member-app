import { Injectable } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

export type PaymentsSettings = {
  /**
   * Runtime override for PAYMENTS_DEMO_MODE. `null` means "no override, use
   * the .env value" (the deploy-time default); `true`/`false` take
   * precedence over .env until cleared.
   */
  demoModeOverride: boolean | null;
};

const DEFAULT_SETTINGS: PaymentsSettings = {
  demoModeOverride: null,
};

/**
 * File-backed store for global payments preferences. Dependency-light (no
 * Prisma). Mirrors the conventions of {@link ReportingSettingsService}.
 */
@Injectable()
export class PaymentsSettingsService {
  private filePath(): string {
    return resolve(process.cwd(), 'data', 'payments-settings.json');
  }

  private normalize(input: unknown): PaymentsSettings {
    const raw = (input ?? {}) as Partial<PaymentsSettings>;
    return {
      demoModeOverride:
        typeof raw.demoModeOverride === 'boolean'
          ? raw.demoModeOverride
          : null,
    };
  }

  getSettings(): PaymentsSettings {
    const p = this.filePath();
    if (!existsSync(p)) return { ...DEFAULT_SETTINGS };
    try {
      return this.normalize(JSON.parse(readFileSync(p, 'utf-8')));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  setSettings(input: unknown): PaymentsSettings {
    const next = this.normalize(input);
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(this.filePath(), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  /** `null` when no override is set (defer to .env `PAYMENTS_DEMO_MODE`). */
  getDemoModeOverride(): boolean | null {
    return this.getSettings().demoModeOverride;
  }
}
