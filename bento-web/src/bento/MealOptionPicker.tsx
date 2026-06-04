import type { BentoMealOption, BentoPackageCode } from './types';

type Props = {
  value: BentoMealOption;
  packageCode: BentoPackageCode | null;
  mealCredits: number;
  onChange: (v: BentoMealOption) => void;
};

export function MealOptionPicker({ value, packageCode, mealCredits, onChange }: Props) {
  const newcomerOnly = packageCode === 'NEWCOMER_3';
  const lunchOn = value === 'LUNCH' || value === 'BOTH';
  const dinnerOn = value === 'DINNER' || value === 'BOTH';

  const toggle = (meal: 'LUNCH' | 'DINNER') => {
    if (newcomerOnly) return;
    if (meal === 'LUNCH') {
      if (lunchOn && !dinnerOn) return; // last one selected, prevent
      onChange(lunchOn ? 'DINNER' : 'BOTH');
    } else {
      if (dinnerOn && !lunchOn) return; // last one selected, prevent
      onChange(dinnerOn ? 'LUNCH' : 'BOTH');
    }
  };

  return (
    <section className="section">
      <div className="sectionHeader">
        <div>
          <h2>Choose your meal rhythm</h2>
          <p className="caption">Pick one or both — your credits split across selected meals.</p>
        </div>
      </div>

      {newcomerOnly && (
        <p className="caption" style={{ marginBottom: 10, color: '#15803d' }}>
          Newcomer promo includes lunch only.
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
          <span className="mealToggleTitle">Lunch</span>
          <span className="mealToggleSub">{mealCredits} meals</span>
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
          <span className="mealToggleTitle">Dinner</span>
          <span className="mealToggleSub">
            {mealCredits} meals
            {!newcomerOnly && <> · +RM1/meal</>}
          </span>
          {newcomerOnly && <span className="mealToggleTag">Unavailable</span>}
        </button>
      </div>

      {lunchOn && dinnerOn && (
        <p className="caption" style={{ marginTop: 10 }}>
          Credits split evenly: {Math.floor(mealCredits / 2)} lunches + {mealCredits - Math.floor(mealCredits / 2)} dinners.
        </p>
      )}
    </section>
  );
}
