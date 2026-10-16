/**
 * The red call to action's gradient (the "hero" button: Home's Book a wash,
 * Pay ₹X, Add car).
 *
 * Owner decision D12: the guideline red #E4002B is the lightest stop, so white
 * text clears WCAG AA (4.5:1) everywhere on the button at rest. The old
 * #EF3240 does not (3.87:1), which is the known failure the accessibility
 * suite keeps on its report. axe cannot judge text on a gradient (it reports
 * it as "incomplete"), so cta.test.ts checks the lightest stop here, and that
 * packages/ui/styles/globals.css draws the button with exactly these stops.
 *
 * The light sweep that crosses the label twice when Home opens dips below
 * 4.5:1 for about 0.3 s each time; that is a conscious owner exception,
 * limited to this one button per screen.
 */
export const CTA_GRADIENT_STOPS = ['#E4002B', '#DA0029', '#CA0026', '#B80022'] as const

/** As globals.css writes it, stop for stop. */
export const CTA_GRADIENT =
  'linear-gradient(100deg, #E4002B 0%, #DA0029 30%, #CA0026 66%, #B80022 100%)'

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a #RRGGBB colour. */
export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) throw new Error(`Not a #RRGGBB colour: ${hex}`)
  const [r, g, b] = m.slice(1).map((part) => channel(parseInt(part, 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two #RRGGBB colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
