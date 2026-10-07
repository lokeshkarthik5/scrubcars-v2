import { describe, expect, test } from 'bun:test'
import { formatRating, greetingFor, reviewCountLabel } from './vendor-stats'

// Every clock here is fixed and written in IST, so the answers do not depend
// on when or where the suite runs.
const at = (time: string) => new Date(`2026-10-05T${time}:00+05:30`)

describe('greetingFor', () => {
  test('says good morning from 5 am until noon', () => {
    expect(greetingFor(at('05:00'))).toBe('Good morning')
    expect(greetingFor(at('09:30'))).toBe('Good morning')
    expect(greetingFor(at('11:59'))).toBe('Good morning')
  })

  test('says good afternoon from noon until 5 pm', () => {
    expect(greetingFor(at('12:00'))).toBe('Good afternoon')
    expect(greetingFor(at('16:59'))).toBe('Good afternoon')
  })

  test('says good evening from 5 pm, through the night', () => {
    expect(greetingFor(at('17:00'))).toBe('Good evening')
    expect(greetingFor(at('23:30'))).toBe('Good evening')
    expect(greetingFor(at('00:00'))).toBe('Good evening')
    expect(greetingFor(at('04:59'))).toBe('Good evening')
  })

  test('reads the hour in Chennai, not in the zone the clock was made in', () => {
    // 03:30 UTC is 9 am in Chennai: morning there, whatever the device says.
    expect(greetingFor(new Date('2026-10-05T03:30:00Z'))).toBe('Good morning')
    // 12:00 UTC is 5:30 pm in Chennai.
    expect(greetingFor(new Date('2026-10-05T12:00:00Z'))).toBe('Good evening')
  })
})

describe('formatRating', () => {
  test('rounds an average to one decimal', () => {
    expect(formatRating(13 / 3)).toBe('4.3')
    expect(formatRating(4.66)).toBe('4.7')
    expect(formatRating(4.25)).toBe('4.3')
  })

  test('keeps the decimal on a whole number', () => {
    expect(formatRating(4)).toBe('4.0')
    expect(formatRating(5)).toBe('5.0')
  })

  // A garage with no reviews has no rating; "0.0" would read as zero stars.
  test('shows no reviews yet as a dash', () => {
    expect(formatRating(0)).toBe('–')
    expect(formatRating(Number.NaN)).toBe('–')
  })
})

describe('reviewCountLabel', () => {
  test('says so when there are none', () => {
    expect(reviewCountLabel(0)).toBe('No reviews yet')
  })

  test('agrees in number', () => {
    expect(reviewCountLabel(1)).toBe('1 review')
    expect(reviewCountLabel(3)).toBe('3 reviews')
  })
})
