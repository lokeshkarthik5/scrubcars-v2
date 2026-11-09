import { afterEach, describe, expect, test } from 'bun:test'
import { TA, TA_FILES } from './dictionary'
import { isLang, LANGUAGE_OPTIONS } from './lang'
import { loadLang, useLang } from './store'
import {
  currentLang,
  interpolate,
  msg,
  placeholdersOf,
  t,
  tn,
  translate,
  translatePlural,
} from './translate'

afterEach(() => useLang.setState({ lang: 'en' }))

describe('translate', () => {
  test('English is the English, whatever the dictionary holds', () => {
    expect(translate('en', 'Book now')).toBe('Book now')
    expect(translate('en', 'Cancel')).toBe('Cancel')
  })

  test('Tamil when there is an entry', () => {
    expect(translate('ta', 'Cancel')).toBe(TA['Cancel']!)
    expect(translate('ta', 'Cancel')).not.toBe('Cancel')
  })

  test('a key with no Tamil falls back to its English', () => {
    expect(translate('ta', 'A sentence nobody has translated')).toBe(
      'A sentence nobody has translated'
    )
  })

  test('the lookup is the exact English: case and spacing matter', () => {
    expect(translate('ta', 'cancel')).toBe('cancel')
    expect(translate('ta', ' Cancel')).toBe(' Cancel')
  })

  test('no key reaches into the object prototype', () => {
    expect(translate('ta', 'constructor')).toBe('constructor')
    expect(translate('ta', 'toString')).toBe('toString')
    expect(translate('ta', '__proto__')).toBe('__proto__')
  })
})

describe('placeholders', () => {
  test('filled in both languages', () => {
    expect(translate('en', 'Pay {amount}', { amount: '₹499' })).toBe('Pay ₹499')
    expect(translate('ta', 'Pay {amount}', { amount: '₹499' })).toContain(
      '₹499'
    )
    expect(translate('ta', 'Pay {amount}', { amount: '₹499' })).not.toContain(
      '{amount}'
    )
  })

  test('every use of a name, numbers as given, and an unknown name left alone', () => {
    expect(interpolate('{a} and {a}', { a: 1 })).toBe('1 and 1')
    expect(interpolate('{a} of {b}', { a: 2 })).toBe('2 of {b}')
    expect(interpolate('No vars {here}')).toBe('No vars {here}')
  })

  test('a value that looks like a placeholder is not filled again', () => {
    expect(interpolate('{a}{b}', { a: '{b}', b: 'x' })).toBe('{b}x')
  })

  test('placeholdersOf lists each name once, sorted', () => {
    expect(placeholdersOf('{b} {a} {b}')).toEqual(['a', 'b'])
    expect(placeholdersOf('none')).toEqual([])
  })
})

describe('plurals', () => {
  test('English picks the form by count and fills {count} en-IN', () => {
    expect(translatePlural('en', 1, '{count} garage', '{count} garages')).toBe(
      '1 garage'
    )
    expect(translatePlural('en', 0, '{count} garage', '{count} garages')).toBe(
      '0 garages'
    )
    expect(
      translatePlural('en', 12500, '{count} garage', '{count} garages')
    ).toBe('12,500 garages')
  })

  test('Tamil looks each form up by its own English', () => {
    expect(translatePlural('ta', 1, '{count} garage', '{count} garages')).toBe(
      interpolate(TA['{count} garage']!, { count: '1' })
    )
    expect(translatePlural('ta', 3, '{count} garage', '{count} garages')).toBe(
      interpolate(TA['{count} garages']!, { count: '3' })
    )
  })
})

describe('the language in use', () => {
  test('t and tn follow the store', () => {
    expect(currentLang()).toBe('en')
    expect(t('Cancel')).toBe('Cancel')
    useLang.getState().setLang('ta')
    expect(currentLang()).toBe('ta')
    expect(t('Cancel')).toBe(TA['Cancel']!)
    expect(tn(2, '{count} garage', '{count} garages')).toBe(
      interpolate(TA['{count} garages']!, { count: '2' })
    )
    useLang.getState().setLang('en')
    expect(t('Cancel')).toBe('Cancel')
  })

  test('the saved choice is read from the storage handed in, and garbage is ignored', () => {
    const saved = new Map<string, string>()
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
      removeItem: (key: string) => void saved.delete(key),
    }
    saved.set(
      'detlio-lang',
      JSON.stringify({ state: { lang: 'ta' }, version: 0 })
    )
    loadLang(storage)
    expect(useLang.getState().lang).toBe('ta')
    expect(currentLang()).toBe('ta')

    useLang.getState().setLang('en')
    expect(JSON.parse(saved.get('detlio-lang')!).state).toEqual({ lang: 'en' })

    saved.set(
      'detlio-lang',
      JSON.stringify({ state: { lang: 'fr' }, version: 0 })
    )
    loadLang(storage)
    expect(useLang.getState().lang).toBe('en')
  })

  test('msg marks English and returns it unchanged', () => {
    expect(msg('Doorstep')).toBe('Doorstep')
  })
})

describe('the dictionary', () => {
  const entries = Object.entries(TA_FILES).flatMap(([file, dict]) =>
    Object.entries(dict).map(([english, tamil]) => ({ file, english, tamil }))
  )

  test('every Tamil keeps exactly the placeholders of its English', () => {
    const wrong = entries.filter(
      ({ english, tamil }) =>
        placeholdersOf(english).join() !== placeholdersOf(tamil).join()
    )
    expect(wrong).toEqual([])
  })

  test('no Tamil is empty or only spaces', () => {
    expect(entries.filter(({ tamil }) => tamil.trim() === '')).toEqual([])
  })

  test('no key is empty or padded, which no t() call could ever match', () => {
    expect(
      entries.filter(
        ({ english }) => english.trim() === '' || english !== english.trim()
      )
    ).toEqual([])
  })

  test('the same English in two files has the same Tamil', () => {
    const seen = new Map<string, { file: string; tamil: string }>()
    const clashes: string[] = []
    for (const { file, english, tamil } of entries) {
      const before = seen.get(english)
      if (before && before.tamil !== tamil)
        clashes.push(`${JSON.stringify(english)}: ${before.file} vs ${file}`)
      if (!before) seen.set(english, { file, tamil })
    }
    expect(clashes).toEqual([])
  })

  test('the option names are always in their own language', () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.label)).toEqual([
      'English',
      'தமிழ் (Tamil)',
    ])
    // Never translated: someone reading the other language must find their own.
    for (const option of LANGUAGE_OPTIONS)
      expect(TA[option.label]).toBeUndefined()
  })

  test('isLang accepts our two languages only', () => {
    expect(isLang('en')).toBe(true)
    expect(isLang('ta')).toBe(true)
    expect(isLang('fr')).toBe(false)
    expect(isLang(null)).toBe(false)
  })
})
