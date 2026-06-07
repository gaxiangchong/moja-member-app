import { useEffect, useState } from 'react';
import { fetchWeeklyOptInStatus, type WeeklyMenuPayload } from '../api';

type Props = {
  onOrderNow: () => void;
};

type Lang = 'en' | 'zh';

const WEEKDAY_ZH: Record<string, string> = {
  Mon: '星期一', Tue: '星期二', Wed: '星期三', Thu: '星期四',
  Fri: '星期五', Sat: '星期六', Sun: '星期日',
  Monday: '星期一', Tuesday: '星期二', Wednesday: '星期三',
  Thursday: '星期四', Friday: '星期五', Saturday: '星期六', Sunday: '星期日',
};

const T = {
  en: {
    title: "This week's menu",
    badge: '🍱 Weekly',
    regular: '🍗 Regular',
    veg: '🌱 Vegetarian',
    vegCaption: 'Showing vegetarian options for this week.',
    closed: 'Closed',
    lunch: 'Lunch',
    dinner: 'Dinner',
    loading: 'Loading menu…',
    empty: 'Menu not available yet — check back soon.',
    browsePkg: 'Browse packages →',
    ctaPrompt: 'Like what you see?',
    ctaBtn: 'Order a plan →',
  },
  zh: {
    title: '本周菜单',
    badge: '🍱 本周',
    regular: '🍗 荤菜',
    veg: '🌱 素菜',
    vegCaption: '显示本周素食选项。',
    closed: '休息',
    lunch: '午餐',
    dinner: '晚餐',
    loading: '菜单加载中…',
    empty: '本周菜单暂未公布，请稍候再来。',
    browsePkg: '浏览套餐 →',
    ctaPrompt: '喜欢今周菜单？',
    ctaBtn: '立即订餐 →',
  },
} as const;

export function MenuTab({ onOrderNow }: Props) {
  const [data, setData] = useState<WeeklyMenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVeg, setShowVeg] = useState(false);
  const [lang, setLang] = useState<Lang>('en');

  const t = T[lang];

  useEffect(() => {
    void fetchWeeklyOptInStatus()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="caption" style={{ padding: '20px 16px' }}>{t.loading}</p>;

  if (!data) {
    return (
      <section className="section">
        <div className="menuLangRow">
          <LangToggle lang={lang} onChange={setLang} />
        </div>
        <h2>{t.title} 🍱</h2>
        <p className="caption">{t.empty}</p>
        <button type="button" className="btnPrimary" onClick={onOrderNow} style={{ marginTop: 16 }}>
          {t.browsePkg}
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2>{t.title}</h2>
            <p className="caption">{data.menu.weekStart} — {data.menu.weekEnd}</p>
          </div>
          <div className="menuHeaderRight">
            <LangToggle lang={lang} onChange={setLang} />
            <span className="sectionBadge">{t.badge}</span>
          </div>
        </div>

        {/* Regular / Vegetarian toggle */}
        <div className="menuDietSwitch">
          <button
            type="button"
            className={`menuDietBtn${!showVeg ? ' active' : ''}`}
            onClick={() => setShowVeg(false)}
          >
            {t.regular}
          </button>
          <button
            type="button"
            className={`menuDietBtn${showVeg ? ' active' : ''}`}
            onClick={() => setShowVeg(true)}
          >
            {t.veg}
          </button>
        </div>

        {showVeg && (
          <p className="caption" style={{ marginBottom: 12, color: '#15803d' }}>
            {t.vegCaption}
          </p>
        )}

        <ul className="wkMenuList">
          {data.menu.days.map((day) => {
            const dayLabel = lang === 'zh' ? (WEEKDAY_ZH[day.weekday] ?? day.weekday) : day.weekday;
            const isClosed = day.closed ?? day.isSunday;
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
                className={`wkMenuDay${isClosed ? ' wkMenuDayClosed' : ''}${showVeg ? ' veg' : ''}`}
              >
                <div className="wkMenuDayHead">
                  <strong>{dayLabel}</strong>
                  <span className="wkMenuDayDate">{day.date.slice(5).replace('-', '/')}</span>
                  {isClosed && <span className="wkMenuDayTag">{t.closed}</span>}
                </div>
                {!isClosed && (
                  <div className="wkMenuMeals">
                    <div className="wkMenuMeal">
                      <span className="wkMenuMealIcon">🌞</span>
                      <div className="wkMenuMealContent">
                        <strong className="wkMenuMealLabel">{t.lunch}</strong>
                        <span className="wkMenuMealText">{dishFor(day.lunch)}</span>
                      </div>
                    </div>
                    <div className="wkMenuMeal">
                      <span className="wkMenuMealIcon">🌙</span>
                      <div className="wkMenuMealContent">
                        <strong className="wkMenuMealLabel">{t.dinner}</strong>
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
        <p className="menuOrderCtaText">{t.ctaPrompt}</p>
        <button type="button" className="btnPrimary" onClick={onOrderNow}>
          {t.ctaBtn}
        </button>
      </div>
    </>
  );
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="menuLangToggle">
      <button
        type="button"
        className={`menuLangBtn${lang === 'en' ? ' active' : ''}`}
        onClick={() => onChange('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`menuLangBtn${lang === 'zh' ? ' active' : ''}`}
        onClick={() => onChange('zh')}
      >
        中文
      </button>
    </div>
  );
}
