// Adds (or refreshes) one "Butter Cookies" product in the dev DB so the
// nationwide-shipping checkout can be tried. Safe to re-run.
//   node scripts/seed-test-cookie.cjs
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const base = await prisma.shopProduct.findFirst({
      where: { category: 'specials', isActive: true },
    });
    const doc = {
      ...(base ? base.document : {}),
      id: 'butter-cookies',
      name: 'Butter Cookies',
      category: 'cookies',
      categoryLabel: 'Cookies',
      variants: [
        {
          id: 'butter-cookies__box',
          label: 'Gift box',
          available: true,
          priceCents: 2800,
          priceDisplay: 'RM28.00',
        },
      ],
    };
    await prisma.shopProduct.upsert({
      where: { id: 'butter-cookies' },
      create: {
        id: 'butter-cookies',
        category: 'cookies',
        name: 'Butter Cookies',
        isActive: true,
        sortOrder: 900,
        document: doc,
      },
      update: { category: 'cookies', isActive: true, document: doc },
    });
    console.log('butter-cookies ready');
  } finally {
    await prisma.$disconnect();
  }
})();
