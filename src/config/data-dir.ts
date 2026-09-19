import { resolve } from 'node:path';

/**
 * Root of the API's writable state on disk (uploads, JSON settings, import /
 * export files). Defaults to `<cwd>/data`; set `DATA_DIR` to point at a
 * mounted persistent volume on hosts with an ephemeral filesystem (e.g.
 * Render disks mount outside the repo checkout).
 */
export function dataDir(...segments: string[]): string {
  const root = process.env.DATA_DIR?.trim();
  return resolve(root ? root : resolve(process.cwd(), 'data'), ...segments);
}
