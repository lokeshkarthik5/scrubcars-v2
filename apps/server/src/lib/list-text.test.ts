import { describe, expect, test } from 'bun:test'
import { hasPoints, joinListText, pointOf, splitListText } from './list-text.js'

describe('list text', () => {
  test('reads "-", "•", "*", "·" and "1." / "1)" lines as points, the rest as the intro', () => {
    expect(
      splitListText('Full exterior and interior clean.\n- Foam wash & rinse\n•Vacuum cleaning\n* Dashboard polish\n2) Tyre polish\n3. Glass')
    ).toEqual({
      intro: 'Full exterior and interior clean.',
      points: ['Foam wash & rinse', 'Vacuum cleaning', 'Dashboard polish', 'Tyre polish', 'Glass'],
    })
  })

  test('a dash or number not followed by a space is not a point; blank lines are dropped', () => {
    expect(pointOf('-10% off')).toBeNull()
    expect(pointOf('2.5 hours')).toBeNull()
    expect(pointOf('-   ')).toBeNull()
    expect(splitListText('Line one\r\n\r\n  Line two  ')).toEqual({ intro: 'Line one\nLine two', points: [] })
    expect(splitListText(null)).toEqual({ intro: '', points: [] })
  })

  test('writes the one shape: intro, then "- " lines, blanks dropped', () => {
    expect(joinListText(' Intro ', ['  Foam   wash ', '', 'Vacuum'])).toBe('Intro\n- Foam wash\n- Vacuum')
    expect(joinListText('', ['A'])).toBe('- A')
    expect(joinListText('Only intro', [])).toBe('Only intro')
  })

  test('round trip: what is written reads back the same', () => {
    const text = joinListText('Intro', ['A', 'B'])
    const { intro, points } = splitListText(text)
    expect(joinListText(intro, points)).toBe(text)
    expect(hasPoints(text)).toBe(true)
    expect(hasPoints('Just a paragraph. - not a point')).toBe(false)
  })
})
