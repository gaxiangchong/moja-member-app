import { useEffect, useState } from 'react';
import { assetUrl, fetchWeeklyOptInStatus, type WeeklyMenuPayload, type WeeklyMenuMeal } from '../api';
import { useI18n } from '../lib/i18n/context';
import { isTodayIso, parseDateOnly } from '../lib/dateUtils';
import { LaunchAnnouncement } from './LaunchAnnouncement';

type Props = {
  onOrderNow: () => void;
};

type MealFilter = 'BOTH' | 'LUNCH' | 'DINNER';

const WEEKDAY_ZH: Record<string, string> = {
  Mon: '星期一', Tue: '星期二', Wed: '星期三', Thu: '星期四',
  Fri: '星期五', Sat: '星期六', Sun: '星期日',
  Monday: '星期一', Tuesday: '星期二', Wednesday: '星期三',
  Thursday: '星期四', Friday: '星期五', Saturday: '星期六', Sunday: '星期日',
};

/**
 * Parse a dish string into a structured bento: the protein/main dish (first
 * segment), supporting side dishes, and an optional remark. Authors write, e.g.
 *   "Teriyaki Chicken, Stir-fried cabbage, Egg tofu (Veg may vary)"
 * Separators: comma / slash / plus / pipe / Chinese punctuation. Trailing
 * parentheses (or text after "~") become the remark. A single name simply
 * shows as the main dish with no sides.
 */
