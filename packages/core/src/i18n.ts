/**
 * English and Tamil for the customer and garage apps (packages/core/src/i18n/,
 * GLOSSARY.md beside it). One import for a component:
 *
 *   import { useT, useTn, fill, useLang } from '@repo/core/i18n'
 *
 * Code outside a component (a helper, a toast, a constant), a file that is
 * not a client component, and core's own helpers import the plain functions
 * from '@repo/core/i18n/translate' instead (t, tn, msg, translate): no React,
 * no zustand, safe in a server component.
 */

export {
  DEFAULT_LANG,
  isLang,
  LANGS,
  LANGUAGE_NAMES,
  LANGUAGE_OPTIONS,
  type Lang,
} from './i18n/lang'
export {
  currentLang,
  interpolate,
  msg,
  t,
  tn,
  translate,
  translatePlural,
  type Translate,
  type Vars,
} from './i18n/translate'
export { fill } from './i18n/fill'
export {
  LANG_STORAGE_KEY,
  loadLang,
  useDocumentLang,
  useLang,
  useT,
  useTn,
} from './i18n/store'
