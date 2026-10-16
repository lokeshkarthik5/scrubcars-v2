import { afterAll, describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScButton } from '@repo/ui/sc/button'
import { MainAction } from './main-action'

const saved = process.env.NEXT_PUBLIC_HOME_HUB
afterAll(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_HOME_HUB
  else process.env.NEXT_PUBLIC_HOME_HUB = saved
})

function withHub(value: string | undefined, render: () => string) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_HOME_HUB
  else process.env.NEXT_PUBLIC_HOME_HUB = value
  return render()
}

// Checkout's Pay, as the page draws it.
const pay = (props: { hero?: boolean; disabled?: boolean } = {}) =>
  renderToStaticMarkup(
    <MainAction
      className="rounded-full py-4 text-[15px]"
      heroIcon={<i data-icon="arrow" />}
      {...props}
    >
      Pay <span className="font-numeric font-bold">₹499</span>
    </MainAction>
  )

describe('MainAction with the Home hub off (production)', () => {
  test("is the screen's old red button, byte for byte", () => {
    const before = renderToStaticMarkup(
      <ScButton className="rounded-full py-4 text-[15px]">
        Pay <span className="font-numeric font-bold">₹499</span>
      </ScButton>
    )
    for (const hub of [undefined, '', 'off', 'true']) {
      const html = withHub(hub, () => pay())
      expect(html).toBe(before)
      expect(html).toContain('bg-brand-red')
      expect(html).not.toContain('cta-hero')
      expect(html).not.toContain('data-icon')
    }
  })

  test("the garage page's Book Now too", () => {
    const html = withHub(undefined, () =>
      renderToStaticMarkup(
        <MainAction fullWidth={false} className="px-8" heroClassName="px-6">
          Book Now
        </MainAction>
      )
    )
    expect(html).toBe(
      renderToStaticMarkup(
        <ScButton fullWidth={false} className="px-8">
          Book Now
        </ScButton>
      )
    )
  })
})

describe('MainAction with the Home hub on', () => {
  test('is the hero pill, its label lifted above the shine, with the ↗', () => {
    const html = withHub('on', () => pay())
    expect(html).toContain('cta-hero')
    expect(html).not.toContain('bg-brand-red')
    // Today's sizing is not carried onto the pill, which brings its own.
    expect(html).not.toContain('py-4')
    expect(html).toMatch(/^<button[^>]*><span>Pay <span[^>]*>₹499<\/span><\/span><i data-icon="arrow"><\/i><\/button>$/)
  })

  test("is today's button while it is not the action yet (checkout's next step)", () => {
    const html = withHub('on', () => pay({ hero: false }))
    expect(html).not.toContain('cta-hero')
    expect(html).toBe(withHub(undefined, () => pay()))
  })

  test('stays a real, disableable button', () => {
    const html = withHub('on', () => pay({ disabled: true }))
    expect(html).toMatch(/^<button[^>]* disabled=""/)
  })
})
