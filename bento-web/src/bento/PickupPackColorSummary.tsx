import type { PackCategory, PickupDayPackSummary } from './pickupPackSummary';
import { countForCategory } from './pickupPackSummary';

const CATEGORY_LABEL: Record<PackCategory, string> = {
  regular: 'Regular',
  vegetarian: 'Vegetarian',
  regularBrown: 'Regular · brown rice',
  vegetarianBrown: 'Vegetarian · brown rice',
};

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
  if (count <= 0) return null;
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
          <span className="packColorLabel">{CATEGORY_LABEL[category]}</span>
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
              <span className="packColorLabel">Drink add-on</span>
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
  const hasAny = PACK_CATEGORIES.some((c) => countForCategory(summary, c) > 0);
  if (!hasAny && summary.withDrink <= 0) return null;

  return (
    <div className={`pickupPackColorSummary${compact ? ' compact' : ''}`}>
      <p className="pickupPackTotal">
        <strong>{summary.totalPacks}</strong>
        {' '}pack{summary.totalPacks === 1 ? '' : 's'} to collect
      </p>
      <div className="packColorRows">
        <PackColorRows summary={summary} />
      </div>
    </div>
  );
}

export function PickupPackColorBesideId({ summary }: { summary: PickupDayPackSummary }) {
  const hasAny = PACK_CATEGORIES.some((c) => countForCategory(summary, c) > 0);
  if (!hasAny && summary.withDrink <= 0) return null;

  return (
    <div className="pickupIdColorCodes">
      <span className="pickupIdPackTotal">
        {summary.totalPacks} pack{summary.totalPacks === 1 ? '' : 's'}
      </span>
      <div className="packColorRows inline">
        <PackColorRows summary={summary} inline />
      </div>
    </div>
  );
}
