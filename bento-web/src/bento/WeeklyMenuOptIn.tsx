import { useState } from 'react';
import { setWeeklyOptIn, type WeeklyMenuPayload } from '../api';
import { useI18n } from '../lib/i18n/context';
import { isTodayIso } from '../lib/dateUtils';

type Props = {
  data: WeeklyMenuPayload;
  onDone: (optedIn: boolean) => void;
};

function dishLabel(
  meal: { dish: string; dishVeg: string; dishZh: string; dishVegZh: string },
  lang: 'en' | 'zh',
) {
  const zh = meal.dishZh.trim();
  return lang === 'zh' && zh ? zh : meal.dish;
}

export function WeeklyMenuOptIn({ data, onDone }: Props) {
  const { lang, t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (optedIn: boolean) => {
    setLoading(true);
    setError(null);
    try {
      await setWeeklyOptIn(optedIn);
      onDone(optedIn);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('weeklyOptIn.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="weeklyGate">
      <header className="topBar">
        <h1>{t('weeklyOptIn.title')}</h1>
        <p className="caption">
          {t('weeklyOptIn.weekOf', { start: data.menu.weekStart, end: data.menu.weekEnd })}
        </p>
      </header>

      <section className="section">
        <p className="caption">{t('weeklyOptIn.intro')}</p>
        <ul className="weeklyMenuList">
          {data.menu.days.map((day) => {
            const isClosed = day.closed ?? day.isSunday;
            const isToday = isTodayIso(day.date);
            return (
              <li
                key={day.date}
                className={`${isClosed ? 'weeklyDayOff' : ''}${isToday ? ' weeklyDayToday' : ''}`.trim()}
              >
                <div className="weeklyDayHead">
                  <strong>
                    {day.weekday} {day.date.slice(8)}
                  </strong>
                  {isToday && (
                    <span className="weeklyDayTodayTag">{t('common.today')}</span>
                  )}
                  {isClosed && (
                    <span className="dayOffTag">{t('weeklyOptIn.kitchenClosed')}</span>
                  )}
                </div>
                {!isClosed && (
                  <>
                    <p className="weeklyMeal">
                      <strong className="weeklyMealLabel">{t('common.lunch')}</strong>{' '}
                      {dishLabel(day.lunch, lang)}
                    </p>
                    <p className="weeklyMeal">
                      <strong className="weeklyMealLabel">{t('common.dinner')}</strong>{' '}
                      {dishLabel(day.dinner, lang)}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {error && <p className="err">{error}</p>}

      <div className="weeklyOptActions">
        <button
          type="button"
          className="btnPrimary"
          disabled={loading}
          onClick={() => void respond(true)}
        >
          {loading ? t('common.saving') : t('weeklyOptIn.optIn')}
        </button>
        <button
          type="button"
          className="btnSecondary"
          disabled={loading}
          onClick={() => void respond(false)}
        >
          {t('weeklyOptIn.optOut')}
        </button>
      </div>
    </div>
  );
}
