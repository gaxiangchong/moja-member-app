import type { MemberProfile } from '../api';
import type { BentoPackage } from './types';
import { formatPlanDuration } from './types';

type Props = {
  profile: MemberProfile | null;
  selectedPackage: BentoPackage | null;
};

export function OrderHero({ profile, selectedPackage }: Props) {
  const firstName = profile?.displayName?.split(' ')[0];

  return (
    <section className="heroCard">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <span className="heroTag">Step 1 of 3 &nbsp;·&nbsp; Choose plan</span>
          <h1 style={{ marginTop: 4 }}>
            {firstName ? `Hey ${firstName}! 👋` : 'Order Meals 🍽️'}
          </h1>
          <p className="heroSubtitle">
            {selectedPackage
              ? `Great choice — ${selectedPackage.label} selected. Continue below to set your meal preferences.`
              : 'Pick a meal plan below. Fresh, chef-prepared meals on your schedule, starting this week.'}
          </p>
        </div>
        {!selectedPackage && (
          <span style={{ fontSize: '3.5rem', lineHeight: 1, flexShrink: 0 }}>🍱</span>
        )}
      </div>

      {selectedPackage ? (
        <div className="heroStats">
          <div className="heroStat">
            <span className="heroStatLabel">Plan</span>
            <strong>{selectedPackage.label}</strong>
          </div>
          <div className="heroStat">
            <span className="heroStatLabel">Meals</span>
            <strong>{selectedPackage.mealCredits}</strong>
          </div>
          <div className="heroStat">
            <span className="heroStatLabel">Valid for</span>
            <strong>{formatPlanDuration(selectedPackage.durationDays)}</strong>
          </div>
        </div>
      ) : (
        <div className="heroHint">
          <p>Pick a meal plan first, then set your rhythm and preferences before checkout.</p>
        </div>
      )}
    </section>
  );
}
