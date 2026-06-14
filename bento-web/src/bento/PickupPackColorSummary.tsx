import type { PackCategory, PickupDayPackSummary } from './pickupPackSummary';
import { countForCategory } from './pickupPackSummary';
import { useI18n } from '../lib/i18n/context';

type DotProps = { color: 'orange' | 'green' | 'brown' | 'blue' };

export function PackDot({ color }: DotProps) {
  return <span className={`packDot packDot-${color}`} aria-hidden />;
}

type RowProps = {
  category: PackCategory;
  count: number;
  inline?: boolean;
};

function PackCategoryRow({ category, count, inline = false }: RowProps) {
  const { t } = useI18n();
  if (count <= 0) return null;
  const labelKey = `pickup.pack.${category}` as const;
  return (
    <div className={`packColorRow${inline ? ' inline' : ''}`}>
      <span className="packColorDots">
        {category === 'regular' && <PackDot color="orange" />}
        {category === 'vegetarian' && <PackDot color="green" />}
        {category === 'regularBrown' && (
          <>
            <PackDot color="orange" />
            <PackDot color="brown" />
          </>
        )}
        {category === 'vegetarianBrown' && (
          <>
            <PackDot color="green" />
            <PackDot color="brown" />
          </>
        )}
      </span>
      {!inline && (
        <span className="packColorMeta">
          <span className="packColorLabel">{t(labelKey)}</span>
          <span className="packColorCount">× {count}</span>
        </span>
      )}
      {inline && <span className="packColorCount">× {count}</span>}
    </div>
  );
}

const PACK_CATEGORIES: PackCategory[] = [
  'regular',
  'vegetarian',
  'regularBrown',
  'vegetarianBrown',
];

function PackColorRows({
  summary,
  inline = false,
}: {
  summary: PickupDayPackSummary;
  inline?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {PACK_CATEGORIES.map((category) => (
        <PackCategoryRow
          key={category}
          category={category}
          count={countForCategory(summary, category)}
          inline={inline}
        />
      ))}
      {summary.withDrink > 0 && (
        <div className={`packColorRow${inline ? ' inline' : ''}`}>
          <span className="packColorDots">
            <PackDot color="blue" />
          </span>
          {!inline && (
            <span className="packColorMeta">
              <span className="packColorLabel">{t('pickup.pack.drinkAddon')}</span>
              <span className="packColorCount">× {summary.withDrink}</span>
            </span>
          )}
          {inline && <span className="packColorCount">× {summary.withDrink}</span>}
        </div>
      )}
    </>
  );
}

type SummaryProps = {
  summary: PickupDayPackSummary;
  compact?: boolean;
};

export function PickupPackColorSummary({ summary, compact = false }: SummaryProps) {
  const { t } = useI18n();
  const hasAny = PACK_CATEGORIES.some((c) => countForCategory(summary, c) > 0);
  if (!hasAny && summary.withDrink <= 0) return null;

  return (
    <div className={`pickupPackColorSummary${compact ? ' compact' : ''}`}>
      <p className="pickupPackTotal">
        {t(summary.totalPacks === 1 ? 'pickup.packsCollect' : 'pickup.packsCollectPlural', {
          count: summary.totalPacks,
        })}
      </p>
      <div className="packColorRows">
        <PackColorRows summary={summary} />
      </div>
    </div>
  );
}

export function PickupPackColorBesideId({ summary }: { summary: PickupDayPackSummary }) {
  const { t } = useI18n();
  const hasAny = PACK_CATEGORIES.some((c) => countForCategory(summary, c) > 0);
  if (!hasAny && summary.withDrink <= 0) return null;

  return (
    <div className="pickupIdColorCodes">
      <span className="pickupIdPackTotal">
        {t(summary.totalPacks === 1 ? 'pickup.packCount' : 'pickup.packCountPlural', {
          count: summary.totalPacks,
        })}
      </span>
      <div className="packColorRows inline">
        <PackColorRows summary={summary} inline />
      </div>
    </div>
  );
}
