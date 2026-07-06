import { useState } from 'react';
import type { BentoDietVariant, BentoMealOption, BentoRiceType } from './types';
import { useI18n } from '../lib/i18n/context';
import { VEG_OPTION_ENABLED } from '../env';

type Props = {
  mealOption: BentoMealOption;
  lunchVariant: BentoDietVariant;
  dinnerVariant: BentoDietVariant;
  riceType: BentoRiceType;
  includeDrinkAddon: boolean;
  includeFreeSoupAndDrinks?: boolean;
  drinksAndSoupEnabled?: boolean;
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
  drinksAndSoupEnabled = true,
  onLunchVariantChange,
  onDinnerVariantChange,
  onRiceTypeChange,
  onDrinkAddonChange,
}: Props) {
  const { t } = useI18n();
  const showLunch = mealOption === 'LUNCH' || mealOption === 'BOTH';
  const showDinner = mealOption === 'DINNER' || mealOption === 'BOTH';
  // Which meal section the member tapped a (disabled) veg card in, so the
  // unavailable notice only appears where they tapped.
  const [vegNotice, setVegNotice] = useState<'lunch' | 'dinner' | null>(null);

  const pickVariant = (
    meal: 'lunch' | 'dinner',
    variant: BentoDietVariant,
    onChange: (v: BentoDietVariant) => void,
  ) => {
    if (variant === 'VEG' && !VEG_OPTION_ENABLED) {
      setVegNotice(meal);
      return;
    }
    setVegNotice(null);
    onChange(variant);
  };

  return (
    <section className="section">
      <div className="sectionHeader">
        <div>
          <h2>{t('customize.title')}</h2>
          <p className="caption">
            {drinksAndSoupEnabled ? t('customize.captionFull') : t('customize.captionBasic')}
          </p>
        </div>
      </div>

      {showLunch && (
        <div className="menuSection">
          <div className="menuSectionHeader">
            <h3>{t('common.lunch')}</h3>
            <p className="caption">{t('customize.lunchCaption')}</p>
          </div>
          <div className="variantGrid">
            <button
              type="button"
              className={`variantCard${lunchVariant === 'NONVEG' ? ' active' : ''}`}
              onClick={() => pickVariant('lunch', 'NONVEG', onLunchVariantChange)}
            >
              <span className="variantTitle">{t('common.regular')}</span>
              <span className="variantLabel">{t('customize.regularLunch')}</span>
            </button>
            <button
              type="button"
              className={`variantCard${lunchVariant === 'VEG' ? ' active' : ''}${VEG_OPTION_ENABLED ? '' : ' disabled'}`}
              aria-disabled={!VEG_OPTION_ENABLED}
              onClick={() => pickVariant('lunch', 'VEG', onLunchVariantChange)}
            >
              <span className="variantTitle">{t('common.vegetarian')}</span>
              <span className="variantLabel">{t('customize.vegLunch')}</span>
            </button>
          </div>
          {vegNotice === 'lunch' && (
            <p className="caption vegUnavailableNote" role="status">
              {t('customize.vegUnavailable')}
            </p>
          )}
        </div>
      )}

      {showDinner && (
        <div className="menuSection">
          <div className="menuSectionHeader">
            <h3>{t('common.dinner')}</h3>
            <p className="caption">
              {drinksAndSoupEnabled && includeFreeSoupAndDrinks
                ? t('customize.dinnerSoupIncluded')
                : t('customize.dinnerCaption')}
            </p>
          </div>
          <div className="variantGrid">
            <button
              type="button"
              className={`variantCard${dinnerVariant === 'NONVEG' ? ' active' : ''}`}
              onClick={() => pickVariant('dinner', 'NONVEG', onDinnerVariantChange)}
            >
              <span className="variantTitle">{t('common.regular')}</span>
              <span className="variantLabel">{t('customize.regularDinner')}</span>
            </button>
            <button
              type="button"
              className={`variantCard${dinnerVariant === 'VEG' ? ' active' : ''}${VEG_OPTION_ENABLED ? '' : ' disabled'}`}
              aria-disabled={!VEG_OPTION_ENABLED}
              onClick={() => pickVariant('dinner', 'VEG', onDinnerVariantChange)}
            >
              <span className="variantTitle">{t('common.vegetarian')}</span>
              <span className="variantLabel">{t('customize.vegDinner')}</span>
            </button>
          </div>
          {vegNotice === 'dinner' && (
            <p className="caption vegUnavailableNote" role="status">
              {t('customize.vegUnavailable')}
            </p>
          )}
        </div>
      )}

      <div className="menuSection">
        <div className="menuSectionHeader">
          <h3>{t('customize.rice')}</h3>
        </div>
        <div className="variantGrid">
          <button
            type="button"
            className={`variantCard${riceType === 'WHITE' ? ' active' : ''}`}
            onClick={() => onRiceTypeChange('WHITE')}
          >
            <span className="variantTitle">{t('common.whiteRice')}</span>
            <span className="variantLabel">{t('customize.whiteRiceDesc')}</span>
          </button>
          <button
            type="button"
            className={`variantCard${riceType === 'BROWN' ? ' active' : ''}`}
            onClick={() => onRiceTypeChange('BROWN')}
          >
            <span className="variantTitle">{t('common.brownRice')}</span>
            <span className="variantLabel">{t('customize.brownRiceDesc')}</span>
          </button>
        </div>
      </div>

      {drinksAndSoupEnabled && (
        <div className="menuSection">
          <div className="menuSectionHeader">
            <h3>{t('customize.drinks')}</h3>
          </div>
          {includeFreeSoupAndDrinks ? (
            <p className="caption">{t('customize.drinksIncluded')}</p>
          ) : (
            <label className="checkRow">
              <input
                type="checkbox"
                checked={includeDrinkAddon}
                onChange={(e) => onDrinkAddonChange(e.target.checked)}
              />
              {t('customize.drinkAddon')} <small>{t('customize.drinkAddonPrice')}</small>
            </label>
          )}
        </div>
      )}
    </section>
  );
}
