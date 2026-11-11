/**
 * The languages the customer and garage apps speak (owner, 10 Nov 2026: "Add a
 * tamil language option in both vendor & customer panel"). English is the
 * source: every string is written in English and looked up in Tamil by that
 * exact English (ta/*.ts). The admin panel stays English.
 *
 * No imports, so the server's parity tests can load the files that use it.
 */

export type Lang = 'en' | 'ta'

export const LANGS: readonly Lang[] = ['en', 'ta']

export const DEFAULT_LANG: Lang = 'en'

/**
 * The Language sheet's options, each always written in its own language, so
 * someone who cannot read the language on screen can still find theirs.
 */
export const LANGUAGE_OPTIONS: readonly { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ta', label: 'தமிழ் (Tamil)' },
]

/** The Language row's value: the choice in its own language, short. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  ta: 'தமிழ்',
}

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'ta'
}
