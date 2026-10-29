import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { RequestServiceMinutes } from './request-sheet'

// The request sheet's service list (customer reach, 0062) with the optional
// duration (0064): a service with no duration shows nothing, never " min".

describe('RequestServiceMinutes', () => {
  test('a set duration reads as minutes', () => {
    expect(renderToStaticMarkup(<RequestServiceMinutes durationMins={45} />)).toBe(
      '<span class="block text-[12px] text-text-muted">45 min</span>'
    )
  })

  test('"Duration not set" shows nothing', () => {
    expect(renderToStaticMarkup(<RequestServiceMinutes durationMins={null} />)).toBe('')
  })
})
