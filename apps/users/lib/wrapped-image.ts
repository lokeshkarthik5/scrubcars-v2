/**
 * Detlio Wrapped's shared images (0054), drawn on the customer's phone: a
 * 1080×1920 canvas per card, then the Web Share API (a file), or a download
 * where sharing files is not supported. No server renders anything and no
 * outside service sees the image. What is drawn is exactly the card's own
 * words (packages/core/src/wrapped.ts: the first name only when the customer
 * leaves it on, garage names, figures), the customer's level, the Detlio
 * wordmark, the coupé and "Book on detlio.com" on a red pill, so the image
 * reads as Detlio's at a glance wherever it is shared.
 */
import { WRAPPED_SHARE_LINE, type WrappedCard, type WrappedCardKey } from '@repo/core/wrapped'
import {
  CAR_BODY,
  CAR_GLASS,
  CAR_HEADLIGHT,
  CAR_ROOFLINE,
  CAR_SHOULDER,
  CAR_TAILLIGHT,
  CAR_VIEWBOX,
  CAR_WHEELS,
} from './car-silhouette'

export const WRAPPED_IMAGE = { width: 1080, height: 1920 } as const

/** Each card's colours, for the screen and the image alike. Never red: Detlio's red is for buttons. */
export const WRAPPED_THEMES: Record<WrappedCardKey, { from: string; to: string; glow: string }> = {
  washes: { from: '#1B2233', to: '#0A0A0B', glow: 'rgba(125, 183, 255, 0.35)' },
  saved: { from: '#13261F', to: '#0A0A0B', glow: 'rgba(74, 222, 128, 0.30)' },
  garage: { from: '#2A1F14', to: '#0A0A0B', glow: 'rgba(251, 191, 36, 0.30)' },
  month: { from: '#1E1830', to: '#0A0A0B', glow: 'rgba(165, 180, 252, 0.34)' },
  level: { from: '#22232A', to: '#0A0A0B', glow: 'rgba(220, 225, 236, 0.32)' },
  shine: { from: '#102628', to: '#0A0A0B', glow: 'rgba(45, 212, 191, 0.32)' },
  closing: { from: '#1C1C22', to: '#0A0A0B', glow: 'rgba(236, 240, 250, 0.26)' },
}

/** Each level's metal, for its medal and pill: never red. */
export function levelMetal(level: string): { base: string; light: string; dark: string; glow: string; ink: string } {
  switch (level) {
    case 'gold':
      return { base: '#E3B652', light: '#FBE7A6', dark: '#8F641F', glow: 'rgba(227, 182, 82, 0.45)', ink: '#3A2606' }
    case 'platinum':
      return { base: '#C4D2E2', light: '#F4F8FC', dark: '#7D8CA0', glow: 'rgba(196, 215, 235, 0.45)', ink: '#1C2633' }
    case 'diamond':
      return { base: '#9CCBF5', light: '#EAF6FF', dark: '#4E7FAE', glow: 'rgba(165, 210, 255, 0.5)', ink: '#0E2236' }
    case 'icon':
      return { base: '#E9D29A', light: '#FFF6DC', dark: '#9A7B3A', glow: 'rgba(240, 220, 170, 0.5)', ink: '#33260A' }
    default:
      return { base: '#C9CDD6', light: '#F4F5F8', dark: '#7D828E', glow: 'rgba(220, 225, 236, 0.4)', ink: '#16171C' }
  }
}

/**
 * A card's big line split for display: a leading figure ("18", "₹1,240",
 * "112") drawn huge with its unit under it ("washes", "days"); anything
 * else (a garage's name, "July", "Gold") stays whole.
 */
export function splitBig(big: string): { figure: string; unit: string } | null {
  const match = /^(₹?\d[\d,]*)(?:\s+(.+))?$/.exec(big.trim())
  return match ? { figure: match[1], unit: match[2] ?? '' } : null
}

/** The CSS background of a card on screen, matching the image. */
export function wrappedBackground(key: WrappedCardKey): string {
  const t = WRAPPED_THEMES[key]
  return `radial-gradient(90% 55% at 80% 18%, ${t.glow}, transparent 70%), linear-gradient(170deg, ${t.from} 0%, ${t.to} 78%)`
}

function fontFamilies(): { text: string; figures: string } {
  if (typeof window === 'undefined') return { text: 'system-ui, sans-serif', figures: 'system-ui, sans-serif' }
  const style = getComputedStyle(document.body)
  const text = style.fontFamily || 'system-ui, sans-serif'
  const grotesk = style.getPropertyValue('--font-space-grotesk').trim()
  return { text, figures: grotesk ? `${grotesk}, ${text}` : text }
}

