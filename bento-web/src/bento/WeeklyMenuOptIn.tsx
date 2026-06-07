import { useState } from 'react';
import { setWeeklyOptIn, type WeeklyMenuPayload } from '../api';

type Props = {
  data: WeeklyMenuPayload;
  onDone: (optedIn: boolean) => void;
};

type Lang = 'en' | 'zh';

function dishLabel(
  meal: { dish: string; dishVeg: string; dishZh: string; dishVegZh: string },
  lang: Lang,
) {
  const zh = meal.dishZh.trim();
  return lang === 'zh' && zh ? zh : meal.dish;
}

export function WeeklyMenuOptIn({ data, onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('en');

  const respond = async (optedIn: boolean) => {
    setLoading(true);
    setError(null);
    try {
      await setWeeklyOptIn(optedIn);
      onDone(optedIn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your choice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="weeklyGate">
      <header className="topBar">
        <h1>{lang === 'zh' ? '本周菜单' : "This week's menu"}</h1>
        <p className="caption">
          Week of {data.menu.weekStart} — {data.menu.weekEnd}
        </p>
        <div className="menuLangRow" style={{ marginTop: 8 }}>
          <div className="menuLangToggle">
            <button
              type="button"
              className={`menuLangBtn${lang === 'en' ? ' active' : ''}`}
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={`menuLangBtn${lang === 'zh' ? ' active' : ''}`}
              onClick={() => setLang('zh')}
            >
              中文
            </button>
          </div>
        </div>
      </header>

      <section className="section">
        <p className="caption">
          {lang === 'zh'
            ? '感谢购买！请查看本周菜单，然后选择是否参加，再安排取餐日期。'
            : "Thanks for your purchase! Review this week's dishes, then choose whether to opt in before you schedule pickup days."}
        </p>
        <ul className="weeklyMenuList">
          {data.menu.days.map((day) => {
            const isClosed = day.closed ?? day.isSunday;
            return (
              <li key={day.date} className={isClosed ? 'weeklyDayOff' : ''}>
                <div className="weeklyDayHead">
                  <strong>
                    {day.weekday} {day.date.slice(8)}
                  </strong>
                  {isClosed && (
                    <span className="dayOffTag">
                      {lang === 'zh' ? '休息' : 'Kitchen closed'}
                    </span>
                  )}
                </div>
                {!isClosed && (
                  <>
                    <p className="weeklyMeal">
                      <strong className="weeklyMealLabel">
                        {lang === 'zh' ? '午餐' : 'Lunch'}
                      </strong>{' '}
                      {dishLabel(day.lunch, lang)}
                    </p>
                    <p className="weeklyMeal">
                      <strong className="weeklyMealLabel">
                        {lang === 'zh' ? '晚餐' : 'Dinner'}
                      </strong>{' '}
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
          {loading ? (lang === 'zh' ? '保存中…' : 'Saving…') : lang === 'zh' ? '是的，参加本周' : 'Yes, opt in this week'}
        </button>
        <button
          type="button"
          className="btnSecondary"
          disabled={loading}
          onClick={() => void respond(false)}
        >
          {lang === 'zh' ? '本周不参加' : 'Not this week'}
        </button>
      </div>
    </div>
  );
}
