import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { CreateCartHandoffDto } from './dto/create-cart-handoff.dto';
import type {
  ShopCatalogProduct,
  ShopCatalogProductVariant,
} from './shop-catalog.service';
import { ShopCatalogService } from './shop-catalog.service';

export type CartHandoffLine = {
  productId: string;
  variantId?: string | null;
  name: string;
  qty: number;
  unitPriceCents: number;
  variantLabel?: string | null;
  imageUrl?: string | null;
};

export type CartHandoffFulfillment = {
  method: 'pickup' | null;
  preferredTime: string | null;
  preferredTimeLabel: string | null;
};

type CartHandoffJwtPayload = {
  sub: 'shop_cart';
  aud: string;
  iss: string;
  jti: string;
  lines: CartHandoffLine[];
  fulfillment?: CartHandoffFulfillment;
};

@Injectable()
export class ShopCartHandoffService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly shopCatalog: ShopCatalogService,
  ) {}

  private handoffSecret(): string {
    return (
      this.config.get<string>('SHOP_CART_HANDOFF_JWT_SECRET')?.trim() ||
      this.config.get<string>('SHOP_HANDOFF_JWT_SECRET')?.trim() ||
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }

  private handoffIssuer(): string {
    return (
      this.config.get<string>('SHOP_CART_HANDOFF_ISSUER')?.trim() ||
      this.config.get<string>('SHOP_HANDOFF_ISSUER')?.trim() ||
      `http://localhost:${this.config.get<number>('PORT', 3153)}`
    );
  }

  private handoffAudience(): string {
    return (
      this.config.get<string>('SHOP_CART_HANDOFF_AUDIENCE')?.trim() ||
      'member_app_cart'
    );
  }

  private ttlSec(): number {
    return Math.min(
      Math.max(this.config.get<number>('SHOP_CART_HANDOFF_TTL_SEC', 300), 60),
      900,
    );
  }

  private memberAppBase(): string {
    const explicit = this.config.get<string>('MEMBER_APP_PUBLIC_URL')?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const cors = this.config
      .get<string>('CLIENT_WEB_ORIGIN')
      ?.split(',')[0]
      ?.trim();
    if (cors) return cors.replace(/\/$/, '');
    return 'http://localhost:5193';
  }

  private failLine(code: string, message: string): never {
    throw new BadRequestException({ code, message });
  }

  private resolveVariant(
    product: ShopCatalogProduct,
    raw: Partial<CartHandoffLine>,
  ): ShopCatalogProductVariant | null {
    const variants = product.variants ?? [];
    const requestedId = String(raw.variantId ?? '').trim();
    const requestedLabel = String(raw.variantLabel ?? '').trim();

    if (variants.length === 0) {
      if (requestedId || requestedLabel) {
        this.failLine(
          'CART_HANDOFF_INVALID_VARIANT',
          'This product does not have the requested variant',
        );
      }
      return null;
    }

    let variant = requestedId
      ? variants.find((v) => v.id === requestedId)
      : undefined;

    if (!variant && requestedLabel) {
      const normalizedLabel = requestedLabel.toLowerCase();
      variant = variants.find(
        (v) =>
          String(v.label ?? '')
            .trim()
            .toLowerCase() === normalizedLabel,
      );
    }

    if (!variant && !requestedId && !requestedLabel && variants.length === 1) {
      variant = variants[0];
    }

    if (!variant) {
      this.failLine(
        'CART_HANDOFF_INVALID_VARIANT',
        'Choose a valid product variant before checkout',
      );
    }

    if (variant.available === false) {
      this.failLine(
        'CART_HANDOFF_UNAVAILABLE_VARIANT',
        'The selected product variant is not available',
      );
    }

    return variant;
  }

  private canonicalPriceCents(
    product: ShopCatalogProduct,
    variant: ShopCatalogProductVariant | null,
  ): number {
    const raw = variant ? variant.priceCents : product.basePriceCents;
    const price = Math.floor(Number(raw));
    if (!Number.isFinite(price) || price < 0) {
      this.failLine(
        'CART_HANDOFF_INVALID_CATALOG_PRICE',
        'Catalog price is not valid for checkout',
      );
    }
    return price;
  }

  private normalizeLines(
    inputLines: Array<Partial<CartHandoffLine>>,
  ): CartHandoffLine[] {
    const lines: CartHandoffLine[] = [];
    const productsById = new Map(
      this.shopCatalog.listPublicProducts().map((p) => [p.id, p]),
    );

    for (const raw of inputLines) {
      const productId = String(raw.productId ?? '').trim();
      const qty = Math.floor(Number(raw.qty));
      if (!productId) {
        throw new BadRequestException({
          code: 'CART_HANDOFF_INVALID_LINE',
          message: 'Each cart line needs productId',
        });
      }
      if (qty < 1 || qty > 99) {
        throw new BadRequestException({
          code: 'CART_HANDOFF_INVALID_QTY',
          message: 'Line quantity must be between 1 and 99',
        });
      }
      const product = productsById.get(productId);
      if (!product || product.isActive === false || product.soldOut) {
        this.failLine(
          'CART_HANDOFF_UNAVAILABLE_PRODUCT',
          'One or more cart products are no longer available',
        );
      }

      const variant = this.resolveVariant(product, raw);
      const unitPriceCents = this.canonicalPriceCents(product, variant);
      lines.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        name: product.name,
        qty,
        unitPriceCents,
        variantLabel: variant?.label ?? null,
        imageUrl: product.imageUrl?.trim() || product.images?.[0]?.src || null,
      });
    }
    return lines;
  }

  private normalizeFulfillment(
    raw: CreateCartHandoffDto['fulfillment'],
  ): CartHandoffFulfillment | undefined {
    if (!raw) return undefined;
    const method = raw.method === 'pickup' ? 'pickup' : null;
    const preferredTime =
      typeof raw.preferredTime === 'string' &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.preferredTime.trim())
        ? raw.preferredTime.trim()
        : null;
    const preferredTimeLabel =
      typeof raw.preferredTimeLabel === 'string' &&
      raw.preferredTimeLabel.trim()
        ? raw.preferredTimeLabel.trim().slice(0, 120)
        : null;
    if (!method && !preferredTime && !preferredTimeLabel) return undefined;
    return { method, preferredTime, preferredTimeLabel };
  }

  async createHandoff(dto: CreateCartHandoffDto) {
    const lines = this.normalizeLines(dto.lines);
    const fulfillment = this.normalizeFulfillment(dto.fulfillment);
    const ttlSec = this.ttlSec();
    const issuer = this.handoffIssuer();
    const audience = this.handoffAudience();
    const jti = randomUUID();
    const payload: CartHandoffJwtPayload = {
      sub: 'shop_cart',
      aud: audience,
      iss: issuer,
      jti,
      lines,
      ...(fulfillment ? { fulfillment } : {}),
    };

    const handoffToken = await this.jwt.signAsync(payload, {
      secret: this.handoffSecret(),
      expiresIn: ttlSec,
    });

    const redirectBase = new URL(`${this.memberAppBase()}/`);
    redirectBase.searchParams.set('tab', 'shop');
    redirectBase.searchParams.set('shopScreen', 'cart');
    redirectBase.searchParams.set('cartHandoff', handoffToken);

    return {
      handoffToken,
      expiresInSec: ttlSec,
      redirectUrl: redirectBase.toString(),
      lineCount: lines.length,
      subtotalCents: lines.reduce(
        (sum, l) => sum + l.unitPriceCents * l.qty,
        0,
      ),
    };
  }

  async consumeHandoff(token: string) {
    const trimmed = token?.trim();
    if (!trimmed) {
      throw new BadRequestException({
        code: 'CART_HANDOFF_MISSING',
        message: 'Cart handoff token is required',
      });
    }

    let payload: CartHandoffJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<CartHandoffJwtPayload>(trimmed, {
        secret: this.handoffSecret(),
        issuer: this.handoffIssuer(),
        audience: this.handoffAudience(),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'CART_HANDOFF_INVALID',
        message:
          'Cart handoff link expired or invalid. Return to the shop and try checkout again.',
      });
    }

    if (payload.sub !== 'shop_cart' || !Array.isArray(payload.lines)) {
      throw new UnauthorizedException({
        code: 'CART_HANDOFF_INVALID',
        message: 'Cart handoff token is not valid for shop checkout.',
      });
    }

    const lines = this.normalizeLines(
      payload.lines.filter(
        (l) => l && typeof l.productId === 'string' && Number.isFinite(l.qty),
      ),
    );
    if (lines.length === 0) {
      throw new BadRequestException({
        code: 'CART_HANDOFF_EMPTY',
        message: 'Cart handoff contains no items',
      });
    }

    const fulfillment =
      payload.fulfillment && typeof payload.fulfillment === 'object'
        ? {
            method: payload.fulfillment.method === 'pickup' ? 'pickup' : null,
            preferredTime:
              typeof payload.fulfillment.preferredTime === 'string' &&
              /^([01]\d|2[0-3]):[0-5]\d$/.test(
                payload.fulfillment.preferredTime,
              )
                ? payload.fulfillment.preferredTime
                : null,
            preferredTimeLabel:
              typeof payload.fulfillment.preferredTimeLabel === 'string'
                ? payload.fulfillment.preferredTimeLabel
                : null,
          }
        : null;

    return {
      lines,
      subtotalCents: lines.reduce(
        (sum, l) => sum + l.unitPriceCents * l.qty,
        0,
      ),
      fulfillment,
    };
  }
}
