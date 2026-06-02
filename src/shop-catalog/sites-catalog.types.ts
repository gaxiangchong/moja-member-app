export type SitesCatalogVariant = {
  label: string;
  price: string | null;
  available: boolean;
};

export type SitesCatalogProduct = {
  slug: string;
  name: string;
  price: string;
  category: string;
  images: { src: string; alt: string }[];
  summary: string;
  shortDescription?: string;
  badge?: string;
  soldOut?: boolean;
  variants?: SitesCatalogVariant[];
};

export type SitesCatalog = {
  homeFeaturedSlugs: string[];
  shopSections: Array<{
    id: string;
    title: string;
    description: string;
    productSlugs: string[];
  }>;
  products: SitesCatalogProduct[];
};

export type ShopCatalogSyncMode = 'pricing_and_media' | 'full';

export type ShopCatalogSyncFieldChange = {
  field: string;
  before: string;
  after: string;
  /** True when this field is locked by syncOverrides — sync will skip it. */
  locked?: boolean;
};

export type ShopCatalogSyncProductChange = {
  id: string;
  name: string;
  status: 'update' | 'create' | 'unchanged';
  changes: ShopCatalogSyncFieldChange[];
  /** Locked field names on this product (admin manual edits). */
  lockedFields?: string[];
};

export type ShopCatalogSyncPreview = {
  source: 'path' | 'url' | 'body' | 'none';
  sourceLabel: string;
  mode: ShopCatalogSyncMode;
  summary: {
    sitesProductCount: number;
    memberProductCount: number;
    toUpdate: number;
    toCreate: number;
    unchanged: number;
    onlyInMember: number;
    /** Number of products with at least one locked field. */
    lockedProducts: number;
  };
  products: ShopCatalogSyncProductChange[];
  layoutWouldUpdate: boolean;
};
