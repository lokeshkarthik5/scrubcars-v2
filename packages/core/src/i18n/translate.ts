import { TA } from './dictionary'
import { DEFAULT_LANG, type Lang } from './lang'

/**
 * Looking English up in Tamil. Pure apart from the one language in use, and
 * free of React and of any package, so a server component, a plain helper and
 * the server's parity tests (which load core's files by path) can all use it.
 * The choice itself, remembered and reactive, is the store's (store.ts).
 *
 * Keys are the exact English the app shows, placeholders and all: the English
 * stays byte for byte what it was, so every E2E assertion on English copy
 * holds, and a string with no Tamil yet simply shows in English.
 */

/** Values for `{name}` placeholders. Numbers are written as given: format them first (en-IN). */
export type Vars = Readonly<Record<string, string | number>>

/** `t`: the English, in the language in use, with its placeholders filled. */
export type Translate = (english: string, vars?: Vars) => string

const PLACEHOLDER = /\{(\w+)\}/g

/** Fills `{name}` from vars; a placeholder with no value is left as written. */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : whole
  )
}

/** The `{name}`s a string carries, sorted: a translation must keep every one. */
export function placeholdersOf(text: string): string[] {
  return [
    ...new Set(Array.from(text.matchAll(PLACEHOLDER), (match) => match[1]!)),
  ].sort()
}

/** The Tamil for this English, or null when there is none yet. */
export function tamilFor(english: string): string | null {
  return Object.prototype.hasOwnProperty.call(TA, english) ? TA[english]! : null
}

/** For code that knows its language: the Tamil when there is one, else the English. */
export function translate(lang: Lang, english: string, vars?: Vars): string {
  const text = lang === 'ta' ? (tamilFor(english) ?? english) : english
  return interpolate(text, vars)
}

/**
 * One or many: `translatePlural(lang, n, '{count} garage', '{count} garages')`.
 * English picks by count; each form is its own key, so Tamil (which mostly
 * says both the same way) has an entry for each. `{count}` is filled in,
 * written en-IN.
 */
export function translatePlural(
  lang: Lang,
  count: number,
  one: string,
  other: string,
  vars?: Vars
): string {
  return translate(lang, count === 1 ? one : other, {
    count: count.toLocaleString('en-IN'),
    ...vars,
  })
}

/**
 * The language in use, kept here so plain functions (core's helpers, toasts,
 * an app's lib files) can ask without React. The store sets it; nothing else
 * should.
 */
let current: Lang = DEFAULT_LANG

export function currentLang(): Lang {
  return current
}

/** The store's alone (store.ts): everything else changes the language through useLang. */
export function setCurrentLang(lang: Lang): void {
  current = lang
}

/**
 * The English in the language in use, for code outside a component: a toast,
 * an event handler, a helper that builds a sentence. In a component use
 * `useT()`, which also re-renders the component when the language changes.
 */
export const t: Translate = (english, vars) => translate(current, english, vars)

/** `t` for one or many, outside a component: `tn(n, '{count} garage', '{count} garages')`. */
export function tn(
  count: number,
  one: string,
  other: string,
  vars?: Vars
): string {
  return translatePlural(current, count, one, other, vars)
}

/**
 * Marks English that is translated later, where it is shown: a label in a
 * constant (`{ label: msg('Doorstep') }`, then `t(option.label)` in the
 * component). Returns the English unchanged; it is there for
 * scripts/i18n-missing.ts, which reads the keys from t(), tn() and msg().
 */
export function msg<const S extends string>(english: S): S {
  return english
}
