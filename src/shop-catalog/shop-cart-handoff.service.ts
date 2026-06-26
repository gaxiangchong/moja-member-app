import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
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

  private sameCatalogValue(a: string | null | undefined, b: string): boolean {
    return (
      String(a ?? '')
        .trim()
        .toLowerCase() === b.trim().toLowerCase()
    );
  }

  private findCatalogProduct(productId: string): {
    product: ShopCatalogProduct;
    requestedVariant?: ShopCatalogProductVariant;
  } {
    for (const product of this.shopCatalog.listPublicProducts()) {
      if (product.id === productId) return { product };
      const requestedVariant = product.variants?.find((variant) =>
        this.sameCatalogValue(variant.id, productId),
      );
      if (requestedVariant) return { product, requestedVariant };
    }
    throw new BadRequestException({
      code: 'CART_HANDOFF_UNKNOWN_PRODUCT',
      message: 'Cart contains a product that is no longer available',
    });
  }

  private selectVariant(
    product: ShopCatalogProduct,
    requestedProductId: string,
    requestedVariant: ShopCatalogProductVariant | undefined,
    variantLabel: string | null,
  ): ShopCatalogProductVariant | undefined {
    const variants = product.variants ?? [];
    if (variants.length === 0) return undefined;

    const availableVariants = variants.filter((v) => v.available !== false);
    const explicitVariant =
      requestedVariant ??
      (variantLabel
        ? variants.find(
            (v) =>
              this.sameCatalogValue(v.id, variantLabel) ||
              this.sameCatalogValue(v.label, variantLabel),
          )
        : undefined);
    if (explicitVariant) {
      if (explicitVariant.available === false) {
        throw new BadRequestException({
          code: 'CART_HANDOFF_UNAVAILABLE_PRODUCT',
          message:
            'Cart contains a product variant that is no longer available',
        });
      }
      return explicitVariant;
    }

    const requestedById = availableVariants.find(
      (v) =>
        this.sameCatalogValue(v.id, requestedProductId) ||
        this.sameCatalogValue(v.label, requestedProductId),
    );
    if (requestedById) return requestedById;

    return availableVariants.find(
      (v) => v.priceCents === product.basePriceCents,
    );
  }

  private canonicalImage(product: ShopCatalogProduct): string | null {
    return product.images?.[0]?.src?.trim() || product.imageUrl?.trim() || null;
  }

  private normalizeLines(dto: CreateCartHandoffDto): CartHandoffLine[] {
    const lines: CartHandoffLine[] = [];
    for (const raw of dto.lines) {
      const productId = raw.productId.trim();
      const qty = Math.floor(Number(raw.qty));
      if (!productId) {
        throw new BadRequestException({
          code: 'CART_HANDOFF_INVALID_LINE',
          message: 'Each cart line needs a productId',
        });
      }
      if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
        throw new BadRequestException({
          code: 'CART_HANDOFF_INVALID_QTY',
          message: 'Line quantity must be between 1 and 99',
        });
      }

      const variantLabel = raw.variantLabel?.trim() || null;
      const { product, requestedVariant } = this.findCatalogProduct(productId);
      if (product.soldOut === true) {
        throw new BadRequestException({
          code: 'CART_HANDOFF_UNAVAILABLE_PRODUCT',
          message: 'Cart contains a product that is no longer available',
        });
      }
      const variant = this.selectVariant(
        product,
        productId,
        requestedVariant,
        variantLabel,
      );
      const unitPriceCents = Math.floor(
        Number(variant?.priceCents ?? product.basePriceCents),
      );
      if (!Number.isFinite(unitPriceCents) || unitPriceCents < 0) {
        throw new BadRequestException({
          code: 'CART_HANDOFF_INVALID_PRICE',
          message: 'Catalog price is not valid for checkout',
        });
      }
      lines.push({
        productId: product.id,
        name: product.name,
        qty,
        unitPriceCents,
        variantLabel: variant?.label ?? null,
        imageUrl: this.canonicalImage(product),
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
    const shopBase = this.config.get<string>('SHOP_WEB_BASE_URL')?.trim();
    if (!shopBase) {
      throw new ServiceUnavailableException({
        code: 'CART_HANDOFF_MISCONFIGURED',
        message: 'SHOP_WEB_BASE_URL is not set on the member API.',
      });
    }

    const lines = this.normalizeLines(dto);
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

    const lines = payload.lines.filter(
      (l) =>
        l &&
        typeof l.productId === 'string' &&
        typeof l.name === 'string' &&
        Number.isFinite(l.qty) &&
        Number.isFinite(l.unitPriceCents),
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
      lines: lines.map((l) => ({
        productId: String(l.productId).trim(),
        name: String(l.name).trim(),
        qty: Math.max(1, Math.min(99, Math.floor(l.qty))),
        unitPriceCents: Math.max(0, Math.floor(l.unitPriceCents)),
        variantLabel: l.variantLabel ? String(l.variantLabel).trim() : null,
        imageUrl: l.imageUrl ? String(l.imageUrl).trim() : null,
      })),
      subtotalCents: lines.reduce(
        (sum, l) => sum + Math.floor(l.unitPriceCents) * Math.floor(l.qty),
        0,
      ),
      fulfillment,
    };
  }
}
