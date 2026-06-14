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
  const newcomerOnly = packageCode === 'NEWCOMER_3';
  const lunchOn = value === 'LUNCH' || value === 'BOTH';
  const dinnerOn = value === 'DINNER' || value === 'BOTH';
  const bothSelected = lunchOn && dinnerOn;
  const lunchCount = Math.floor(mealCredits / 2);
  const dinnerCount = mealCredits - lunchCount;

  const dinnerSub = bothSelected
    ? [
        t('rhythm.mealsCount', { count: dinnerCount }),
        !newcomerOnly && drinksAndSoupEnabled ? t('rhythm.dinnerSurcharge') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : !newcomerOnly && drinksAndSoupEnabled && dinnerOn
      ? t('rhythm.dinnerSurcharge')
      : null;

  const toggle = (meal: 'LUNCH' | 'DINNER') => {
    if (newcomerOnly) return;
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

      {newcomerOnly && (
        <p className="caption" style={{ marginBottom: 10, color: '#15803d' }}>
          {t('rhythm.trialOnly')}
        </p>
      )}

      <div className="mealToggleGrid">
        <button
          type="button"
          className={[
            'mealToggleCard',
            lunchOn ? 'active' : '',
            newcomerOnly ? 'locked' : '',
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
            newcomerOnly ? 'unavail' : '',
          ].filter(Boolean).join(' ')}
          disabled={newcomerOnly}
          onClick={() => toggle('DINNER')}
        >
          <span className="mealToggleCheckmark">✓</span>
          <span className="mealToggleEmoji">🌙</span>
          <span className="mealToggleTitle">{t('common.dinner')}</span>
          {dinnerSub && <span className="mealToggleSub">{dinnerSub}</span>}
          {newcomerOnly && <span className="mealToggleTag">{t('rhythm.unavailable')}</span>}
        </button>
      </div>
    </section>
  );
}
