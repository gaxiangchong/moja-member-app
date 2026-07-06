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

/**
 * Whether the vegetarian meal option can be selected.
 * Controlled by `VITE_VEG_OPTION_ENABLED`. Defaults to OFF while demand is
 * low; set `VITE_VEG_OPTION_ENABLED=true` to offer vegetarian meals again.
 */
export const VEG_OPTION_ENABLED =
  import.meta.env.VITE_VEG_OPTION_ENABLED?.trim().toLowerCase() === 'true';

/** Customer support WhatsApp (digits only, no +). Override via VITE_WHATSAPP_NUMBER. */
export const WHATSAPP_E164 = (
  import.meta.env.VITE_WHATSAPP_NUMBER?.trim().replace(/\D/g, '') || '601139331134'
);

export function whatsappUrl(text?: string): string {
  const base = `https://wa.me/${WHATSAPP_E164}`;
  if (!text?.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
}
