import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminDashboardController } from './admin-dashboard.controller';
import { ADMIN_DASHBOARD_VIEWS } from './admin-dashboard/views';

describe('AdminDashboardController templates', () => {
  const snapshotsDirectory = join(__dirname, '__snapshots__');

  it('renders byte-identical dashboard HTML', () => {
    const previousOrigin = process.env.SHOP_WEB_BASE_URL;
    process.env.SHOP_WEB_BASE_URL = 'https://shop.example.test';

    try {
      const rendered = new AdminDashboardController().getDashboard();
      const golden = readFileSync(
        join(snapshotsDirectory, 'admin-dashboard.html'),
        'utf8',
      );
      expect(rendered).toBe(golden);
    } finally {
      if (previousOrigin === undefined) {
        delete process.env.SHOP_WEB_BASE_URL;
      } else {
        process.env.SHOP_WEB_BASE_URL = previousOrigin;
      }
    }
  });

  it.each(Object.entries(ADMIN_DASHBOARD_VIEWS))(
    'keeps the %s view byte-identical to its golden file',
    (viewId, template) => {
      const golden = readFileSync(
        join(snapshotsDirectory, viewId + '.html'),
        'utf8',
      );
      expect(template).toBe(golden);
    },
  );
});
