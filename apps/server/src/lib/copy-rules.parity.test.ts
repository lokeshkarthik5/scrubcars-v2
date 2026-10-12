import { describe, expect, test } from 'bun:test'
import { BANNED_COPY, bannedPhraseIn } from './copy-rules.js'

// The customer-facing twin lives in packages/core, which the server does not
// depend on. Loaded by path at run time (a computed specifier, so the
// server's TypeScript build never tries to compile a file outside src/).
const coreUrl = new URL('../../../../packages/core/src/copy-rules.ts', import.meta.url).href

describe('copy rules', () => {
  test('the server and core lists are the same, in the same order', async () => {
    const core = (await import(coreUrl)) as { BANNED_COPY: readonly string[]; bannedPhraseIn: (text: string) => string | null }
    expect([...core.BANNED_COPY]).toEqual([...BANNED_COPY])
    for (const text of [
      'Cheap wash',
      'Cheapest wash in Chennai',
      'Guaranteed shine',
      'Shine guarantee',
      'We’ll notify you',
      "We'll let you know",
      'We will message you when it is ready',
      'Monsoon wash 20% off',
      'Underbody rinse',
    ]) {
      expect(core.bannedPhraseIn(text)).toBe(bannedPhraseIn(text))
    }
  })

  test('catches the banned words as whole words, in any case', () => {
    expect(bannedPhraseIn('CHEAP wash today')).toBe('cheap')
    expect(bannedPhraseIn('A miracle shine')).toBe('miracle')
    expect(bannedPhraseIn('Verified garages only')).toBe('verified')
    expect(bannedPhraseIn('Lifetime coating')).toBe('lifetime')
    expect(bannedPhraseIn("Book now and we'll notify you")).toBe("we'll notify you")
    expect(bannedPhraseIn('We’ll notify you when it is ready')).toBe("we'll notify you")
  })

  test('catches the other forms: superlatives, guarantees and promised messages', () => {
    expect(bannedPhraseIn('Cheapest wash in Chennai')).toBe('cheapest')
    expect(bannedPhraseIn('We guarantee a spotless car')).toBe('guarantee')
    expect(bannedPhraseIn('Shine guarantee')).toBe('guarantee')
    expect(bannedPhraseIn('It guarantees a shine')).toBe('guarantees')
    expect(bannedPhraseIn("We'll let you know")).toBe("we'll let you know")
    expect(bannedPhraseIn('We will message you when it is ready')).toBe('we will message you')
    expect(bannedPhraseIn('We’ll text you the slot')).toBe("we'll text you")
    expect(bannedPhraseIn("We'll call you to confirm")).toBe("we'll call you")
  })

  test('leaves plain offers alone', () => {
    expect(bannedPhraseIn('20% off any service')).toBeNull()
    expect(bannedPhraseIn('Cheaper by ₹100 this week')).toBeNull()
    expect(bannedPhraseIn('Slot may move: rain')).toBeNull()
  })
})
