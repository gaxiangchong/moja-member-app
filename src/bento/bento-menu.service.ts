import { Injectable } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

/** Mon–Sun weekday codes used as stable keys for the weekly menu. */
export const BENTO_WEEKDAY_CODES = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;
export type BentoWeekdayCode = (typeof BENTO_WEEKDAY_CODES)[number];

export type BentoMealDishes = {
  /** Regular / non-vegetarian dish name. */
  regular: string;
  /** Vegetarian dish name. */
  veg: string;
};

export type BentoWeekdayMenu = {
  weekday: BentoWeekdayCode;
  closed: boolean;
  lunch: BentoMealDishes;
  dinner: BentoMealDishes;
};

export type BentoMenuConfig = {
  weekdays: BentoWeekdayMenu[];
};

const EMPTY_DISHES: BentoMealDishes = { regular: '', veg: '' };

/**
 * Default weekly menu. Mon–Sat have dishes; Sunday is closed. Seeded from the
 * dishes that were previously hardcoded so behaviour is unchanged until an
 * admin edits the menu.
 */
const DEFAULT_CONFIG: BentoMenuConfig = {
  weekdays: [
    {
      weekday: 'Mon',
      closed: false,
      lunch: { regular: 'Teriyaki chicken bento', veg: 'Honey soy tofu bento' },
      dinner: { regular: 'Tom yum soup set', veg: 'Vegetable broth set' },
    },
    {
      weekday: 'Tue',
      closed: false,
      lunch: { regular: 'Sambal fish bento', veg: 'Vegetable curry bento' },
      dinner: { regular: 'Miso salmon soup set', veg: 'Mushroom soup set' },
    },
    {
      weekday: 'Wed',
      closed: false,
      lunch: { regular: 'Vegetable curry bento', veg: 'Vegetable curry bento' },
      dinner: { regular: 'Vegetable broth set', veg: 'Vegetable broth set' },
    },
    {
      weekday: 'Thu',
      closed: false,
      lunch: { regular: 'Beef rendang bento', veg: 'Mushroom masala bento' },
      dinner: { regular: 'Chicken corn soup set', veg: 'Corn & tofu soup set' },
    },
    {
      weekday: 'Fri',
      closed: false,
      lunch: { regular: 'Honey soy tofu bento', veg: 'Honey soy tofu bento' },
      dinner: {
        regular: 'Laksa-inspired soup set',
        veg: 'Laksa-inspired veg soup set',
      },
    },
    {
      weekday: 'Sat',
      closed: false,
      lunch: { regular: 'Grilled salmon bento', veg: 'Grilled tempeh bento' },
      dinner: { regular: 'Mushroom soup set', veg: 'Mushroom soup set' },
    },
    {
      weekday: 'Sun',
      closed: true,
      lunch: { ...EMPTY_DISHES },
      dinner: { ...EMPTY_DISHES },
    },
  ],
};

/**
 * File-backed store for the customer-facing weekly bento menu. Intentionally
 * dependency-light (no Prisma / payments) so it can be shared by both the bento
 * module and the admin module without circular imports, and kept completely
 * separate from the cake-sales shop catalog (different file + endpoints).
 */
@Injectable()
export class BentoMenuService {
  private filePath(): string {
    return resolve(process.cwd(), 'data', 'bento-menu.json');
  }

  private cloneDefault(): BentoMenuConfig {
    return {
      weekdays: DEFAULT_CONFIG.weekdays.map((d) => ({
        weekday: d.weekday,
        closed: d.closed,
        lunch: { ...d.lunch },
        dinner: { ...d.dinner },
      })),
    };
  }

  private sanitizeDishes(raw: unknown, fallback: BentoMealDishes): BentoMealDishes {
    const obj = (raw ?? {}) as Partial<BentoMealDishes>;
    const clean = (v: unknown, fb: string) =>
      typeof v === 'string' ? v.trim().slice(0, 200) : fb;
    return {
      regular: clean(obj.regular, fallback.regular),
      veg: clean(obj.veg, fallback.veg),
    };
  }

  /** Normalize arbitrary input into a full Mon–Sun config (all 7 days present). */
  private normalize(input: unknown): BentoMenuConfig {
    const defaults = this.cloneDefault();
    const byDay = new Map<BentoWeekdayCode, BentoWeekdayMenu>(
      defaults.weekdays.map((d) => [d.weekday, d]),
    );
    const root = (input ?? {}) as { weekdays?: unknown };
    const incoming = Array.isArray(root.weekdays) ? root.weekdays : [];
    for (const raw of incoming) {
      const code = (raw as Partial<BentoWeekdayMenu>)?.weekday;
      if (!code || !byDay.has(code as BentoWeekdayCode)) continue;
      const base = byDay.get(code as BentoWeekdayCode)!;
      const r = raw as Partial<BentoWeekdayMenu>;
      byDay.set(code as BentoWeekdayCode, {
        weekday: code as BentoWeekdayCode,
        closed: typeof r.closed === 'boolean' ? r.closed : base.closed,
        lunch: this.sanitizeDishes(r.lunch, base.lunch),
        dinner: this.sanitizeDishes(r.dinner, base.dinner),
      });
    }
    return {
      weekdays: BENTO_WEEKDAY_CODES.map((code) => byDay.get(code)!),
    };
  }

  getConfig(): BentoMenuConfig {
    const p = this.filePath();
    if (!existsSync(p)) return this.cloneDefault();
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8'));
      return this.normalize(parsed);
    } catch {
      return this.cloneDefault();
    }
  }

  setConfig(input: unknown): BentoMenuConfig {
    const next = this.normalize(input);
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(this.filePath(), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }
}
