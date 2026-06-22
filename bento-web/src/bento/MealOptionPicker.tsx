import type { BentoMealOption, BentoPackageCode } from './types';
import { useI18n } from '../lib/i18n/context';

type Props = {
  value: BentoMealOption;
  packageCode: BentoPackageCode | null;
  mealCredits: number;
  drinksAndSoupEnabled?: boolean;
  onChange: (v: BentoMealOption) => void;
};

export function MealOptionPicker({
  value,
  packageCode,
  mealCredits,
  drinksAndSoupEnabled = true,
  onChange,
}: Props) {
  const { t } = useI18n();
  // Trial pack is a flat RM39 regardless of meal choice — no dinner surcharge,
  // but lunch/dinner/both are all selectable like a regular plan.
  const noDinnerSurcharge = packageCode === 'NEWCOMER_3';
  const singleMealOnly = packageCode === 'ONE_TIME';
  const lunchOn = value === 'LUNCH' || value === 'BOTH';
  const dinnerOn = value === 'DINNER' || value === 'BOTH';
  const bothSelected = lunchOn && dinnerOn && !singleMealOnly;
  const lunchCount = Math.floor(mealCredits / 2);
  const dinnerCount = mealCredits - lunchCount;

  const dinnerSub = bothSelected
    ? [
        t('rhythm.mealsCount', { count: dinnerCount }),
        !noDinnerSurcharge && drinksAndSoupEnabled ? t('rhythm.dinnerSurcharge') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : !noDinnerSurcharge && drinksAndSoupEnabled && dinnerOn
      ? t('rhythm.dinnerSurcharge')
      : null;

  const toggle = (meal: 'LUNCH' | 'DINNER') => {
    if (singleMealOnly) {
      onChange(meal);
      return;
    }
    if (meal === 'LUNCH') {
      if (lunchOn && !dinnerOn) return;
      onChange(lunchOn ? 'DINNER' : 'BOTH');
    } else {
      if (dinnerOn && !lunchOn) return;
      onChange(dinnerOn ? 'LUNCH' : 'BOTH');
    }
  };

  return (
    <section className="section">
      <div className="sectionHeader">
        <div>
          <h2>{t('rhythm.title')}</h2>
          <p className="caption">{t('rhythm.caption')}</p>
        </div>
      </div>

      {singleMealOnly && (
        <p className="caption" style={{ marginBottom: 10, color: '#9a3412' }}>
          {t('rhythm.singleOnly')}
        </p>
      )}

      <div className="mealToggleGrid">
        <button
          type="button"
          className={[
            'mealToggleCard',
            lunchOn ? 'active' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => toggle('LUNCH')}
        >
          <span className="mealToggleCheckmark">✓</span>
          <span className="mealToggleEmoji">🌞</span>
          <span className="mealToggleTitle">{t('common.lunch')}</span>
          {bothSelected && (
            <span className="mealToggleSub">{t('rhythm.mealsCount', { count: lunchCount })}</span>
          )}
        </button>

        <button
          type="button"
          className={[
            'mealToggleCard',
            dinnerOn ? 'active' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => toggle('DINNER')}
        >
          <span className="mealToggleCheckmark">✓</span>
          <span className="mealToggleEmoji">🌙</span>
          <span className="mealToggleTitle">{t('common.dinner')}</span>
          {dinnerSub && <span className="mealToggleSub">{dinnerSub}</span>}
        </button>
      </div>
    </section>
  );
}
