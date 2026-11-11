import { useCallback, useEffect, useLayoutEffect } from 'react'
import { create } from 'zustand'
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware'
import { DEFAULT_LANG, isLang, type Lang } from './lang'
import {
  setCurrentLang,
  translate,
  translatePlural,
  type Translate,
  type Vars,
} from './translate'

/**
 * The language chosen on this browser or phone: English until someone picks
 * Tamil on Profile (customers) or Settings (garages). Kept on the device, not
 * the account, so the sign-in screens already speak it; the server knows
 * nothing of it yet (its pushes and texts stay English, phase 2).
 *
 * Where it is kept is handed in, as the native apps' other stores do: the
 * browser's localStorage by default, the phone's own storage (lib/device-prefs.ts)
 * once a native app calls `loadLang(devicePrefs)`.
 *
 * It is read after the page has hydrated, never during: a server-rendered page
 * is English, and the first client render has to match it, so the saved
 * choice arrives one render later (`useDocumentLang`). On a phone it is read
 * before the first render, so an app opens in its language.
 */

export const LANG_STORAGE_KEY = 'detlio-lang'

let backend: StateStorage | null = null

function storage(): StateStorage | null {
  if (backend) return backend
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Blocked (private mode, policy): the choice lasts for this page load.
    return null
  }
}

/** The handed-in storage when there is one, else the browser's; never throws. */
const deviceStorage: StateStorage = {
  getItem: (name) => {
    try {
      return storage()?.getItem(name) ?? null
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      storage()?.setItem(name, value)
    } catch {
      // It just isn't remembered.
    }
  },
  removeItem: (name) => {
    try {
      storage()?.removeItem(name)
    } catch {
      // Nothing to forget.
    }
  },
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLang = create<LangState>()(
  persist(
    (set) => ({
      lang: DEFAULT_LANG,
      setLang: (lang) => set({ lang }),
    }),
    {
      name: LANG_STORAGE_KEY,
      storage: createJSONStorage(() => deviceStorage),
      // Read when the app says so (loadLang), never while a page hydrates.
      skipHydration: true,
      partialize: (state) => ({ lang: state.lang }),
      // Anything but a language we speak is no choice at all.
      merge: (persisted, state) => {
        const saved = (persisted as { lang?: unknown } | undefined)?.lang
        return isLang(saved) ? { ...state, lang: saved } : state
      },
    }
  )
)

// Plain functions (t, tn, core's helpers) read the language from translate.ts.
useLang.subscribe((state) => setCurrentLang(state.lang))

/**
 * Reads the saved choice. Native: once, before the first render, with the
 * phone's storage (`loadLang(devicePrefs)` at the top of app/_layout.tsx).
 * Web: `useDocumentLang`, in the root layout's client provider, calls it.
 */
export function loadLang(storage?: StateStorage): void {
  if (storage) backend = storage
  void useLang.persist.rehydrate()
}

/**
 * `t` for a component: the English in the language chosen, re-rendering the
 * component when the choice changes. `const t = useT()`, then
 * `{t('Book now')}`, `aria-label={t('Close')}`, `t('Hi {name}', { name })`.
 */
export function useT(): Translate {
  const lang = useLang((s) => s.lang)
  return useCallback(
    (english: string, vars?: Vars) => translate(lang, english, vars),
    [lang]
  )
}

/** One or many, in a component: `const tn = useTn()`, then `tn(n, '{count} garage', '{count} garages')`. */
export function useTn(): (
  count: number,
  one: string,
  other: string,
  vars?: Vars
) => string {
  const lang = useLang((s) => s.lang)
  return useCallback(
    (count: number, one: string, other: string, vars?: Vars) =>
      translatePlural(lang, count, one, other, vars),
    [lang]
  )
}

// Layout effect on the client, so the saved language is in before the first
// paint; nothing at all on the server, where effects never run.
const useClientLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * The websites' root client provider calls this once: it reads the saved
 * choice after hydration and keeps `<html lang>` in step, so screen readers
 * and the browser's own text shaping know the page is Tamil. `enabled: false`
 * (the customer website while CUSTOMER_TAMIL is off) never reads it: English.
 */
export function useDocumentLang(enabled = true): void {
  const lang = useLang((s) => s.lang)
  useClientLayoutEffect(() => {
    if (enabled) loadLang()
  }, [enabled])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
}
