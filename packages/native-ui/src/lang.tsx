import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * The language, handed in: this package has no dependency on @repo/core, so the
 * apps pass core's choice and lookup down (app/_layout.tsx, from @repo/core/i18n),
 * as they pass ThemeProvider its storage. Every shared part reads its words through
 * useT, and T sets Tamil a little taller.
 */
export type UiLang = 'en' | 'ta';
type Vars = Readonly<Record<string, string | number>>;

interface LangValue {
  lang: UiLang;
  t: (english: string, vars?: Vars) => string;
  tn: (count: number, one: string, other: string, vars?: Vars) => string;
}

/** English with its placeholders filled: what a part says with no provider above it. */
const fillIn = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text;

const LangContext = createContext<LangValue>({
  lang: 'en',
  t: fillIn,
  tn: (count, one, other, vars) => fillIn(count === 1 ? one : other, { count: count.toLocaleString('en-IN'), ...vars }),
});

export function LangProvider({ lang, t, tn, children }: LangValue & { children: ReactNode }) {
  const value = useMemo(() => ({ lang, t, tn }), [lang, t, tn]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** The language in use: 'ta' sets Tamil a little taller (T). */
export const useUiLang = () => useContext(LangContext).lang;

/** core's useT, for this package's own words: `const t = useT()`, then `t('Close')`. */
export const useT = () => useContext(LangContext).t;

/** core's useTn: `tn(n, '{count} photo', '{count} photos')`. */
export const useTn = () => useContext(LangContext).tn;
