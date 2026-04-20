import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type HomeAdSlide = {
  id: string;
  title: string;
  body: string;
  backgroundCss: string;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

const ALLOWED_IMAGE_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const DEFAULT_SLIDES: HomeAdSlide[] = [
  {
    id: 'ad-double-points',
    title: 'Double Points',
    body: 'Coffee + Pastry before 11 AM',
    backgroundCss: 'linear-gradient(135deg, #fef3c7, #fde68a)',
    sortOrder: 10,
    isActive: true,
  },
  {
    id: 'ad-birthday',
    title: 'Birthday Treat',
    body: 'Free cake slice on your big day',
    backgroundCss: 'linear-gradient(135deg, #ffe4e6, #fecaca)',
    sortOrder: 20,
    isActive: true,
  },
  {
    id: 'ad-refer',
    title: 'Refer & Earn',
    body: '500 pts per friend who joins',
    backgroundCss: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
    sortOrder: 30,
    isActive: true,
  },
];

@Injectable()
export class HomeAdsService {
  private filePath(): string {
    return resolve(process.cwd(), 'data', 'home-ads.slides.json');
  }

  private ensureFile(): void {
    const p = this.filePath();
    if (existsSync(p)) return;
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(p, JSON.stringify(DEFAULT_SLIDES, null, 2), 'utf-8');
  }

  private readAll(): HomeAdSlide[] {
    this.ensureFile();
    try {
      const raw = readFileSync(this.filePath(), 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...DEFAULT_SLIDES];
      return parsed as HomeAdSlide[];
    } catch {
      return [...DEFAULT_SLIDES];
    }
  }

  private writeAll(items: HomeAdSlide[]): void {
    mkdirSync(resolve(process.cwd(), 'data'), { recursive: true });
    writeFileSync(this.filePath(), JSON.stringify(items, null, 2), 'utf-8');
  }

  listPublicSlides(): HomeAdSlide[] {
    return this.readAll()
      .filter((s) => s.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  listAdminSlides(): HomeAdSlide[] {
    return this.readAll().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  createSlide(input: Partial<HomeAdSlide>): HomeAdSlide {
    const all = this.readAll();
    const next: HomeAdSlide = {
      id: input.id?.trim() || randomUUID(),
      title: input.title?.trim() || 'Untitled slide',
      body: input.body?.trim() || '',
      backgroundCss:
        input.backgroundCss?.trim() ||
        'linear-gradient(135deg, #eef2ff, #dbeafe)',
      imageUrl: input.imageUrl?.trim() || null,
      sortOrder: Number.isFinite(Number(input.sortOrder))
        ? Number(input.sortOrder)
        : all.length * 10,
      isActive: input.isActive !== false,
    };
    all.push(next);
    this.writeAll(all);
    return next;
  }

  updateSlide(id: string, input: Partial<HomeAdSlide>): HomeAdSlide {
    const all = this.readAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx < 0) throw new NotFoundException('Home ad slide not found');
    const cur = all[idx];
    const next: HomeAdSlide = {
      ...cur,
      id: cur.id,
      title: input.title != null ? String(input.title).trim() : cur.title,
      body: input.body != null ? String(input.body).trim() : cur.body,
      backgroundCss:
        input.backgroundCss != null
          ? String(input.backgroundCss).trim()
          : cur.backgroundCss,
      imageUrl:
        input.imageUrl !== undefined
          ? input.imageUrl == null || String(input.imageUrl).trim() === ''
            ? null
            : String(input.imageUrl).trim()
          : (cur.imageUrl ?? null),
      sortOrder:
        input.sortOrder != null && Number.isFinite(Number(input.sortOrder))
          ? Number(input.sortOrder)
          : cur.sortOrder,
      isActive: input.isActive != null ? Boolean(input.isActive) : cur.isActive,
    };
    all[idx] = next;
    this.writeAll(all);
    return next;
  }

  deleteSlide(id: string): { ok: true; id: string } {
    const all = this.readAll();
    const cur = all.find((s) => s.id === id);
    const next = all.filter((s) => s.id !== id);
    if (next.length === all.length) {
      throw new NotFoundException('Home ad slide not found');
    }
    if (cur?.imageUrl) this.tryRemoveImageByUrl(cur.imageUrl);
    this.writeAll(next);
    return { ok: true, id };
  }

  private uploadsDir(): string {
    return resolve(process.cwd(), 'data', 'uploads', 'home-ads');
  }

  private tryRemoveImageByUrl(url: string): void {
    if (!url || !url.startsWith('/uploads/home-ads/')) return;
    const name = url.substring('/uploads/home-ads/'.length);
    if (!/^[a-z0-9._-]+$/i.test(name)) return;
    const p = resolve(this.uploadsDir(), name);
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  attachImage(
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string; size: number },
  ): HomeAdSlide {
    if (!file || !file.buffer || !file.buffer.length) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
      );
    }
    const ext =
      ALLOWED_IMAGE_MIME[String(file.mimetype || '').toLowerCase()] ||
      (file.originalname ? extname(file.originalname).toLowerCase() : '');
    const allowedExts = new Set(Object.values(ALLOWED_IMAGE_MIME));
    if (!ext || !allowedExts.has(ext)) {
      throw new BadRequestException(
        'Unsupported image type. Use PNG, JPEG, WEBP, or GIF.',
      );
    }

    const all = this.readAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx < 0) throw new NotFoundException('Home ad slide not found');

    mkdirSync(this.uploadsDir(), { recursive: true });
    const filename = `${id}-${Date.now()}${ext}`;
    const diskPath = resolve(this.uploadsDir(), filename);
    writeFileSync(diskPath, file.buffer);

    const prevUrl = all[idx].imageUrl;
    const publicUrl = `/uploads/home-ads/${filename}`;
    all[idx] = { ...all[idx], imageUrl: publicUrl };
    this.writeAll(all);

    if (prevUrl && prevUrl !== publicUrl) this.tryRemoveImageByUrl(prevUrl);
    return all[idx];
  }

  clearImage(id: string): HomeAdSlide {
    const all = this.readAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx < 0) throw new NotFoundException('Home ad slide not found');
    const prev = all[idx].imageUrl;
    if (prev) this.tryRemoveImageByUrl(prev);
    all[idx] = { ...all[idx], imageUrl: null };
    this.writeAll(all);
    return all[idx];
  }
}