/** Lines of `text` no wider than `max` at the current font, at most `limit` (the last one cut with "…"). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, limit: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= max || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= limit) return lines
  const kept = lines.slice(0, limit)
  let last = kept[limit - 1]
  while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1)
  kept[limit - 1] = `${last}…`
  return kept
}

/** The largest font size (down to `min`) at which `text` fits `lines` lines of `max` px. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, max: number, lines: number, start: number, min: number): number {
  for (let size = start; size > min; size -= 6) {
    ctx.font = font(size)
    if (wrap(ctx, text, max, 99).length <= lines) return size
  }
  return min
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = '/detlio-logo.png'
  })
}

/** Where the card sits in its set, and the customer's level (its name only). */
export interface WrappedImageContext {
  year: number
  index: number
  total: number
  level?: { key: string; label: string } | null
}

/**
 * Draws one card at 1080×1920. Async only for the fonts and the wordmark
 * (same-origin, so the canvas stays exportable).
 */
export async function drawWrappedCard(
  canvas: HTMLCanvasElement,
  card: WrappedCard,
  context: WrappedImageContext
): Promise<void> {
  const { width: W, height: H } = WRAPPED_IMAGE
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  try {
    await document.fonts?.ready
  } catch {
    // Fonts not ready: the system font draws the same words.
  }
  const fonts = fontFamilies()
  const theme = WRAPPED_THEMES[card.key]

  // Background: the card's gradient and its glow.
  const base = ctx.createLinearGradient(0, 0, W * 0.35, H)
  base.addColorStop(0, theme.from)
  base.addColorStop(0.78, theme.to)
  base.addColorStop(1, theme.to)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.18, 0, W * 0.8, H * 0.18, W * 0.95)
  glow.addColorStop(0, theme.glow)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  // A fine sheen, like the Shine Card.
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 2
  for (let x = -H; x < W; x += 28) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + H * 0.6, H)
    ctx.stroke()
  }

  const left = 96
  const max = W - left * 2

  // Top: the wordmark and the year.
  const logo = await loadLogo()
  if (logo) {
    const h = 72
    ctx.drawImage(logo, left, 112, (logo.width / logo.height) * h, h)
  } else {
    ctx.fillStyle = '#FAFAFA'
    ctx.font = `700 64px ${fonts.text}`
    ctx.textBaseline = 'top'
    ctx.fillText('Detlio', left, 112)
  }
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(250,250,250,0.78)'
  ctx.font = `600 38px ${fonts.figures}`
  ctx.fillText(`WRAPPED ${context.year}`, W - left, 168)
  ctx.textAlign = 'left'

  // The customer's level, as a metal pill.
  let y = 300
  if (context.level) {
    const metal = levelMetal(context.level.key)
    const label = `${context.level.label} level`
    ctx.font = `700 38px ${fonts.text}`
    const textW = ctx.measureText(label.toUpperCase()).width + label.length * 4
    const pillW = textW + 150
    const pillH = 84
    const pill = ctx.createLinearGradient(left, y, left + pillW, y + pillH)
    pill.addColorStop(0, metal.light)
    pill.addColorStop(0.5, metal.base)
    pill.addColorStop(1, metal.dark)
    ctx.fillStyle = pill
    roundRect(ctx, left, y, pillW, pillH, pillH / 2)
    ctx.fill()
    star(ctx, left + 52, y + pillH / 2, 20, metal.ink)
    ctx.fillStyle = metal.ink
    ctx.textBaseline = 'middle'
    drawTracked(ctx, label.toUpperCase(), left + 92, y + pillH / 2 + 2, 4)
    ctx.textBaseline = 'alphabetic'
  }

  // The eyebrow, with a short red rule: Detlio's accent.
  y = 560
  ctx.fillStyle = '#E4002B'
  roundRect(ctx, left, y - 40, 72, 10, 5)
  ctx.fill()
  y += 34
  ctx.fillStyle = 'rgba(250,250,250,0.78)'
  ctx.font = `500 48px ${fonts.text}`
  for (const line of wrap(ctx, card.eyebrow, max, 2)) {
    ctx.fillText(line, left, y)
    y += 62
  }

  // The big figure (huge, its unit under it) or the big name.
  const split = splitBig(card.big)
  ctx.fillStyle = '#FFFFFF'
  if (split) {
    const size = fitSize(ctx, split.figure, (s) => `700 ${s}px ${fonts.figures}`, max, 1, 330, 160)
    ctx.font = `700 ${size}px ${fonts.figures}`
    y += size * 0.86
    ctx.fillText(split.figure, left - size * 0.04, y)
    if (split.unit) {
      y += 96
      ctx.font = `600 84px ${fonts.text}`
      ctx.fillText(split.unit, left, y)
    }
  } else {
    const bigFont = (s: number) => `700 ${s}px ${fonts.figures}`
    const size = fitSize(ctx, card.big, bigFont, max, 2, 168, 96)
    ctx.font = bigFont(size)
    y += 30
    for (const line of wrap(ctx, card.big, max, 2)) {
      y += size
      ctx.fillText(line, left, y)
      y += size * 0.1
    }
  }
  y += 78
  ctx.font = `400 46px ${fonts.text}`
  ctx.fillStyle = 'rgba(250,250,250,0.86)'
  for (const line of wrap(ctx, card.caption, max, 2)) {
    ctx.fillText(line, left, y)
    y += 60
  }
  if (card.extra.length > 0) {
    y += 10
    ctx.font = `500 40px ${fonts.text}`
    ctx.fillStyle = 'rgba(250,250,250,0.72)'
    ctx.fillText(card.extra.slice(0, 3).join(' · '), left, y)
  }

  // The coupé, lit by the card's glow, above the call to action.
  const carW = 940
  const carH = (carW / CAR_VIEWBOX.width) * CAR_VIEWBOX.height
  drawCar(ctx, (W - carW) / 2 + 40, H - 300 - 70 - carH, carW, theme.glow)

  // Bottom: the red pill every image carries, like the app's own button.
  const pillY = H - 300
  const pillH = 150
  const cta = ctx.createLinearGradient(left, 0, W - left, 0)
  cta.addColorStop(0, '#E4002B')
  cta.addColorStop(0.66, '#CA0026')
  cta.addColorStop(1, '#B80022')
  ctx.fillStyle = cta
  roundRect(ctx, left, pillY, W - left * 2, pillH, pillH / 2)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `600 54px ${fonts.text}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(`${WRAPPED_SHARE_LINE}  ↗`, W / 2, pillY + pillH / 2 + 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Where the card is in its set, small, under the pill.
  const dotsW = (context.total - 1) * 30
  for (let i = 0; i < context.total; i += 1) {
    ctx.fillStyle = i === context.index ? 'rgba(250,250,250,0.85)' : 'rgba(250,250,250,0.22)'
    ctx.beginPath()
    ctx.arc(W / 2 - dotsW / 2 + i * 30, H - 84, 7, 0, Math.PI * 2)
    ctx.fill()
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? r : r * 0.45
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

/** Letter-spaced text (canvas letterSpacing is not everywhere yet). */
function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let at = x
  for (const ch of text) {
    ctx.fillText(ch, at, y)
    at += ctx.measureText(ch).width + spacing
  }
}

/** The coupé (lib/car-silhouette.ts) at x, y, w wide, on a pool of the card's light. */
function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, glow: string) {
  const scale = w / CAR_VIEWBOX.width
  ctx.save()
  // The floor light under it.
  const floorY = y + 172 * scale
  const pool = ctx.createRadialGradient(x + w / 2, floorY, 0, x + w / 2, floorY, w * 0.55)
  pool.addColorStop(0, glow)
  pool.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = pool
  ctx.save()
  ctx.translate(x + w / 2, floorY)
  ctx.scale(1, 0.09)
  ctx.translate(-(x + w / 2), -floorY)
  ctx.fillRect(x - w * 0.1, floorY - w * 0.6, w * 1.2, w * 1.2)
  ctx.restore()

  ctx.translate(x, y)
  ctx.scale(scale, scale)
  const body = ctx.createLinearGradient(0, 0, 0, CAR_VIEWBOX.height)
  body.addColorStop(0, '#5A5B66')
  body.addColorStop(1, '#0D0D10')
  ctx.fillStyle = body
  ctx.fill(new Path2D(CAR_BODY))
  ctx.fillStyle = '#08090C'
  ctx.fill(new Path2D(CAR_GLASS))
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 2.2
  ctx.stroke(new Path2D(CAR_ROOFLINE))
  ctx.strokeStyle = 'rgba(255,255,255,0.42)'
  ctx.lineWidth = 1.4
  ctx.stroke(new Path2D(CAR_SHOULDER))
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fill(new Path2D(CAR_HEADLIGHT))
  ctx.fillStyle = '#E4002B'
  ctx.fill(new Path2D(CAR_TAILLIGHT))
  for (const wheel of CAR_WHEELS) {
    ctx.fillStyle = '#060607'
    ctx.beginPath()
    ctx.arc(wheel.cx, wheel.cy, wheel.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(220,225,236,0.75)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(wheel.cx, wheel.cy, wheel.r * 0.66, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(220,225,236,0.75)'
    ctx.beginPath()
    ctx.arc(wheel.cx, wheel.cy, wheel.r * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Draws the card and shares it as a PNG file through the phone's share
 * sheet; where files cannot be shared (most desktops), downloads it.
 */
export async function shareWrappedCard(card: WrappedCard, context: WrappedImageContext): Promise<ShareOutcome> {
  const canvas = document.createElement('canvas')
  await drawWrappedCard(canvas, card, context)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error("Couldn't make the image")
  const name = `detlio-wrapped-${context.year}-${card.key}.png`
  const file = new File([blob], name, { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `My ${context.year} with Detlio`, text: WRAPPED_SHARE_LINE })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Some browsers say they can share files and then refuse: fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  return 'downloaded'
}
