import type { BentoPackage } from './types';
import { SAVINGS_BASELINE_CENTS, formatRm } from './types';

type Props = {
  packages: BentoPackage[];
  selected: string | null;
  onSelect: (code: BentoPackage['code']) => void;
};

type FeatureKey = 'price' | 'meals' | 'duration' | 'savings' | 'drinks' | 'perks';

const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: 'price',    label: 'Price' },
  { key: 'meals',    label: 'Meals' },
  { key: 'duration', label: 'Duration' },
  { key: 'savings',  label: 'Save / meal' },
  { key: 'drinks',   label: 'Free drinks' },
  { key: 'perks',    label: 'Perks' },
];

function cellValue(pkg: BentoPackage, key: FeatureKey) {
  const savings = Math.max(0, SAVINGS_BASELINE_CENTS - pkg.pricePerMealCents);
  switch (key) {
    case 'price':
      return (
        <>
          <strong>{formatRm(pkg.pricePerMealCents)}</strong>
          <span className="pkgTblSub">/ meal</span>
        </>
      );
    case 'meals':
      return <strong>{pkg.mealCredits}</strong>;
    case 'duration':
      return `${pkg.durationDays}d`;
    case 'savings':
      return savings > 0
        ? <span className="pkgTblSavings">−{formatRm(savings)}</span>
        : <span className="pkgTblNone">—</span>;
    case 'drinks':
      return pkg.includeFreeSoupAndDrinks
        ? <span className="pkgTblCheck">✓</span>
        : <span className="pkgTblNone">—</span>;
    case 'perks':
      return pkg.perksLabel
        ? <span className="pkgTblPerks">{pkg.perksLabel}</span>
        : <span className="pkgTblNone">—</span>;
  }
}

function cls(...parts: (string | boolean | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function PackageSelector({ packages, selected, onSelect }: Props) {
  const newcomer = packages.find((p) => p.isNewcomer);
  const regular = packages.filter((p) => !p.isNewcomer);

  return (
    <section className="section">
      <div className="sectionHeader">
        <div>
          <h2>Choose your meal plan</h2>
          <p className="caption">All prices fixed at checkout — schedule pickup days after payment.</p>
        </div>
      </div>

      {/* Newcomer promo card */}
      {newcomer && (
        <div className={cls('newcomerPromoCard', selected === newcomer.code && 'selected')}>
          <div className="newcomerPromoInfo">
            <span className="newcomerPromoEyebrow">🌱 New here?</span>
            <span className="newcomerPromoTitle">{newcomer.label}</span>
            <span className="newcomerPromoDesc">
              First-time customers only · {newcomer.mealCredits} lunch meals · Lunch only
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
