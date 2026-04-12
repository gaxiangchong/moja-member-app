export const STORAGE_KEY = 'moja_ops_api_key';
export const STORAGE_BASE = 'moja_ops_api_base';
export const defaultBase =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3153';

/** localStorage is shared across tabs/windows on the same origin. */
export function readStoredKey(): string {
  try {
    return (
      localStorage.getItem(STORAGE_KEY)?.trim() ||
      (import.meta.env.VITE_OPS_API_KEY as string | undefined)?.trim() ||
      ''
    );
  } catch {
    return (import.meta.env.VITE_OPS_API_KEY as string | undefined)?.trim() || '';
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
