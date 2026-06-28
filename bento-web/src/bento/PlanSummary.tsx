import type { OrderDraft, BentoPackage } from './types';
import { formatRm } from './types';

type Props = {
  selectedPackage: BentoPackage;
  draft: OrderDraft;
  drinksAndSoupEnabled?: boolean;
};

const LABELS = {
  LUNCH: 'Lunch only',
  DINNER: 'Dinner only',
  BOTH: 'Lunch & dinner',
} as const;

const RICE_LABELS = {
  WHITE: 'White rice',
  BROWN: 'Brown rice',
} as const;

export function PlanSummary({ selectedPackage, draft, drinksAndSoupEnabled = true }: Props) {
  return (
    <section className="section planSummary">
      <div className="planSummaryHeader">
        <div>
          <p className="planSummaryTag">Order summary</p>
          <h2>{selectedPackage.label}</h2>
        </div>
        <span className="planPrice">
          {selectedPackage.isNewcomer
            ? formatRm(selectedPackage.fixedCheckoutCents ?? 0)
            : formatRm(selectedPackage.pricePerMealCents)}
        </span>
      </div>
      <div className="planDetails">
        <div className="planDetailItem">
          <span>Meals</span>
          <strong>{selectedPackage.mealCredits}</strong>
        </div>
        <div className="planDetailItem">
          <span>Meal type</span>
          <strong>{LABELS[draft.mealOption]}</strong>
        </div>
        <div className="planDetailItem">
          <span>Rice</span>
          <strong>{RICE_LABELS[draft.riceType]}</strong>
        </div>
        {drinksAndSoupEnabled && (
          <div className="planDetailItem">
            <span>Drinks</span>
            <strong>{draft.includeDrinkAddon ? 'Drink add-on' : 'Standard drink included'}</strong>
          </div>
        )}
      </div>
      <div className="planSummaryFooter">
        <p className="caption">You can schedule pickup days and adjust your menu after checkout.</p>
      </div>
    </section>
  );
}
