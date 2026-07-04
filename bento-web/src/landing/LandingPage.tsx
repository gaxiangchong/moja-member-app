import { useRef } from 'react';
import './landing.css';
import { whatsappUrl } from '../env';
import { LangToggle, useI18n } from '../lib/i18n/context';
import heroImg from '../assets/landing/hero-bento-web.jpg';
import dishCurryChicken from '../assets/landing/dish-curry-chicken-web.jpg';
import dishSambalSotong from '../assets/landing/dish-sambal-sotong-web.jpg';
import dishVeggieBox from '../assets/landing/dish-veggie-box-web.jpg';

type Props = {
  /** Called when the visitor taps any CTA or the login link. */
  onLogin: () => void;
};

/**
 * Static pricing shown pre-login (packages API requires auth). Mirrors the
 * seeded packages in src/bento/bento.service.ts — keep in sync when repricing.
 */
const SINGLE_MEAL_RM = 17.9;
const PLANS = [
  { labelKey: 'package.label.DAYS_7', perMealRm: 16, meals: 10, days: 30 },
  { labelKey: 'package.label.DAYS_15', perMealRm: 15, meals: 20, days: 60 },
  { labelKey: 'package.label.DAYS_30', perMealRm: 13.9, meals: 30, days: 90, best: true },
] as const;

function formatRmShort(rm: number): string {
  return `RM${Number.isInteger(rm) ? rm : rm.toFixed(2)}`;
}

function planSavingsRm(perMealRm: number, meals: number): number {
  return Math.round((SINGLE_MEAL_RM - perMealRm) * meals);
}

