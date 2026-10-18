/** The admin access token from email + password sign-in (was the shared ops key). */
export const STORAGE_KEY = 'moja_ops_admin_token';
export const STORAGE_BASE = 'moja_ops_api_base';
export const defaultBase =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3153';

/** Saved admin token from localStorage only (never auto-authenticates from env). */
export function readStoredKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function readStoredBase(): string {
  try {
    return (
      localStorage.getItem(STORAGE_BASE)?.trim() ||
      (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
      defaultBase
    );
  } catch {
    return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || defaultBase;
  }
}
