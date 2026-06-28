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
import {
  addDaysUtc,
  BENTO_DISPLAY_WEEKS,
  displayWeekStartIsos,
  formatDateOnly,
  parseDateOnly,
} from './bento-weekly.util';

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
  'Lunch Regular Desc (EN)',
  'Lunch Regular Desc (中文)',
  'Lunch Vegetarian (EN)',
  'Lunch Vegetarian (中文)',
  'Lunch Veg Desc (EN)',
  'Lunch Veg Desc (中文)',
  'Dinner Regular (EN)',
  'Dinner Regular (中文)',
  'Dinner Regular Desc (EN)',
  'Dinner Regular Desc (中文)',
  'Dinner Vegetarian (EN)',
  'Dinner Vegetarian (中文)',
  'Dinner Veg Desc (EN)',
  'Dinner Veg Desc (中文)',
] as const;

export type BentoMealDishes = {
  /** Regular / non-vegetarian main dish name (English). */
  regular: string;
  /** Vegetarian main dish name (English). */
  veg: string;
  /** Regular main dish in Chinese (optional). */
  regularZh: string;
  /** Vegetarian main dish in Chinese (optional). */
  vegZh: string;
  /** Regular dish description (English). */
  regularDesc: string;
  /** Regular dish description in Chinese (optional). */
  regularDescZh: string;
  /** Vegetarian dish description (English). */
  vegDesc: string;
  /** Vegetarian dish description in Chinese (optional). */
  vegDescZh: string;
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

/**
 * On-disk shape. `weekdays` is the recurring default/template (also the source
 * of the closed-weekday pattern that drives scheduling). `weeks` holds optional
 * per-week dish/photo overrides keyed by that week's Monday (YYYY-MM-DD).
 */
type BentoMenuStore = {
  template: BentoMenuConfig;
  weeks: Record<string, BentoMenuConfig>;
};

const ISO_WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_DISHES: BentoMealDishes = {
  regular: '',
  veg: '',
  regularZh: '',
  vegZh: '',
  regularDesc: '',
  regularDescZh: '',
  vegDesc: '',
  vegDescZh: '',
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

export type BentoMenuImportWeek = {
  weekIndex: number;
  weekStart: string;
  config: BentoMenuConfig;
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
    const clean = (v: unknown, fb: string, max = 200) =>
      typeof v === 'string' ? v.trim().slice(0, max) : fb;
    return {
      regular: clean(obj.regular, fallback.regular),
      veg: clean(obj.veg, fallback.veg),
      regularZh: clean(obj.regularZh, fallback.regularZh),
      vegZh: clean(obj.vegZh, fallback.vegZh),
      regularDesc: clean(obj.regularDesc, fallback.regularDesc, 500),
      regularDescZh: clean(obj.regularDescZh, fallback.regularDescZh, 500),
      vegDesc: clean(obj.vegDesc, fallback.vegDesc, 500),
      vegDescZh: clean(obj.vegDescZh, fallback.vegDescZh, 500),
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

  /** Read the full store (template + per-week overrides), tolerating the legacy
   * shape where the file only held `{ weekdays: [...] }`. */
  private readStore(): BentoMenuStore {
    const p = this.filePath();
    if (!existsSync(p)) return { template: this.cloneDefault(), weeks: {} };
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8')) as {
        weekdays?: unknown;
        weeks?: Record<string, unknown>;
      };
      const template = this.normalize(parsed);
      const weeks: Record<string, BentoMenuConfig> = {};
      if (parsed && typeof parsed.weeks === 'object' && parsed.weeks) {
        for (const [iso, cfg] of Object.entries(parsed.weeks)) {
          if (ISO_WEEK_RE.test(iso)) weeks[iso] = this.normalize(cfg);
        }
      }
      return { template, weeks };
    } catch {
      return { template: this.cloneDefault(), weeks: {} };
    }
  }

  private writeStore(store: BentoMenuStore): void {
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    const weekEntries = Object.entries(store.weeks);
    const out: { weekdays: BentoWeekdayMenu[]; weeks?: Record<string, BentoMenuConfig> } = {
      weekdays: store.template.weekdays,
    };
    if (weekEntries.length > 0) {
      out.weeks = Object.fromEntries(
        weekEntries.map(([iso, cfg]) => [iso, { weekdays: cfg.weekdays }]),
      );
    }
    writeFileSync(this.filePath(), JSON.stringify(out, null, 2), 'utf-8');
  }

  /** Recurring default/template. Also the canonical source for closed weekdays
   * used by the scheduling rules — unchanged contract for existing callers. */
  getConfig(): BentoMenuConfig {
    return this.readStore().template;
  }

  setConfig(input: unknown): BentoMenuConfig {
    const store = this.readStore();
    store.template = this.normalize(input);
    this.writeStore(store);
    return store.template;
  }

  /**
   * Effective menu for a specific week (its Monday in YYYY-MM-DD): per-week dish
   * overrides when present, otherwise the recurring template. The `closed` flag
   * always comes from the template so closed weekdays stay consistent with
   * scheduling across every week.
   */
  getWeekConfig(weekStartIso: string): BentoMenuConfig {
    const { template, weeks } = this.readStore();
    const override = weeks[weekStartIso];
    if (!override) return template;
    const tplByDay = new Map(template.weekdays.map((d) => [d.weekday, d]));
    const ovByDay = new Map(override.weekdays.map((d) => [d.weekday, d]));
    return {
      weekdays: BENTO_WEEKDAY_CODES.map((code) => {
        const tpl = tplByDay.get(code)!;
        const ov = ovByDay.get(code);
        return {
          weekday: code,
          closed: tpl.closed,
          lunch: ov?.lunch ?? tpl.lunch,
          dinner: ov?.dinner ?? tpl.dinner,
        };
      }),
    };
  }

  /**
   * Save dish/photo overrides for a specific week. Closed-weekday edits are
   * applied to the shared template because closed weekdays drive scheduling for
   * all weeks (not just the edited one).
   */
  setWeekConfig(weekStartIso: string, input: unknown): BentoMenuConfig {
    if (!ISO_WEEK_RE.test(weekStartIso)) {
      throw new BadRequestException({
        code: 'BENTO_MENU_BAD_WEEK',
        message: 'Invalid week start date.',
      });
    }
    const store = this.readStore();
    const incoming = this.normalize(input);
    store.weeks[weekStartIso] = { weekdays: incoming.weekdays };
    const tplByDay = new Map(store.template.weekdays.map((d) => [d.weekday, d]));
    for (const d of incoming.weekdays) {
      const tpl = tplByDay.get(d.weekday);
      if (tpl) tpl.closed = d.closed;
    }
    this.writeStore(store);
    return this.getWeekConfig(weekStartIso);
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

  /** Build a 4-sheet .xlsx template (Week 1–Week 4), each pre-filled with that
   * calendar week's effective menu. */
  async buildTemplateBuffer(): Promise<Buffer> {
    const weekStarts = displayWeekStartIsos(BENTO_DISPLAY_WEEKS);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Moja Admin';
    wb.created = new Date();

    for (let i = 0; i < weekStarts.length; i += 1) {
      const weekStartIso = weekStarts[i];
      const weekEndIso = formatDateOnly(
        addDaysUtc(parseDateOnly(weekStartIso), 6),
      );
      const config = this.getWeekConfig(weekStartIso);
      const ws = wb.addWorksheet(`Week ${i + 1}`);
      ws.addRow([
        `Week ${i + 1}: ${weekStartIso} — ${weekEndIso} (Mon–Sun). Edit dishes below.`,
      ]);
      ws.getRow(1).font = { italic: true, color: { argb: 'FF666666' } };
      ws.addRow([...BENTO_MENU_TEMPLATE_HEADERS]);
      for (const d of config.weekdays) {
        ws.addRow([
          d.weekday,
          d.closed ? 'yes' : 'no',
          d.lunch.regular,
          d.lunch.regularZh,
          d.lunch.regularDesc,
          d.lunch.regularDescZh,
          d.lunch.veg,
          d.lunch.vegZh,
          d.lunch.vegDesc,
          d.lunch.vegDescZh,
          d.dinner.regular,
          d.dinner.regularZh,
          d.dinner.regularDesc,
          d.dinner.regularDescZh,
          d.dinner.veg,
          d.dinner.vegZh,
          d.dinner.vegDesc,
          d.dinner.vegDescZh,
        ]);
      }
      ws.getRow(2).font = { bold: true };
      ws.columns = BENTO_MENU_TEMPLATE_HEADERS.map((_, col) => ({
        width: col === 0 ? 8 : col === 1 ? 16 : 26,
      }));
    }

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * Parse an uploaded file into one config per sheet (Week 1–4). Multi-sheet
   * .xlsx maps sheet names to weeks; single-sheet .xlsx / .csv uses
   * `fallbackWeekIndex` (default 0).
   */
  async parseUploadToWeeks(
    file?: Express.Multer.File,
    fallbackWeekIndex = 0,
  ): Promise<BentoMenuImportWeek[]> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'BENTO_MENU_IMPORT_EMPTY',
        message: 'No file uploaded. Choose a .xlsx or .csv file.',
      });
    }
    const isCsv =
      (file.originalname || '').toLowerCase().endsWith('.csv') ||
      file.mimetype === 'text/csv';
    const weekStarts = displayWeekStartIsos(BENTO_DISPLAY_WEEKS);

    if (isCsv) {
      let rows: string[][];
      try {
        rows = await this.readRowsFromBuffer(file.buffer, true);
      } catch {
        throw new BadRequestException({
          code: 'BENTO_MENU_IMPORT_UNREADABLE',
          message: 'Could not read the CSV file.',
        });
      }
      const idx = this.clampWeekIndex(fallbackWeekIndex);
      return [
        {
          weekIndex: idx,
          weekStart: weekStarts[idx],
          config: this.parseRowsToConfig(rows, weekStarts[idx]),
        },
      ];
    }

    let sheets: Array<{ name: string; rows: string[][] }>;
    try {
      sheets = await this.readAllSheets(file.buffer);
    } catch {
      throw new BadRequestException({
        code: 'BENTO_MENU_IMPORT_UNREADABLE',
        message:
          'Could not read the file. Upload the 4-week .xlsx template or a .csv.',
      });
    }

    const parsed: BentoMenuImportWeek[] = [];
    for (const sheet of sheets) {
      const weekIndex = this.parseSheetNameToWeekIndex(sheet.name);
      if (weekIndex == null) continue;
      parsed.push({
        weekIndex,
        weekStart: weekStarts[weekIndex],
        config: this.parseRowsToConfig(sheet.rows, weekStarts[weekIndex]),
      });
    }

    if (parsed.length === 0 && sheets.length === 1) {
      const idx = this.clampWeekIndex(fallbackWeekIndex);
      parsed.push({
        weekIndex: idx,
        weekStart: weekStarts[idx],
        config: this.parseRowsToConfig(sheets[0].rows, weekStarts[idx]),
      });
    }

    if (parsed.length === 0) {
      throw new BadRequestException({
        code: 'BENTO_MENU_IMPORT_NO_SHEETS',
        message:
          'No Week 1–4 sheets found. Name each tab "Week 1", "Week 2", etc., or use the downloaded template.',
      });
    }

    parsed.sort((a, b) => a.weekIndex - b.weekIndex);
    return parsed;
  }

  /** @deprecated Use parseUploadToWeeks — kept for single-week callers. */
  async parseUploadToConfig(
    file?: Express.Multer.File,
    weekStartIso?: string,
  ): Promise<BentoMenuConfig> {
    const weekStarts = displayWeekStartIsos(BENTO_DISPLAY_WEEKS);
    const fallbackIdx = weekStartIso
      ? Math.max(0, weekStarts.indexOf(weekStartIso))
      : 0;
    const weeks = await this.parseUploadToWeeks(file, fallbackIdx);
    return weeks[0].config;
  }

  private clampWeekIndex(idx: number): number {
    if (!Number.isInteger(idx) || idx < 0) return 0;
    return Math.min(idx, BENTO_DISPLAY_WEEKS - 1);
  }

  private parseSheetNameToWeekIndex(name: string): number | null {
    const s = (name || '').trim().toLowerCase();
    const m = /^week\s*(\d+)$/.exec(s);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    if (!Number.isInteger(n) || n < 1 || n > BENTO_DISPLAY_WEEKS) return null;
    return n - 1;
  }

  private parseRowsToConfig(
    rows: string[][],
    weekStartIso: string,
  ): BentoMenuConfig {
    const baseConfig = this.getWeekConfig(weekStartIso);
    const current = new Map(baseConfig.weekdays.map((d) => [d.weekday, d]));
    const dataRows = this.stripHeaderRow(rows);
    const extended = dataRows.some((r) => r.length >= 14);
    const weekdays: BentoWeekdayMenu[] = [];
    for (const r of dataRows) {
      const code = this.normalizeWeekday(r[0] ?? '');
      if (!code) continue;
      const existing = current.get(code);
      weekdays.push({
        weekday: code,
        closed: this.parseClosedCell(r[1] ?? ''),
        lunch: extended
          ? {
              regular: (r[2] ?? '').trim(),
              regularZh: (r[3] ?? '').trim(),
              regularDesc: (r[4] ?? '').trim(),
              regularDescZh: (r[5] ?? '').trim(),
              veg: (r[6] ?? '').trim(),
              vegZh: (r[7] ?? '').trim(),
              vegDesc: (r[8] ?? '').trim(),
              vegDescZh: (r[9] ?? '').trim(),
              image: existing?.lunch.image ?? '',
            }
          : {
              regular: (r[2] ?? '').trim(),
              regularZh: (r[3] ?? '').trim(),
              regularDesc: existing?.lunch.regularDesc ?? '',
              regularDescZh: existing?.lunch.regularDescZh ?? '',
              veg: (r[4] ?? '').trim(),
              vegZh: (r[5] ?? '').trim(),
              vegDesc: existing?.lunch.vegDesc ?? '',
              vegDescZh: existing?.lunch.vegDescZh ?? '',
              image: existing?.lunch.image ?? '',
            },
        dinner: extended
          ? {
              regular: (r[10] ?? '').trim(),
              regularZh: (r[11] ?? '').trim(),
              regularDesc: (r[12] ?? '').trim(),
              regularDescZh: (r[13] ?? '').trim(),
              veg: (r[14] ?? '').trim(),
              vegZh: (r[15] ?? '').trim(),
              vegDesc: (r[16] ?? '').trim(),
              vegDescZh: (r[17] ?? '').trim(),
              image: existing?.dinner.image ?? '',
            }
          : {
              regular: (r[6] ?? '').trim(),
              regularZh: (r[7] ?? '').trim(),
              regularDesc: existing?.dinner.regularDesc ?? '',
              regularDescZh: existing?.dinner.regularDescZh ?? '',
              veg: (r[8] ?? '').trim(),
              vegZh: (r[9] ?? '').trim(),
              vegDesc: existing?.dinner.vegDesc ?? '',
              vegDescZh: existing?.dinner.vegDescZh ?? '',
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

  private async readRowsFromBuffer(
    buffer: Buffer,
    isCsv: boolean,
  ): Promise<string[][]> {
    if (isCsv) {
      const parsed = parseCsv(buffer.toString('utf8'), {
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
      }) as unknown[][];
      return parsed.map((r) => r.map((c) => this.cellToString(c)));
    }
    const sheets = await this.readAllSheets(buffer);
    return sheets[0]?.rows ?? [];
  }

  private async readAllSheets(
    buffer: Buffer,
  ): Promise<Array<{ name: string; rows: string[][] }>> {
    const wb = new ExcelJS.Workbook();
    // @ts-expect-error Buffer/Uint8Array mismatch between @types/node and exceljs
    await wb.xlsx.load(buffer);
    return wb.worksheets.map((ws) => {
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const vals: string[] = [];
        for (let c = 1; c <= BENTO_MENU_TEMPLATE_HEADERS.length; c += 1) {
          vals.push(this.cellToString(row.getCell(c).value));
        }
        rows.push(vals);
      });
      return { name: ws.name, rows };
    });
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
    const out: string[][] = [];
    for (const row of rows) {
      const first = (row[0] ?? '').trim().toLowerCase();
      if (first === 'day' || first === 'weekday') continue;
      if (first.startsWith('week starting') || first.startsWith('week:')) continue;
      if (/^week\s*\d+:/.test(first)) continue;
      out.push(row);
    }
    return out;
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
