import type { BentoDietVariant, BentoMealOption, BentoRiceType } from './types';

type Props = {
  mealOption: BentoMealOption;
  lunchVariant: BentoDietVariant;
  dinnerVariant: BentoDietVariant;
  riceType: BentoRiceType;
  includeDrinkAddon: boolean;
  includeFreeSoupAndDrinks?: boolean;
  onLunchVariantChange: (v: BentoDietVariant) => void;
  onDinnerVariantChange: (v: BentoDietVariant) => void;
  onRiceTypeChange: (v: BentoRiceType) => void;
  onDrinkAddonChange: (v: boolean) => void;
};

export function MenuPicker({
  mealOption,
  lunchVariant,
  dinnerVariant,
  riceType,
  includeDrinkAddon,
  includeFreeSoupAndDrinks,
  onLunchVariantChange,
  onDinnerVariantChange,
  onRiceTypeChange,
  onDrinkAddonChange,
}: Props) {
  const showLunch = mealOption === 'LUNCH' || mealOption === 'BOTH';
  const showDinner = mealOption === 'DINNER' || mealOption === 'BOTH';

  return (
    <section className="section">
      <div className="sectionHeader">
        <div>
          <h2>Customize your menu</h2>
          <p className="caption">Select your preferred meal type, rice, and drink options before checkout.</p>
        </div>
      </div>

      {showLunch && (
        <div className="menuSection">
          <div className="menuSectionHeader">
            <h3>Lunch</h3>
            <p className="caption">Choose the lunch style you want for all lunch days.</p>
          </div>
          <div className="variantGrid">
            <button
              type="button"
              className={`variantCard${lunchVariant === 'VEG' ? ' active' : ''}`}
              onClick={() => onLunchVariantChange('VEG')}
            >
              <span className="variantTitle">Vegetarian</span>
              <span className="variantLabel">Light and balanced.</span>
            </button>
            <button
              type="button"
              className={`variantCard${lunchVariant === 'NONVEG' ? ' active' : ''}`}
              onClick={() => onLunchVariantChange('NONVEG')}
            >
              <span className="variantTitle">Non-vegetarian</span>
              <span className="variantLabel">Protein-rich and hearty.</span>
            </button>
          </div>
        </div>
      )}

      {showDinner && (
        <div className="menuSection">
          <div className="menuSectionHeader">
            <h3>Dinner</h3>
            <p className="caption">
              {includeFreeSoupAndDrinks
                ? 'Soup is included with your plan.'
                : 'Choose your dinner style; soup is charged separately.'}
            </p>
          </div>
          <div className="variantGrid">
            <button
              type="button"
              className={`variantCard${dinnerVariant === 'VEG' ? ' active' : ''}`}
              onClick={() => onDinnerVariantChange('VEG')}
            >
              <span className="variantTitle">Vegetarian</span>
              <span className="variantLabel">Garden-fresh dinner.</span>
            </button>
            <button
              type="button"
              className={`variantCard${dinnerVariant === 'NONVEG' ? ' active' : ''}`}
              onClick={() => onDinnerVariantChange('NONVEG')}
            >
              <span className="variantTitle">Non-vegetarian</span>
              <span className="variantLabel">Hearty evening meal.</span>
            </button>
          </div>
        </div>
      )}

      <div className="menuSection">
        <div className="menuSectionHeader">
          <h3>Rice</h3>
        </div>
        <div className="variantGrid">
          <button
            type="button"
            className={`variantCard${riceType === 'WHITE' ? ' active' : ''}`}
            onClick={() => onRiceTypeChange('WHITE')}
          >
            <span className="variantTitle">White rice</span>
            <span className="variantLabel">Classic and familiar.</span>
          </button>
          <button
            type="button"
            className={`variantCard${riceType === 'BROWN' ? ' active' : ''}`}
            onClick={() => onRiceTypeChange('BROWN')}
          >
            <span className="variantTitle">Brown rice</span>
            <span className="variantLabel">Nutty texture +RM2/meal</span>
          </button>
        </div>
      </div>

      <div className="menuSection">
        <div className="menuSectionHeader">
          <h3>Drinks</h3>
        </div>
        {includeFreeSoupAndDrinks ? (
          <p className="caption">Drinks are included in this plan, so no extra selection is needed.</p>
        ) : (
          <label className="checkRow">
            <input
              type="checkbox"
              checked={includeDrinkAddon}
              onChange={(e) => onDrinkAddonChange(e.target.checked)}
            />
            Extra drink add-on <small>(+RM4/meal)</small>
          </label>
        )}
      </div>
    </section>
  );
}