function splitDish(text: string): { main: string; sides: string[]; note: string } {
  let cleaned = (text || '').trim();
  if (!cleaned) return { main: '', sides: [], note: '' };

  let note = '';
  const paren = cleaned.match(/\(([^)]*)\)\s*$/);
  if (paren) {
    note = paren[1].trim();
    cleaned = cleaned.slice(0, paren.index).trim();
  } else {
    const tilde = cleaned.split(/\s*[~]\s*/);
    if (tilde.length > 1) {
      note = tilde.slice(1).join(' ').trim();
      cleaned = tilde[0].trim();
    }
  }

  const parts = cleaned
    .split(/\s*[,/|+·•、，；;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { main: cleaned, sides: [], note };
  return { main: parts[0], sides: parts.slice(1), note };
}

export function MenuTab({ onOrderNow }: Props) {
  const { lang, t } = useI18n();
  const locale = lang === 'zh' ? 'zh-CN' : 'en-MY';
  const formatRangeDate = (iso: string) =>
    parseDateOnly(iso).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const [data, setData] = useState<WeeklyMenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVeg, setShowVeg] = useState(false);
  const [mealFilter, setMealFilter] = useState<MealFilter>('BOTH');

  useEffect(() => {
    void fetchWeeklyOptInStatus()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="caption" style={{ padding: '20px 16px' }}>{t('menu.loading')}</p>;
  }

  if (!data) {
    return (
      <>
        <LaunchAnnouncement />
        <section className="section">
          <h2>{t('menu.title')} 🍱</h2>
          <p className="caption">{t('menu.empty')}</p>
          <button type="button" className="btnPrimary" onClick={onOrderNow} style={{ marginTop: 16 }}>
            {t('menu.browsePkg')}
          </button>
        </section>
      </>
    );
  }

  const dishFor = (meal: WeeklyMenuMeal) => {
    const regular = lang === 'zh' && meal.dishZh.trim() ? meal.dishZh : meal.dish;
    const veg =
      lang === 'zh' && meal.dishVegZh.trim()
        ? meal.dishVegZh
        : meal.dishVeg || meal.dish;
    return showVeg ? veg : regular;
  };

  const renderMeal = (meal: WeeklyMenuMeal, type: 'lunch' | 'dinner') => {
    const { main, sides, note } = splitDish(dishFor(meal));
    if (!main) return null;
    // Decorative only — never zoomable / clickable / modal.
    const img = assetUrl(showVeg ? meal.imageVeg || meal.image : meal.image);
    return (
      <article className={`bmCard ${type}${showVeg ? ' veg' : ''}`}>
        {img && (
          <div className="bmCardImg" aria-hidden="true">
            <img src={img} alt="" draggable={false} loading="lazy" />
          </div>
        )}
        <div className="bmCardBody">
          <div className="bmKicker">
            <span className="bmKickerIcon">{type === 'lunch' ? '☀️' : '🌙'}</span>
            <span className="bmKickerText">
              {type === 'lunch' ? t('common.lunch') : t('common.dinner')}
            </span>
          </div>
          <h3 className="bmHero">{main}</h3>
          <span className="bmHeroLabel">{t('menu.mainLabel')}</span>
          {sides.length > 0 && (
            <div className="bmSideGrid">
              {sides.map((s, i) => (
                <div className="bmSideItem" key={i}>
                  <span className="bmSideKicker">{t('menu.sideLabel', { n: i + 1 })}</span>
                  <span className="bmSideName">{s}</span>
                </div>
              ))}
            </div>
          )}
          {note && <p className="bmFootnote">{note}</p>}
        </div>
      </article>
    );
  };

  return (
    <>
      <LaunchAnnouncement />
      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2>{t('menu.title')}</h2>
            <p className="caption">{formatRangeDate(data.menu.weekStart)} — {formatRangeDate(data.menu.weekEnd)}</p>
          </div>
          <div className="menuHeaderRight">
            <span className="sectionBadge">{t('menu.badge')}</span>
          </div>
        </div>

        <div className="menuDietSwitch">
          <button
            type="button"
            className={`menuDietBtn${mealFilter === 'BOTH' ? ' active' : ''}`}
            onClick={() => setMealFilter('BOTH')}
          >
            {t('menu.filterBoth')}
          </button>
          <button
            type="button"
            className={`menuDietBtn${mealFilter === 'LUNCH' ? ' active' : ''}`}
            onClick={() => setMealFilter('LUNCH')}
          >
            ☀️ {t('common.lunch')}
          </button>
          <button
            type="button"
            className={`menuDietBtn${mealFilter === 'DINNER' ? ' active' : ''}`}
            onClick={() => setMealFilter('DINNER')}
          >
            🌙 {t('common.dinner')}
          </button>
        </div>

        <div className="menuDietSwitch">
          <button
            type="button"
            className={`menuDietBtn${!showVeg ? ' active' : ''}`}
            onClick={() => setShowVeg(false)}
          >
            {t('menu.regular')}
          </button>
          <button
            type="button"
            className={`menuDietBtn${showVeg ? ' active' : ''}`}
            onClick={() => setShowVeg(true)}
          >
            {t('menu.veg')}
          </button>
        </div>

        {showVeg && (
          <p className="caption" style={{ marginBottom: 12, color: '#15803d' }}>
            {t('menu.vegCaption')}
          </p>
        )}

        <div className="bmMenu">
          {data.menu.days.map((day) => {
            const dayLabel = lang === 'zh' ? (WEEKDAY_ZH[day.weekday] ?? day.weekday) : day.weekday;
            const isClosed = day.closed ?? day.isSunday;
            const isToday = isTodayIso(day.date);
            return (
              <section
                key={day.date}
                className={`bmDay${isToday ? ' today' : ''}${isClosed ? ' closed' : ''}`}
              >
                <header className="bmDayHead">
                  <span className="bmDayDot" aria-hidden="true" />
                  <span className="bmDayName">{dayLabel}</span>
                  <span className="bmDayDate">{formatRangeDate(day.date)}</span>
                  {isToday && <span className="bmTodayPill">{t('common.today')}</span>}
                  {isClosed && <span className="bmClosedPill">{t('common.closed')}</span>}
                  {isToday && !isClosed && (
                    <button type="button" className="bmOrderBtn" onClick={onOrderNow}>
                      {t('menu.orderNow')} →
                    </button>
                  )}
                </header>
                {!isClosed && (
                  <div className="bmMealsRow">
                    {(mealFilter === 'BOTH' || mealFilter === 'LUNCH') && renderMeal(day.lunch, 'lunch')}
                    {(mealFilter === 'BOTH' || mealFilter === 'DINNER') && renderMeal(day.dinner, 'dinner')}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </section>

      <div className="menuOrderCta">
        <p className="menuOrderCtaText">{t('menu.ctaPrompt')}</p>
        <button type="button" className="btnPrimary" onClick={onOrderNow}>
          {t('menu.ctaBtn')}
        </button>
      </div>
    </>
  );
}
