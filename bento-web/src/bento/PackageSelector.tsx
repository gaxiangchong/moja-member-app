import type { BentoPackage, BentoSavingsBaseline } from './types';
import { formatPlanDuration, formatRm } from './types';

type Props = {
  packages: BentoPackage[];
  savingsBaseline: BentoSavingsBaseline | null;
  selected: string | null;
  onSelect: (code: BentoPackage['code']) => void;
};

type FeatureKey = 'price' | 'meals' | 'duration' | 'savings';

const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: 'price',    label: 'Price' },
  { key: 'meals',    label: 'Meals' },
  { key: 'duration', label: 'Valid for' },
  { key: 'savings',  label: 'Total saving' },
];

function cellValue(
  pkg: BentoPackage,
  key: FeatureKey,
  baselineCents: number,
) {
  switch (key) {
    case 'price':
      return (
        <>
          <span className="pkgTblWas">
            was <s>{formatRm(baselineCents)}</s>
          </span>
          <strong>{formatRm(pkg.pricePerMealCents)}</strong>
          <span className="pkgTblSub">/ meal</span>
        </>
      );
    case 'meals':
      return <strong>{pkg.mealCredits}</strong>;
    case 'duration':
      return <strong>{formatPlanDuration(pkg.durationDays)}</strong>;
    case 'savings': {
      const totalSavings = pkg.totalSavingsCents ?? 0;
      return totalSavings > 0
        ? (
          <span className="pkgTblSaveBadge">
            <span className="pkgTblSaveWord">Save</span>
            <span className="pkgTblSaveAmt">{formatRm(totalSavings)}</span>
          </span>
        )
        : <span className="pkgTblNone">—</span>;
    }
  }
}

function cls(...parts: (string | boolean | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function PackageSelector({ packages, savingsBaseline, selected, onSelect }: Props) {
  const baselineCents = savingsBaseline?.pricePerMealCents ?? 1800;
  const newcomer = packages.find((p) => p.isNewcomer);
  const regular = packages.filter((p) => !p.isNewcomer);

  return (
    <section className="section">
      <div className="sectionHeader">
        <div>
          <h2>Choose your meal plan</h2>
          <p className="caption">All prices fixed at checkout — schedule your meals within the valid period after payment.</p>
        </div>
      </div>

      {/* Newcomer promo card */}
      {newcomer && (
        <div className={cls('newcomerPromoCard', selected === newcomer.code && 'selected')}>
          <div className="newcomerPromoInfo">
            <span className="newcomerPromoEyebrow">🌱 Trial offer</span>
            <span className="newcomerPromoTitle">{newcomer.label}</span>
            <span className="newcomerPromoDesc">
              One-time only · {newcomer.mealCredits} lunch meals · Lunch only
            </span>
            <div className="newcomerPromoPrice">
              {formatRm(newcomer.fixedCheckoutCents ?? 3900)}
              <span className="newcomerPromoSub"> fixed price</span>
            </div>
          </div>
          <button
            type="button"
            className={cls('newcomerPromoBtn', selected === newcomer.code && 'selected')}
            onClick={() => onSelect(newcomer.code)}
          >
            {selected === newcomer.code ? '✓ Selected' : 'Select'}
          </button>
        </div>
      )}

      {/* Regular plan comparison table */}
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
                    <span className="pkgTblName">{pkg.label}</span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.key} className="pkgTblRow">
                  <td className="pkgTblRowLabel">{f.label}</td>
                  {regular.map((pkg) => (
                    <td
                      key={pkg.code}
                      className={cls('pkgTblCell', selected === pkg.code && 'selected')}
                    >
                      {cellValue(pkg, f.key, baselineCents)}
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
                      {selected === pkg.code ? '✓ Selected' : 'Select'}
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
