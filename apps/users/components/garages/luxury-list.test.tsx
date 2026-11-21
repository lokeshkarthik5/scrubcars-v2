import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LuxuryBlock, LuxuryCardChip } from '@repo/ui/features/luxury-badge'
import { luxuryCaption, luxuryPeekWords } from '@repo/core/luxury'

// Luxury car specialists (0083, owner-approved mockups 21 Nov 2026). Which
// garages and when the row shows are pinned in packages/core/src/luxury.test.ts;
// here, the words and the badge's look on the website.

const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

describe('the list with "Luxury specialists" on', () => {
  test('the map peek counts specialists, near the customer or in their city', () => {
    expect(luxuryPeekWords(3, false, true, 'Chennai')).toBe('specialists near you')
    expect(luxuryPeekWords(1, false, true, 'Chennai')).toBe('specialist near you')
    expect(luxuryPeekWords(1, true, true, 'Chennai')).toBe('specialists near you')
    expect(luxuryPeekWords(2, false, false, 'Madurai')).toBe('specialists in Madurai')
    expect(luxuryPeekWords(1, false, false, 'Madurai')).toBe('specialist in Madurai')
  })

  test('the heading line says who approved them, and the order when nearest first', () => {
    expect(luxuryCaption(true)).toBe('Approved by Detlio for luxury cars · nearest first')
    expect(luxuryCaption(false)).toBe('Approved by Detlio for luxury cars')
  })
})

describe('the badge', () => {
  test('a card carries one quiet grey chip, never red or gold', () => {
    const html = renderToStaticMarkup(<LuxuryCardChip />)
    expect(text(html)).toBe('Luxury specialist')
    expect(html).not.toMatch(/red|gold|brand/i)
  })

  test("the garage page names the brands, Other left out, the customer's own make in white", () => {
    const html = renderToStaticMarkup(
      <LuxuryBlock brands={['BMW', 'Mercedes-Benz', 'Audi', 'Other']} customerMake="merc c200" />
    )
    expect(text(html)).toContain('Luxury specialist What this means')
    expect(text(html)).toContain('Handles BMW · Mercedes-Benz · Audi')
    expect(text(html)).not.toContain('Other')
    expect(html).toContain('<span class="font-semibold text-text-primary">Mercedes-Benz</span>')
    expect(html).toContain('<span>BMW</span>')
  })

  test('no customer car: every brand the same', () => {
    const html = renderToStaticMarkup(<LuxuryBlock brands={['BMW', 'Audi']} />)
    expect(html).not.toContain('text-text-primary">BMW')
  })
})