export function LandingPage({ onLogin }: Props) {
  const { t } = useI18n();
  const plansRef = useRef<HTMLElement | null>(null);

  const scrollToPlans = () => {
    plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const dishes = [
    { img: dishCurryChicken, name: t('landing.dish1Name'), sub: t('landing.dish1Sub') },
    { img: dishSambalSotong, name: t('landing.dish2Name'), sub: t('landing.dish2Sub') },
    { img: dishVeggieBox, name: t('landing.dish3Name'), sub: t('landing.dish3Sub') },
  ];

  const steps = [
    { icon: '🍱', title: t('landing.how1Title'), desc: t('landing.how1Desc') },
    { icon: '📅', title: t('landing.how2Title'), desc: t('landing.how2Desc') },
    { icon: '📲', title: t('landing.how3Title'), desc: t('landing.how3Desc') },
  ];

  const faqs = [
    { q: t('landing.faq1Q'), a: t('landing.faq1A') },
    { q: t('landing.faq2Q'), a: t('landing.faq2A') },
    { q: t('landing.faq3Q'), a: t('landing.faq3A') },
    { q: t('landing.faq4Q'), a: t('landing.faq4A') },
  ];

  return (
    <div className="landing">
      <header className="landingHeader">
        <div className="landingBrand">
          <span className="landingBrandMark" aria-hidden>🍱</span>
          <span className="landingBrandName">{t('auth.brandName')}</span>
        </div>
        <div className="landingHeaderActions">
          <LangToggle className="landingLangToggle" />
          <button type="button" className="landingLoginLink" onClick={onLogin}>
            {t('landing.login')}
          </button>
        </div>
      </header>

      <div className="landingPromoBar">{t('landing.promo')}</div>

      <section className="landingHero">
        <span className="landingTag">📍 {t('landing.heroTag')}</span>
        <h1 className="landingHeroTitle">{t('landing.heroTitle')}</h1>
        <p className="landingHeroSub">{t('landing.heroSub')}</p>
        <img className="landingHeroImg" src={heroImg} alt={t('landing.heroImgAlt')} />
        <button type="button" className="btnPrimary" onClick={onLogin}>
          {t('landing.ctaTrial')}
        </button>
        <button type="button" className="btnSecondary" onClick={scrollToPlans}>
          {t('landing.ctaPlans')}
        </button>
        <p className="landingTrustLine">{t('landing.trustLine')}</p>
      </section>

      <section className="landingStats">
        <div className="landingStat">
          <strong>{t('landing.stat1Value')}</strong>
          <span>{t('landing.stat1Label')}</span>
        </div>
        <div className="landingStat">
          <strong>{t('landing.stat2Value')}</strong>
          <span>{t('landing.stat2Label')}</span>
        </div>
        <div className="landingStat">
          <strong>{t('landing.stat3Value')}</strong>
          <span>{t('landing.stat3Label')}</span>
        </div>
      </section>

      <section className="landingSection">
        <h2 className="landingSectionTitle">{t('landing.howTitle')}</h2>
        <ol className="landingSteps">
          {steps.map((step, i) => (
            <li key={step.title} className="landingStep">
              <span className="landingStepIcon" aria-hidden>{step.icon}</span>
              <div>
                <p className="landingStepTitle">{i + 1} · {step.title}</p>
                <p className="landingStepDesc">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landingSection landingSectionAlt">
        <h2 className="landingSectionTitle">{t('landing.menuTitle')}</h2>
        <div className="landingDishes">
          {dishes.map((dish) => (
            <figure key={dish.name} className="landingDish">
              <img src={dish.img} alt={dish.name} loading="lazy" />
              <figcaption>
                <p className="landingDishName">{dish.name}</p>
                <p className="landingDishSub">{dish.sub}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="landingMenuNote">{t('landing.menuNote')}</p>
      </section>

      <section className="landingSection" ref={plansRef}>
        <h2 className="landingSectionTitle">{t('landing.plansTitle')}</h2>
        <p className="landingSectionSub">{t('landing.plansSub')}</p>
        <div className="landingPlans">
          <button type="button" className="landingPlan landingPlanTrial" onClick={onLogin}>
            <span className="landingPlanBadge">{t('landing.planTrialBadge')}</span>
            <div className="landingPlanRow">
              <div>
                <p className="landingPlanName">{t('package.label.NEWCOMER_3')}</p>
                <p className="landingPlanMeta">{t('landing.planTrialMeta', { days: 14 })}</p>
              </div>
              <div className="landingPlanPrice">
                <p className="landingPlanPriceMain">RM39</p>
                <p className="landingPlanMeta">RM13 {t('common.perMeal')}</p>
              </div>
            </div>
          </button>
          {PLANS.map((plan) => (
            <button type="button" key={plan.labelKey} className="landingPlan" onClick={onLogin}>
              <div className="landingPlanRow">
                <div>
                  <p className="landingPlanName">
                    {t(plan.labelKey)}
                    {'best' in plan && plan.best && (
                      <span className="landingPlanChip">{t('package.tierSuper')}</span>
                    )}
                  </p>
                  <p className="landingPlanMeta">{t('landing.planValidMeta', { days: plan.days })}</p>
                </div>
                <div className="landingPlanPrice">
                  <p className="landingPlanPriceMain">{formatRmShort(plan.perMealRm)} <span>{t('common.perMeal')}</span></p>
                  <p className="landingPlanMeta">
                    {t('landing.planSaveTotal', { amount: `RM${planSavingsRm(plan.perMealRm, plan.meals)}` })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="landingSection landingSectionAlt">
        <h2 className="landingSectionTitle">{t('landing.faqTitle')}</h2>
        <div className="landingFaqList">
          {faqs.map((faq) => (
            <details key={faq.q} className="landingFaq">
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landingFinal">
        <h2>{t('landing.finalTitle')}</h2>
        <p>{t('landing.finalSub')}</p>
        <button type="button" className="btnPrimary landingFinalBtn" onClick={onLogin}>
          {t('landing.finalCta')}
        </button>
        <p className="landingFinalWhatsapp">
          {t('landing.whatsappPrompt')}{' '}
          <a href={whatsappUrl()} target="_blank" rel="noreferrer">{t('landing.whatsappCta')}</a>
        </p>
      </section>

      <div className="landingStickyBar">
        <div className="landingStickyInfo">
          <p className="landingStickyPlan">{t('landing.stickyPlan')}</p>
          <p className="landingStickyPrice">
            RM39 <span>{t('landing.stickyCode')}</span>
          </p>
        </div>
        <button type="button" className="btnPrimary landingStickyBtn" onClick={onLogin}>
          {t('landing.getStarted')}
        </button>
      </div>
    </div>
  );
}
