export const BENTO_MENU = {
  lunch: {
    title: 'Lunch set',
    description:
      'Main dish, side, and rice — choose vegetarian or non-vegetarian.',
    variants: [
      { code: 'VEG', label: 'Vegetarian' },
      { code: 'NONVEG', label: 'Non-vegetarian' },
    ],
  },
  dinner: {
    title: 'Dinner set',
    description: 'Main dish with soup, side, and rice (+RM1 per dinner meal).',
    variants: [
      { code: 'VEG', label: 'Vegetarian' },
      { code: 'NONVEG', label: 'Non-vegetarian' },
    ],
  },
  rice: [
    { code: 'WHITE', label: 'White rice', addonCents: 0 },
    { code: 'BROWN', label: 'Brown rice', addonCents: 200 },
  ],
  drinks: {
    title: 'Drinks',
    description: 'Optional add-on at checkout (+RM4 per meal).',
    addonCents: 400,
  },
} as const;
