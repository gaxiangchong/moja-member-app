import type { MemberProfile } from '../api';
import type { BentoPackage } from './types';
import { useI18n } from '../lib/i18n/context';

type Props = {
  profile: MemberProfile | null;
  selectedPackage: BentoPackage | null;
};

export function OrderHero({ profile, selectedPackage }: Props) {
  const { t, packageLabel, formatPlanDuration } = useI18n();
  const firstName = profile?.displayName?.split(' ')[0];

  return (
    <section className="heroCard">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <span className="heroTag">{t('hero.step')}</span>
          <h1 style={{ marginTop: 4 }}>
            {firstName ? t('hero.greeting', { name: firstName }) : t('hero.title')}
          </h1>
          <p className="heroSubtitle">
            {selectedPackage
              ? t('hero.selectedSub', {
                  label: packageLabel(selectedPackage.code, selectedPackage.label),
                })
              : t('hero.defaultSub')}
          </p>
        </div>
        {!selectedPackage && (
          <span style={{ fontSize: '3.5rem', lineHeight: 1, flexShrink: 0 }}>🍱</span>
        )}
      </div>

      {selectedPackage ? (
        <div className="heroStats">
          <div className="heroStat">
            <span className="heroStatLabel">{t('hero.statPlan')}</span>
            <strong>{packageLabel(selectedPackage.code, selectedPackage.label)}</strong>
          </div>
          <div className="heroStat">
            <span className="heroStatLabel">{t('hero.statMeals')}</span>
            <strong>{selectedPackage.mealCredits}</strong>
          </div>
          <div className="heroStat">
            <span className="heroStatLabel">{t('hero.statValid')}</span>
            <strong>{formatPlanDuration(selectedPackage.durationDays)}</strong>
          </div>
        </div>
      ) : (
        <div className="heroHint">
          <p>{t('hero.hint')}</p>
        </div>
      )}
    </section>
  );
}
