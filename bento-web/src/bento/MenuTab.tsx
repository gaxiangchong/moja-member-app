import { useEffect, useState } from 'react';
import { assetUrl, fetchWeeklyOptInStatus, type WeeklyMenuPayload } from '../api';
import { MENU_SHOW_IMAGES } from '../env';
import { useI18n } from '../lib/i18n/context';
import { isTodayIso, parseDateOnly } from '../lib/dateUtils';
import { LaunchAnnouncement } from './LaunchAnnouncement';

type Props = {
  onOrderNow: () => void;
};

const WEEKDAY_ZH: Record<string, string> = {
  Mon: '星期一', Tue: '星期二', Wed: '星期三', Thu: '星期四',
  Fri: '星期五', Sat: '星期六', Sun: '星期日',
  Monday: '星期一', Tuesday: '星期二', Wednesday: '星期三',
  Thursday: '星期四', Friday: '星期五', Saturday: '星期六', Sunday: '星期日',
};

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
  const [activeWeek, setActiveWeek] = useState(0);

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

  const weeks = data.weeks && data.weeks.length > 0 ? data.weeks : [data.menu];
  const weekIdx = Math.min(activeWeek, weeks.length - 1);
  const week = weeks[weekIdx];

  return (
    <>
      <LaunchAnnouncement />
      <section className="section wkMenuSection">
        <header className="wkMenuHero">
          <span className="wkMenuHeroSprig" aria-hidden="true" />
          <h2 className="wkMenuHeroTitle">{t('menu.title')}</h2>
          <span className="wkMenuHeroSprig flip" aria-hidden="true" />
          <p className="wkMenuHeroSub">{t('menu.heroSub')}</p>
          <div className="wkMenuHeroNav">
            {weeks.length > 1 && (
              <button
                type="button"
                className="wkMenuHeroArrow"
                onClick={() => setActiveWeek(weekIdx - 1)}
                disabled={weekIdx === 0}
                aria-label={t('menu.prevWeek')}
              >
                ‹
              </button>
            )}
            <span className="wkMenuHeroRange">
              {weeks.length > 1 && (
                <span className="wkMenuHeroWeekLabel">
                  {t('menu.weekLabel', { n: weekIdx + 1 })}
                </span>
              )}
              {formatRangeDate(week.weekStart)} — {formatRangeDate(week.weekEnd)}
            </span>
            {weeks.length > 1 && (
              <button
                type="button"
                className="wkMenuHeroArrow"
                onClick={() => setActiveWeek(weekIdx + 1)}
                disabled={weekIdx >= weeks.length - 1}
                aria-label={t('menu.nextWeekNav')}
              >
                ›
              </button>
            )}
          </div>
          <span className="wkMenuHeroNotice">
            <span className="wkMenuHeroNoticeLeaf" aria-hidden="true">🌿</span>
            {t('menu.notice')}
          </span>
        </header>

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

        <ul className="wkMenuList">
          {week.days.map((day) => {
            const dayLabel = lang === 'zh' ? (WEEKDAY_ZH[day.weekday] ?? day.weekday) : day.weekday;
            const isClosed = day.closed ?? day.isSunday;
            const isToday = isTodayIso(day.date);
            const dishFor = (meal: {
              dish: string;
              dishVeg: string;
              dishZh: string;
              dishVegZh: string;
            }) => {
              const regular =
                lang === 'zh' && meal.dishZh.trim() ? meal.dishZh : meal.dish;
              const veg =
                lang === 'zh' && meal.dishVegZh.trim()
                  ? meal.dishVegZh
                  : meal.dishVeg || meal.dish;
              return showVeg ? veg : regular;
            };
            const descFor = (meal: {
              dishDesc?: string;
              dishDescZh?: string;
              dishVegDesc?: string;
              dishVegDescZh?: string;
            }) => {
              if (showVeg) {
                return lang === 'zh' && (meal.dishVegDescZh ?? '').trim()
                  ? meal.dishVegDescZh!
                  : (meal.dishVegDesc ?? '');
              }
              return lang === 'zh' && (meal.dishDescZh ?? '').trim()
                ? meal.dishDescZh!
                : (meal.dishDesc ?? '');
            };
            const enWeekday = (day.weekday || '').slice(0, 3).toUpperCase();
            const zhWeekday = WEEKDAY_ZH[day.weekday] ?? '';
            return (
              <li
                key={day.date}
                className={`wkMenuDay${isClosed ? ' wkMenuDayClosed' : ''}${isToday ? ' wkMenuDayToday' : ''}${showVeg ? ' veg' : ''}`}
              >
                <div className="wkMenuDayRail">
                  <span className="wkMenuDayAbbr">{enWeekday || dayLabel}</span>
                  {zhWeekday && <span className="wkMenuDayZh">{zhWeekday}</span>}
                  {isToday && <span className="wkMenuDayTag wkMenuDayTodayTag">{t('common.today')}</span>}
                  {isClosed && <span className="wkMenuDayTag">{t('common.closed')}</span>}
                </div>
                {isClosed ? (
                  <div className="wkMenuClosedNote">
                    <span className="wkMenuClosedIcon">😴</span>
                    {t('weeklyOptIn.kitchenClosed')}
                  </div>
                ) : (
                  <div className={`wkMenuMeals${MENU_SHOW_IMAGES ? '' : ' textOnly'}`}>
                    {([
                      { key: 'lunch' as const, meal: day.lunch, icon: '🌞', label: t('common.lunch') },
                      { key: 'dinner' as const, meal: day.dinner, icon: '🌙', label: t('common.dinner') },
                    ]).map(({ key, meal, icon, label }) => (
                      <div className={`wkMenuMeal ${key}${MENU_SHOW_IMAGES ? '' : ' textOnly'}`} key={key}>
                        {MENU_SHOW_IMAGES && (
                          <span className="wkMenuMealIcon">
                            {meal.image
                              ? <img src={assetUrl(meal.image)} alt="" className="wkMenuMealPhoto" loading="lazy" />
                              : icon}
                          </span>
                        )}
                        <div className="wkMenuMealContent">
                          <span className="wkMenuMealLabel">{label}</span>
                          <strong className="wkMenuMealText">{dishFor(meal)}</strong>
                          {descFor(meal)?.trim() && (
                            <span className="wkMenuMealDesc">{descFor(meal)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    <p className="wkMenuDaySidesNote">{t('menu.sidesNote')}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <footer className="wkMenuFooter">
          <span className="wkMenuFooterIcon" aria-hidden="true">👨‍🍳</span>
          <div className="wkMenuFooterCopy">
            <strong className="wkMenuFooterTitle">{t('menu.footerTitle')}</strong>
            <span className="wkMenuFooterSub">{t('menu.footerSub')}</span>
          </div>
          <span className="wkMenuFooterScript">{t('menu.footerScript')}</span>
        </footer>
        <p className="wkMenuFooterNote">{t('menu.footerNote')}</p>
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
