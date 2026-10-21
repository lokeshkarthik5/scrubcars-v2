/**
 * Detlio Wrapped's shared images (0054), drawn on the customer's phone: a
 * 1080×1920 canvas per card, then the Web Share API (a file), or a download
 * where sharing files is not supported. No server renders anything and no
 * outside service sees the image. What is drawn is exactly the card's own
 * words (packages/core/src/wrapped.ts: the first name only when the customer
 * leaves it on, garage names, figures), the Detlio wordmark and "Book on
 * detlio.com".
 */
import { WRAPPED_SHARE_LINE, type WrappedCard, type WrappedCardKey } from '@repo/core/wrapped'

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

/**
 * Draws one card at 1080×1920. Async only for the fonts and the wordmark
 * (same-origin, so the canvas stays exportable).
 */
export async function drawWrappedCard(
  canvas: HTMLCanvasElement,
  card: WrappedCard,
  context: { year: number; index: number; total: number }
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
  ctx.strokeStyle = 'rgba(255,255,255,0.025)'
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
    const h = 64
    ctx.drawImage(logo, left, 120, (logo.width / logo.height) * h, h)
  } else {
    ctx.fillStyle = '#FAFAFA'
    ctx.font = `700 60px ${fonts.text}`
    ctx.textBaseline = 'top'
    ctx.fillText('Detlio', left, 120)
  }
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(250,250,250,0.72)'
  ctx.font = `600 40px ${fonts.figures}`
  ctx.fillText(`Wrapped ${context.year}`, W - left, 172)
  ctx.textAlign = 'left'

  // Middle: the eyebrow, the big line, the caption, any extras.
  let y = 760
  ctx.fillStyle = 'rgba(250,250,250,0.72)'
  ctx.font = `500 46px ${fonts.text}`
  for (const line of wrap(ctx, card.eyebrow, max, 2)) {
    ctx.fillText(line, left, y)
    y += 60
  }
  y += 40
  const bigFont = (size: number) => `700 ${size}px ${fonts.figures}`
  const size = fitSize(ctx, card.big, bigFont, max, 2, 168, 84)
  ctx.font = bigFont(size)
  ctx.fillStyle = '#FAFAFA'
  for (const line of wrap(ctx, card.big, max, 2)) {
    y += size
    ctx.fillText(line, left, y)
    y += size * 0.12
  }
  y += 70
  ctx.font = `400 46px ${fonts.text}`
  ctx.fillStyle = 'rgba(250,250,250,0.86)'
  for (const line of wrap(ctx, card.caption, max, 3)) {
    ctx.fillText(line, left, y)
    y += 62
  }
  if (card.extra.length > 0) {
    y += 24
    ctx.font = `500 40px ${fonts.text}`
    ctx.fillStyle = 'rgba(250,250,250,0.7)'
    for (const line of card.extra.slice(0, 3)) {
      ctx.fillText(`· ${line}`, left, y)
      y += 56
    }
  }

  // Bottom: where the story is in its set, and the line every image carries.
  const dotsY = H - 250
  for (let i = 0; i < context.total; i += 1) {
    ctx.fillStyle = i === context.index ? 'rgba(250,250,250,0.9)' : 'rgba(250,250,250,0.25)'
    ctx.beginPath()
    ctx.arc(left + 10 + i * 34, dotsY, 8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#FAFAFA'
  ctx.font = `600 52px ${fonts.text}`
  ctx.fillText(WRAPPED_SHARE_LINE, left, H - 150)
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Draws the card and shares it as a PNG file through the phone's share
 * sheet; where files cannot be shared (most desktops), downloads it.
 */
export async function shareWrappedCard(card: WrappedCard, context: { year: number; index: number; total: number }): Promise<ShareOutcome> {
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
