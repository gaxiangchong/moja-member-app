import type { BentoPackage, BentoSavingsBaseline } from './types';
import { formatRm } from './types';
import { useI18n } from '../lib/i18n/context';

type Props = {
  packages: BentoPackage[];
  savingsBaseline: BentoSavingsBaseline | null;
  selected: string | null;
  onSelect: (code: BentoPackage['code']) => void;
};

type FeatureKey = 'price' | 'meals' | 'duration' | 'savings';

function cls(...parts: (string | boolean | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function PackageSelector({ packages, savingsBaseline, selected, onSelect }: Props) {
  const { t, packageLabel, mealTierLabel, formatPlanDuration } = useI18n();
  const baselineCents = savingsBaseline?.pricePerMealCents ?? 1800;
  const newcomer = packages.find((p) => p.isNewcomer);
  const regular = packages.filter((p) => !p.isNewcomer);

  const features: { key: FeatureKey; label: string }[] = [
    { key: 'price', label: t('package.rowPrice') },
    { key: 'meals', label: t('package.rowMeals') },
    { key: 'duration', label: t('package.rowDuration') },
    { key: 'savings', label: t('package.rowSavings') },
  ];

  const cellValue = (pkg: BentoPackage, key: FeatureKey) => {
    switch (key) {
      case 'price':
        return (
          <>
            <span className="pkgTblWas">
              {t('common.was')} <s>{formatRm(baselineCents)}</s>
            </span>
            <strong>{formatRm(pkg.pricePerMealCents)}</strong>
            <span className="pkgTblSub">{t('common.perMeal')}</span>
          </>
        );
      case 'meals': {
        const tierLabel = mealTierLabel(pkg.mealCredits);
        const tierClass =
          pkg.mealCredits === 10 ? 'value' : pkg.mealCredits === 20 ? 'good' : pkg.mealCredits === 30 ? 'super' : null;
        return tierLabel && tierClass ? (
          <span className={cls('pkgTblMealTier', `pkgTblMealTier--${tierClass}`)}>{tierLabel}</span>
        ) : (
          <span className="pkgTblNone">{t('common.none')}</span>
        );
      }
      case 'duration':
        return <strong>{formatPlanDuration(pkg.durationDays)}</strong>;
      case 'savings': {
        const totalSavings = pkg.totalSavingsCents ?? 0;
        return totalSavings > 0 ? (
          <span className="pkgTblSaveBadge">
            <span className="pkgTblSaveWord">{t('common.saveWord')}</span>
            <span className="pkgTblSaveAmt">{formatRm(totalSavings)}</span>
          </span>
        ) : (
          <span className="pkgTblNone">{t('common.none')}</span>
        );
      }
    }
  };

  return (
    <section className="section">
      <div className="sectionHeader">
        <div>
          <h2>{t('package.title')}</h2>
          <p className="caption">{t('package.caption')}</p>
        </div>
      </div>

      {newcomer && (
        <div className={cls('newcomerPromoCard', selected === newcomer.code && 'selected')}>
          <div className="newcomerPromoInfo">
            <span className="newcomerPromoEyebrow">{t('package.trialEyebrow')}</span>
            <span className="newcomerPromoTitle">{packageLabel(newcomer.code, newcomer.label)}</span>
            <span className="newcomerPromoDesc">
              {t('package.trialDesc', { count: newcomer.mealCredits })}
            </span>
            <div className="newcomerPromoPrice">
              {formatRm(newcomer.fixedCheckoutCents ?? 3900)}
              <span className="newcomerPromoSub"> {t('package.fixedPrice')}</span>
            </div>
          </div>
          <button
            type="button"
            className={cls('newcomerPromoBtn', selected === newcomer.code && 'selected')}
            onClick={() => onSelect(newcomer.code)}
          >
            {selected === newcomer.code ? t('common.selected') : t('common.select')}
          </button>
        </div>
      )}

      {regular.length > 0 && (
        <div className="pkgTblWrap">
          <table className="pkgTbl">
            <thead>
              <tr>
                <th className="pkgTblRowLabel" />
                {regular.map((pkg) => (
                  <th
                    key={pkg.code}
                    className={cls('pkgTblHead', selected === pkg.code && 'selected')}
                  >
                    <span className="pkgTblName">{packageLabel(pkg.code, pkg.label)}</span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {features.map((f) => (
                <tr key={f.key} className="pkgTblRow">
                  <td className="pkgTblRowLabel">{f.label}</td>
                  {regular.map((pkg) => (
                    <td
                      key={pkg.code}
                      className={cls('pkgTblCell', selected === pkg.code && 'selected')}
                    >
                      {cellValue(pkg, f.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td className="pkgTblRowLabel" />
                {regular.map((pkg) => (
                  <td
                    key={pkg.code}
                    className={cls('pkgTblFoot', selected === pkg.code && 'selected')}
                  >
                    <button
                      type="button"
                      className={cls('pkgTblBtn', selected === pkg.code && 'selected')}
                      onClick={() => onSelect(pkg.code)}
                    >
                      {selected === pkg.code ? t('common.selected') : t('common.select')}
                    </button>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
