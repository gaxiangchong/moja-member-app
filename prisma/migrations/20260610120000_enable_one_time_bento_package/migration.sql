-- Enable single-meal plan at RM17.90 (1790 cents per meal).
UPDATE "bento_packages"
SET
  "price_per_meal_cents" = 1790,
  "is_active" = true,
  "label" = '1 meal'
WHERE "code" = 'ONE_TIME';
