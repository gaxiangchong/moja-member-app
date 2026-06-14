import { useEffect, useState } from 'react';
import { fetchWeeklyOptInStatus, type WeeklyMenuPayload } from '../api';
import { useI18n } from '../lib/i18n/context';
import { isTodayIso } from '../lib/dateUtils';

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
  const [data, setData] = useState<WeeklyMenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVeg, setShowVeg] = useState(false);

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
      <section className="section">
        <h2>{t('menu.title')} 🍱</h2>
        <p className="caption">{t('menu.empty')}</p>
        <button type="button" className="btnPrimary" onClick={onOrderNow} style={{ marginTop: 16 }}>
          {t('menu.browsePkg')}
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2>{t('menu.title')}</h2>
            <p className="caption">{data.menu.weekStart} — {data.menu.weekEnd}</p>
          </div>
          <div className="menuHeaderRight">
            <span className="sectionBadge">{t('menu.badge')}</span>
          </div>
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

        <ul className="wkMenuList">
          {data.menu.days.map((day) => {
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
            return (
              <li
                key={day.date}
                className={`wkMenuDay${isClosed ? ' wkMenuDayClosed' : ''}${isToday ? ' wkMenuDayToday' : ''}${showVeg ? ' veg' : ''}`}
              >
                <div className="wkMenuDayHead">
                  <strong>{dayLabel}</strong>
                  <span className="wkMenuDayDate">{day.date.slice(5).replace('-', '/')}</span>
                  {isToday && <span className="wkMenuDayTag wkMenuDayTodayTag">{t('common.today')}</span>}
                  {isClosed && <span className="wkMenuDayTag">{t('common.closed')}</span>}
                </div>
                {!isClosed && (
                  <div className="wkMenuMeals">
                    <div className="wkMenuMeal">
                      <span className="wkMenuMealIcon">🌞</span>
                      <div className="wkMenuMealContent">
                        <strong className="wkMenuMealLabel">{t('common.lunch')}</strong>
                        <span className="wkMenuMealText">{dishFor(day.lunch)}</span>
                      </div>
                    </div>
                    <div className="wkMenuMeal">
                      <span className="wkMenuMealIcon">🌙</span>
                      <div className="wkMenuMealContent">
                        <strong className="wkMenuMealLabel">{t('common.dinner')}</strong>
                        <span className="wkMenuMealText">{dishFor(day.dinner)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
