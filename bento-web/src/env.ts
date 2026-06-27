export function validateClientEnv(): void {
  const mode = import.meta.env.MODE;
  const api = import.meta.env.VITE_API_BASE_URL?.trim();
  if (mode === 'production' && !api) {
    throw new Error('VITE_API_BASE_URL is required for production builds.');
  }
}

/**
 * Whether to render meal photos on the weekly menu.
 * Controlled by `VITE_MENU_SHOW_IMAGES`. Defaults to OFF (text-only) so the
 * menu stays compact; set `VITE_MENU_SHOW_IMAGES=true` to show photos.
 */
export const MENU_SHOW_IMAGES =
  import.meta.env.VITE_MENU_SHOW_IMAGES?.trim().toLowerCase() === 'true';
