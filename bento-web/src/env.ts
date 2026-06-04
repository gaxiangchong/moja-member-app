export function validateClientEnv(): void {
  const mode = import.meta.env.MODE;
  const api = import.meta.env.VITE_API_BASE_URL?.trim();
  if (mode === 'production' && !api) {
    throw new Error('VITE_API_BASE_URL is required for production builds.');
  }
}
