import { useEffect, useState } from 'react';
import { fetchWeeklyOptInStatus, type WeeklyMenuPayload } from '../api';

type Props = {
  onOrderNow: () => void;
};

export function MenuTab({ onOrderNow }: Props) {
  const [data, setData] = useState<WeeklyMenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVeg, setShowVeg] = useState(false);

  useEffect(() => {
    void fetchWeeklyOptInStatus()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="caption" style={{ padding: '20px 16px' }}>Loading menu…</p>;

  if (!data) {
    return (
      <section className="section">
        <h2>This week&apos;s menu 🍱</h2>
        <p className="caption">Menu not available yet — check back soon.</p>
        <button type="button" className="btnPrimary" onClick={onOrderNow} style={{ marginTop: 16 }}>
          Browse packages →
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2>This week&apos;s menu</h2>
            <p className="caption">{data.menu.weekStart} — {data.menu.weekEnd}</p>
          </div>
          <span className="sectionBadge">🍱 Weekly</span>
        </div>

        {/* Veg / Non-veg toggle */}
        <div className="menuDietSwitch">
          <button
            type="button"
            className={`menuDietBtn${!showVeg ? ' active' : ''}`}
            onClick={() => setShowVeg(false)}
          >
            🍗 Regular
          </button>
          <button
            type="button"
            className={`menuDietBtn${showVeg ? ' active' : ''}`}
            onClick={() => setShowVeg(true)}
          >
            🌱 Vegetarian
          </button>
        </div>

        {showVeg && (
          <p className="caption" style={{ marginBottom: 12, color: '#15803d' }}>
            Showing vegetarian menu options for this week.
          </p>
        )}

        <ul className="wkMenuList">
          {data.menu.days.map((day) => (
            <li key={day.date} className={`wkMenuDay${day.isSunday ? ' wkMenuDayClosed' : ''}${showVeg ? ' veg' : ''}`}>
              <div className="wkMenuDayHead">
                <strong>{day.weekday}</strong>
                <span className="wkMenuDayDate">{day.date.slice(5).replace('-', '/')}</span>
                {day.isSunday && <span className="wkMenuDayTag">Closed</span>}
              </div>
              {!day.isSunday && (
                <div className="wkMenuMeals">
                  <div className="wkMenuMeal">
                    <span className="wkMenuMealIcon">🌞</span>
                    <div className="wkMenuMealContent">
                      <span className="wkMenuMealLabel">Lunch</span>
                      <span className="wkMenuMealText">
                        {showVeg ? `Vegetarian ${day.lunch.dish}` : day.lunch.dish}
                      </span>
                    </div>
                  </div>
                  <div className="wkMenuMeal">
                    <span className="wkMenuMealIcon">🌙</span>
                    <div className="wkMenuMealContent">
                      <span className="wkMenuMealLabel">Dinner</span>
                      <span className="wkMenuMealText">
                        {showVeg ? `Vegetarian ${day.dinner.dish}` : day.dinner.dish}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="menuOrderCta">
        <p className="menuOrderCtaText">Like what you see?</p>
        <button type="button" className="btnPrimary" onClick={onOrderNow}>
          Order a plan →
        </button>
      </div>
    </>
  );
}
