export function validateClientEnv(): void {
  const mode = import.meta.env.MODE;
  const api = import.meta.env.VITE_API_BASE_URL?.trim();
  if (mode === 'production' && !api) {
    throw new Error(
      'VITE_API_BASE_URL is required for production builds. Copy .env.production.example to .env.production.',
    );
  }
  const shopSso = import.meta.env.VITE_FEATURE_SHOP_SSO === 'true';
  const shopUrl = import.meta.env.VITE_SHOP_WEB_URL?.trim();
  if (mode === 'production' && shopSso && !shopUrl) {
    throw new Error(
      'VITE_SHOP_WEB_URL is required when VITE_FEATURE_SHOP_SSO is true in production.',
    );
  }
}
