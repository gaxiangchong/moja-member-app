import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { parseDateOnly } from '../dateUtils';
import type { BentoPackageCode, BentoDietVariant } from '../../bento/types';
import {
  interpolate,
  translate,
  type Lang,
  type TranslationVars,
} from './translations';

const STORAGE_KEY = 'bento-lang';

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: TranslationVars) => string;
  packageLabel: (code: BentoPackageCode, fallback?: string) => string;
  mealTierLabel: (mealCredits: number) => string | null;
  formatPlanDuration: (days: number) => string;
  dietLabel: (variant: BentoDietVariant | string) => string;
  statusLabel: (status: string) => string;
  weekdayShort: (iso: string) => string;
  weekdayLong: (iso: string) => string;
  shortDate: (iso: string) => string;
  fullDate: (iso: string) => string;
  monthLabel: (year: number, month: number) => string;
  calendarDayHeaders: () => string[];
  plural: (count: number, singularKey: string, pluralKey: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const MEAL_TIER_KEYS: Partial<Record<number, string>> = {
  10: 'package.tierValue',
  20: 'package.tierGood',
  30: 'package.tierSuper',
};

const WEEKDAY_SHORT_KEYS = [
  'weekday.sunShort',
  'weekday.monShort',
  'weekday.tueShort',
  'weekday.wedShort',
  'weekday.thuShort',
  'weekday.friShort',
  'weekday.satShort',
] as const;

const WEEKDAY_LONG_KEYS = [
  'weekday.sunLong',
  'weekday.monLong',
  'weekday.tueLong',
  'weekday.wedLong',
  'weekday.thuLong',
  'weekday.friLong',
  'weekday.satLong',
] as const;

function readStoredLang(): Lang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: TranslationVars) => translate(lang, key, vars),
    [lang],
  );

  const locale = lang === 'zh' ? 'zh-CN' : 'en-MY';

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    setLang,
    t,
    packageLabel: (code, fallback) => {
      const key = `package.label.${code}`;
      const translated = translate(lang, key);
      return translated === key ? (fallback ?? code) : translated;
    },
    mealTierLabel: (mealCredits) => {
      const key = MEAL_TIER_KEYS[mealCredits];
      return key ? translate(lang, key) : null;
    },
    formatPlanDuration: (days) =>
      days === 1
        ? translate(lang, 'package.durationDay')
        : interpolate(translate(lang, 'package.durationDays'), { count: days }),
    dietLabel: (variant) =>
      variant === 'VEG' ? translate(lang, 'common.vegetarian') : translate(lang, 'common.regular'),
    statusLabel: (status) => {
      const key = `status.${status.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
      const mapped = translate(lang, key);
      if (mapped !== key) return mapped;
      return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    },
    weekdayShort: (iso) => {
      const dow = parseDateOnly(iso).getUTCDay();
      return translate(lang, WEEKDAY_SHORT_KEYS[dow]!);
    },
    weekdayLong: (iso) => {
      const dow = parseDateOnly(iso).getUTCDay();
      return translate(lang, WEEKDAY_LONG_KEYS[dow]!);
    },
    shortDate: (iso) => {
      const d = parseDateOnly(iso);
      const month = d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
      return `${translate(lang, WEEKDAY_SHORT_KEYS[d.getUTCDay()]!)} ${d.getUTCDate()} ${month}`;
    },
    fullDate: (iso) => {
      const d = parseDateOnly(iso);
      const month = d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
      const sep = lang === 'zh' ? '，' : ', ';
      return `${translate(lang, WEEKDAY_LONG_KEYS[d.getUTCDay()]!)}${sep}${d.getUTCDate()} ${month}`;
    },
    monthLabel: (year, month) =>
      new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    calendarDayHeaders: () =>
      lang === 'zh'
        ? ['一', '二', '三', '四', '五', '六', '日']
        : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    plural: (count, singularKey, pluralKey) =>
      count === 1 ? translate(lang, singularKey) : translate(lang, pluralKey),
  }), [lang, locale, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within LangProvider');
  return ctx;
}

export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`menuLangToggle${className ? ` ${className}` : ''}`}>
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
  );
}
