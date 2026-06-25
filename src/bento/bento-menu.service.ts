import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

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

/**
 * Column order for the downloadable weekly-menu spreadsheet/CSV template. The
 * importer maps strictly by this position, so the header row is optional on
 * upload as long as columns stay in this order.
 */
export const BENTO_MENU_TEMPLATE_HEADERS = [
  'Day',
  'Closed (yes/no)',
  'Lunch Regular (EN)',
  'Lunch Regular (中文)',
  'Lunch Vegetarian (EN)',
  'Lunch Vegetarian (中文)',
  'Dinner Regular (EN)',
  'Dinner Regular (中文)',
  'Dinner Vegetarian (EN)',
  'Dinner Vegetarian (中文)',
] as const;

export type BentoMealDishes = {
  /** Regular / non-vegetarian dish name (English). */
  regular: string;
  /** Vegetarian dish name (English). */
  veg: string;
  /** Regular dish name in Chinese (optional). */
  regularZh: string;
  /** Vegetarian dish name in Chinese (optional). */
  vegZh: string;
  /** Photo for this meal (shown in the client thumbnail). Internal
   * `/uploads/bento-menu/…` path or an http(s) URL; empty = use icon tile. */
  image: string;
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

const EMPTY_DISHES: BentoMealDishes = {
  regular: '',
  veg: '',
  regularZh: '',
  vegZh: '',
  image: '',
};

const BENTO_MENU_IMAGE_PUBLIC_PREFIX = '/uploads/bento-menu/';
const BENTO_MENU_IMAGE_ALLOWED_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const BENTO_MENU_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

/** Keep only empty, an internal upload path, or a plain http(s) URL. */
function sanitizeMenuImageUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.trim().slice(0, 512);
  if (!s) return '';
  if (s.startsWith(BENTO_MENU_IMAGE_PUBLIC_PREFIX)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

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
      lunch: { ...EMPTY_DISHES, regular: 'Teriyaki chicken bento', veg: 'Honey soy tofu bento' },
      dinner: { ...EMPTY_DISHES, regular: 'Tom yum soup set', veg: 'Vegetable broth set' },
    },
    {
      weekday: 'Tue',
      closed: false,
      lunch: { ...EMPTY_DISHES, regular: 'Sambal fish bento', veg: 'Vegetable curry bento' },
      dinner: { ...EMPTY_DISHES, regular: 'Miso salmon soup set', veg: 'Mushroom soup set' },
    },
    {
      weekday: 'Wed',
      closed: false,
      lunch: { ...EMPTY_DISHES, regular: 'Vegetable curry bento', veg: 'Vegetable curry bento' },
      dinner: { ...EMPTY_DISHES, regular: 'Vegetable broth set', veg: 'Vegetable broth set' },
    },
    {
      weekday: 'Thu',
      closed: false,
      lunch: { ...EMPTY_DISHES, regular: 'Beef rendang bento', veg: 'Mushroom masala bento' },
      dinner: { ...EMPTY_DISHES, regular: 'Chicken corn soup set', veg: 'Corn & tofu soup set' },
    },
    {
      weekday: 'Fri',
      closed: false,
      lunch: { ...EMPTY_DISHES, regular: 'Honey soy tofu bento', veg: 'Honey soy tofu bento' },
      dinner: {
        ...EMPTY_DISHES,
        regular: 'Laksa-inspired soup set',
        veg: 'Laksa-inspired veg soup set',
      },
    },
    {
      weekday: 'Sat',
      closed: false,
      lunch: { ...EMPTY_DISHES, regular: 'Grilled salmon bento', veg: 'Grilled tempeh bento' },
      dinner: { ...EMPTY_DISHES, regular: 'Mushroom soup set', veg: 'Mushroom soup set' },
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
        lunch: { ...EMPTY_DISHES, ...d.lunch },
        dinner: { ...EMPTY_DISHES, ...d.dinner },
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
      regularZh: clean(obj.regularZh, fallback.regularZh),
      vegZh: clean(obj.vegZh, fallback.vegZh),
      image:
        obj.image !== undefined
          ? sanitizeMenuImageUrl(obj.image)
          : fallback.image ?? '',
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

  /**
   * Store an uploaded dish photo on the persistent uploads disk and return its
   * public URL (`/uploads/bento-menu/<file>`). The admin then sets that URL on
   * the relevant meal and saves the menu. Mirrors the shop-catalog image upload.
   */
  saveMenuImage(file?: {
    buffer: Buffer;
    mimetype: string;
    originalname?: string;
    size: number;
  }): { url: string } {
    if (!file || !file.buffer || !file.buffer.length) {
      throw new BadRequestException({
        code: 'BENTO_MENU_IMAGE_EMPTY',
        message: 'No image uploaded.',
      });
    }
    if (file.size > BENTO_MENU_IMAGE_MAX_BYTES) {
      throw new BadRequestException({
        code: 'BENTO_MENU_IMAGE_TOO_LARGE',
        message: `Image too large. Max ${Math.round(
          BENTO_MENU_IMAGE_MAX_BYTES / 1024 / 1024,
        )} MB.`,
      });
    }
    const ext =
      BENTO_MENU_IMAGE_ALLOWED_MIME[String(file.mimetype || '').toLowerCase()] ||
      (file.originalname ? extname(file.originalname).toLowerCase() : '');
    const allowedExts = new Set(Object.values(BENTO_MENU_IMAGE_ALLOWED_MIME));
    if (!ext || !allowedExts.has(ext)) {
      throw new BadRequestException({
        code: 'BENTO_MENU_IMAGE_UNSUPPORTED',
        message: 'Unsupported image type. Use PNG, JPEG, WEBP, or GIF.',
      });
    }

    const dir = resolve(process.cwd(), 'data', 'uploads', 'bento-menu');
    mkdirSync(dir, { recursive: true });
    const filename = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
    writeFileSync(resolve(dir, filename), file.buffer);
    return { url: `${BENTO_MENU_IMAGE_PUBLIC_PREFIX}${filename}` };
  }

  // --- Spreadsheet template download + import (review-then-save flow) ---

  /** Build an .xlsx template pre-filled with the current menu for the admin to
   * edit and re-upload. One row per weekday (Mon–Sun). */
  async buildTemplateBuffer(): Promise<Buffer> {
    const config = this.getConfig();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Moja Admin';
    wb.created = new Date();
    const ws = wb.addWorksheet('Bento Weekly Menu');
    ws.addRow([...BENTO_MENU_TEMPLATE_HEADERS]);
    for (const d of config.weekdays) {
      ws.addRow([
        d.weekday,
        d.closed ? 'yes' : 'no',
        d.lunch.regular,
        d.lunch.regularZh,
        d.lunch.veg,
        d.lunch.vegZh,
        d.dinner.regular,
        d.dinner.regularZh,
        d.dinner.veg,
        d.dinner.vegZh,
      ]);
    }
    ws.getRow(1).font = { bold: true };
    ws.columns = BENTO_MENU_TEMPLATE_HEADERS.map((_, i) => ({
      width: i === 0 ? 8 : i === 1 ? 16 : 26,
    }));
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * Parse an uploaded .xlsx or .csv file into a normalized menu config. Does
   * NOT persist — the caller (admin UI) loads the result into the editor so the
   * admin can review before saving via the existing PUT /admin/bento-menu.
   */
  async parseUploadToConfig(
    file?: Express.Multer.File,
  ): Promise<BentoMenuConfig> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'BENTO_MENU_IMPORT_EMPTY',
        message: 'No file uploaded. Choose a .xlsx or .csv file.',
      });
    }
    const isCsv =
      (file.originalname || '').toLowerCase().endsWith('.csv') ||
      file.mimetype === 'text/csv';
    let rows: string[][];
    try {
      rows = await this.readRows(file.buffer, isCsv);
    } catch {
      throw new BadRequestException({
        code: 'BENTO_MENU_IMPORT_UNREADABLE',
        message:
          'Could not read the file. Upload the unmodified .xlsx/.csv template.',
      });
    }

    // The template is text-only — preserve any photos already uploaded for each
    // day/meal so a CSV/xlsx import doesn't wipe them.
    const current = new Map(
      this.getConfig().weekdays.map((d) => [d.weekday, d]),
    );

    const dataRows = this.stripHeaderRow(rows);
    const weekdays: BentoWeekdayMenu[] = [];
    for (const r of dataRows) {
      const code = this.normalizeWeekday(r[0] ?? '');
      if (!code) continue;
      const existing = current.get(code);
      weekdays.push({
        weekday: code,
        closed: this.parseClosedCell(r[1] ?? ''),
        lunch: {
          regular: (r[2] ?? '').trim(),
          regularZh: (r[3] ?? '').trim(),
          veg: (r[4] ?? '').trim(),
          vegZh: (r[5] ?? '').trim(),
          image: existing?.lunch.image ?? '',
        },
        dinner: {
          regular: (r[6] ?? '').trim(),
          regularZh: (r[7] ?? '').trim(),
          veg: (r[8] ?? '').trim(),
          vegZh: (r[9] ?? '').trim(),
          image: existing?.dinner.image ?? '',
        },
      });
    }
    if (weekdays.length === 0) {
      throw new BadRequestException({
        code: 'BENTO_MENU_IMPORT_NO_ROWS',
        message:
          'No valid weekday rows found. Keep the Day column (Mon–Sun) from the template.',
      });
    }
    return this.normalize({ weekdays });
  }

  private async readRows(buffer: Buffer, isCsv: boolean): Promise<string[][]> {
    if (isCsv) {
      const parsed = parseCsv(buffer.toString('utf8'), {
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
      }) as unknown[][];
      return parsed.map((r) => r.map((c) => this.cellToString(c)));
    }
    const wb = new ExcelJS.Workbook();
    // Multer buffer is a Uint8Array-backed Buffer; exceljs typings are strict.
    // @ts-expect-error Buffer/Uint8Array mismatch between @types/node and exceljs
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const out: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let c = 1; c <= BENTO_MENU_TEMPLATE_HEADERS.length; c += 1) {
        vals.push(this.cellToString(row.getCell(c).value));
      }
      out.push(vals);
    });
    return out;
  }

  private cellToString(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
    if (v instanceof Date) return v.toISOString();
    const obj = v as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: string }>;
    };
    if (typeof obj.text === 'string') return obj.text.trim();
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((t) => t.text || '').join('').trim();
    }
    if (obj.result != null) return String(obj.result).trim();
    return '';
  }

  private stripHeaderRow(rows: string[][]): string[][] {
    if (rows.length === 0) return rows;
    const first = (rows[0][0] ?? '').trim().toLowerCase();
    return first === 'day' || first === 'weekday' ? rows.slice(1) : rows;
  }

  private normalizeWeekday(raw: string): BentoWeekdayCode | null {
    const s = (raw || '').trim().toLowerCase();
    if (!s) return null;
    const map: Record<string, BentoWeekdayCode> = {
      mon: 'Mon',
      tue: 'Tue',
      wed: 'Wed',
      thu: 'Thu',
      fri: 'Fri',
      sat: 'Sat',
      sun: 'Sun',
    };
    return map[s.slice(0, 3)] ?? null;
  }

  private parseClosedCell(raw: string): boolean {
    return ['yes', 'y', 'true', '1', 'closed', 'x'].includes(
      (raw || '').trim().toLowerCase(),
    );
  }
}
