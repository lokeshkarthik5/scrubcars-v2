/**
 * A premium card (lib/premium-card.ts) as an Instagram image, drawn on the
 * customer's phone: a Story (1080×1920) or a Post (1080×1350), the card in
 * the middle on a backdrop of its own light, with "Book on detlio.com" on a
 * red pill under it. The card is drawn from the same numbers as the screen
 * (card units: the card is 100 wide), so the image is the card the customer
 * sees. What is drawn is only the card's own words: never a gift code, a
 * link, a voucher code or a phone number.
 */
import { cardCarSrc } from '@repo/core/card-cars'
import {
  CARD,
  CHIP_ICON_PATHS,
  CONFETTI,
  FIGURES,
  INKS,
  LOOKS,
  PHOTO,
  RIBBON,
  SHARE_FORMATS,
  SHARE_LINE,
  SPARKS,
  TIP_LABEL,
  sparkPath,
  titleSize,
  type CardChip,
  type PremiumCardSpec,
  type ShareFormat,
} from './premium-card'
import { canvasFile, fontFamilies, roundRect, shareImageFile, type ShareOutcome } from './share-image'

type Fonts = { text: string; figures: string }

const images = new Map<string, Promise<HTMLImageElement>>()

/** A same-origin picture (so the canvas stays exportable), loaded once. */
function loadImage(src: string): Promise<HTMLImageElement> {
  let pending = images.get(src)
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => {
        images.delete(src)
        reject(new Error("Couldn't load the car photo"))
      }
      img.src = src
    })
    images.set(src, pending)
  }
  return pending
}

/** Letter spacing where the browser draws it (Chrome, recent Safari); plain text elsewhere. */
function setSpacing(ctx: CanvasRenderingContext2D, em: number, size: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in c) c.letterSpacing = `${em * size}px`
}

/** Text with its figures in the numeric face: "₹2,000 of car care". */
function mixedParts(text: string): Array<{ text: string; figures: boolean }> {
  return text
    .split(FIGURES)
    .map((part, i) => ({ text: part, figures: i % 2 === 1 }))
    .filter((p) => p.text)
}

function mixedFont(fonts: Fonts, weight: number, size: number, figures: boolean): string {
  return `${weight} ${size}px ${figures ? fonts.figures : fonts.text}`
}

function measureMixed(ctx: CanvasRenderingContext2D, text: string, fonts: Fonts, weight: number, size: number): number {
  let width = 0
  for (const part of mixedParts(text)) {
    ctx.font = mixedFont(fonts, weight, size, part.figures)
    width += ctx.measureText(part.text).width
  }
  return width
}

function drawMixed(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fonts: Fonts, weight: number, size: number): number {
  let at = x
  for (const part of mixedParts(text)) {
    ctx.font = mixedFont(fonts, weight, size, part.figures)
    ctx.fillText(part.text, at, y)
    at += ctx.measureText(part.text).width
  }
  return at - x
}

/** `text` cut with "…" to `max` wide. */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, fonts: Fonts, weight: number, size: number): string {
  if (measureMixed(ctx, text, fonts, weight, size) <= max) return text
  let cut = text
  while (cut.length > 1 && measureMixed(ctx, `${cut}…`, fonts, weight, size) > max) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

/** A radial light stretched to an ellipse (rx × ry) at cx, cy. */
function ellipseLight(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, fadeAt = 0.72) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  // Fade to the same colour, clear: a canvas fades through grey otherwise.
  const clear = color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgba($1,$2,$3,0)')
  g.addColorStop(0, color)
  g.addColorStop(fadeAt, clear)
  g.addColorStop(1, clear)
  ctx.fillStyle = g
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2)
  ctx.restore()
}

/** "50% 40%" as fractions, for placing a photo like CSS object-position. */
function positionOf(position: string): [number, number] {
  const [x, y] = position.split(/\s+/).map((part) => Number.parseFloat(part) / 100)
  return [Number.isFinite(x) ? x : 0.5, Number.isFinite(y) ? y : 0.5]
}

/**
 * Draws the card at x, y, `width` px wide, in card units throughout (the
 * same numbers as the CSS: components/premium-card).
 */
export async function drawPremiumCard(ctx: CanvasRenderingContext2D, spec: PremiumCardSpec, x: number, y: number, width: number, fonts: Fonts): Promise<void> {
  const look = LOOKS[spec.look]
  const ink = INKS[look.tone]
  // The shared image is large: the 1600 px photo.
  const photo = await loadImage(cardCarSrc(spec.car, 1600))
  const u = width / 100
  const H = CARD.height

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(u, u)
  roundRect(ctx, 0, 0, 100, H, CARD.radius)
  ctx.clip()

  // The ground, the light behind the car and the occasion's glow.
  const ground = ctx.createLinearGradient(0, 0, 0, H)
  ground.addColorStop(0, look.ground[0])
  ground.addColorStop(0.52, look.ground[1])
  ground.addColorStop(1, look.ground[2])
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, 100, H)
  ellipseLight(ctx, 50, 40, 80, 50, look.light)
  if (look.glow) ellipseLight(ctx, look.glow.x, look.glow.y, 55, 45, look.glow.color, 0.7)

  // The photo, on its own canvas so its tint and its fade are its alone:
  // placed like CSS object-fit: cover at the car's position, the look's
  // tint in soft light, then faded into the ground.
  const photoH = PHOTO.height
  const off = document.createElement('canvas')
  off.width = Math.ceil(100 * u)
  off.height = Math.ceil(photoH * u)
  const octx = off.getContext('2d')
  if (octx) {
    octx.scale(u, u)
    const scale = Math.max(100 / photo.naturalWidth, photoH / photo.naturalHeight)
    const dw = photo.naturalWidth * scale
    const dh = photo.naturalHeight * scale
    const [px, py] = positionOf(spec.car.position)
    octx.imageSmoothingQuality = 'high'
    octx.drawImage(photo, (100 - dw) * px, (photoH - dh) * py, dw, dh)
    if (look.tint) {
      octx.globalCompositeOperation = 'soft-light'
      octx.fillStyle = look.tint
      octx.fillRect(0, 0, 100, photoH)
    }
    octx.globalCompositeOperation = 'destination-in'
    const fade = octx.createLinearGradient(0, 0, 0, photoH)
    for (const [at, a] of PHOTO.fade) fade.addColorStop(at, `rgba(0,0,0,${a})`)
    octx.fillStyle = fade
    octx.fillRect(0, 0, 100, photoH)
    ctx.drawImage(off, 0, 0, 100, photoH)
  }

  // The wash behind the wordmark.
  ellipseLight(ctx, PHOTO.wash.x, PHOTO.wash.y, PHOTO.wash.rx, PHOTO.wash.ry, look.wash, 1)

  // Confetti, sparks and the ribbon, over the photo.
  if (look.accent === 'confetti') {
    for (const p of CONFETTI) {
      ctx.fillStyle = p.c
      if (p.w === p.h) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.r * Math.PI) / 180)
        roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 0.4)
        ctx.fill()
        ctx.restore()
      }
    }
  }
  if (look.accent === 'sparks') {
    ctx.fillStyle = look.spark ?? (look.tone === 'night' ? '#DCE1EC' : '#D9A441')
    for (const s of SPARKS) {
      ctx.globalAlpha = s.o
      ctx.fill(new Path2D(sparkPath(s.x, s.y, s.s)))
    }
    ctx.globalAlpha = 1
  }

  if (look.accent === 'ribbon') {
    ctx.save()
    ctx.translate(0.5, 0.9)
    ctx.fillStyle = 'rgba(20,24,30,0.16)'
    ctx.fill(new Path2D(RIBBON.band))
    for (const d of RIBBON.bow) ctx.fill(new Path2D(d))
    ctx.restore()
    const satin = (from: [number, number], to: [number, number]) => {
      const g = ctx.createLinearGradient(from[0], from[1], to[0], to[1])
      for (const [at, c] of RIBBON.stops) g.addColorStop(at, c)
      return g
    }
    ctx.fillStyle = satin(RIBBON.across.from, RIBBON.across.to)
    ctx.fill(new Path2D(RIBBON.band))
    ctx.fillStyle = satin(RIBBON.bowLight.from, RIBBON.bowLight.to)
    for (const d of RIBBON.bow) ctx.fill(new Path2D(d))
    ctx.beginPath()
    ctx.arc(RIBBON.knot.x, RIBBON.knot.y, RIBBON.knot.r, 0, Math.PI * 2)
    ctx.fillStyle = '#E9EDF1'
    ctx.fill()
    ctx.lineWidth = 0.3
    ctx.strokeStyle = '#9AA4AE'
    ctx.stroke()
  }

  // The wordmark, its period in Detlio red.
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const mark = CARD.mark
  ctx.font = `600 ${mark.size}px ${fonts.text}`
  setSpacing(ctx, -0.02, mark.size)
  ctx.fillStyle = ink.mark
  ctx.fillText('Detlio', mark.x, mark.y)
  const markW = ctx.measureText('Detlio').width
  ctx.fillStyle = '#E4002B'
  ctx.fillText('.', mark.x + markW, mark.y)
  setSpacing(ctx, 0, mark.size)

  // The chips, the name giving way first when the row is long.
  const c = CARD.chips
  const maxRow = 100 - CARD.pad * 2
  const chipWidth = (chip: CardChip, text: string) => c.padX * 2 + c.icon + c.iconGap + measureMixed(ctx, text, fonts, 500, c.font)
  const texts = spec.chips.map((chip) => chip.text)
  const rowWidth = () => spec.chips.reduce((sum, chip, i) => sum + chipWidth(chip, texts[i]), 0) + c.gap * (spec.chips.length - 1)
  const fluid = spec.chips.findIndex((chip) => chip.fluid)
  if (rowWidth() > maxRow) {
    const index = fluid >= 0 ? fluid : texts.reduce((best, t, i) => (t.length > texts[best].length ? i : best), 0)
    const others = rowWidth() - chipWidth(spec.chips[index], texts[index])
    const room = maxRow - others - c.padX * 2 - c.icon - c.iconGap
    texts[index] = fitText(ctx, texts[index], Math.max(4, room), fonts, 500, c.font)
  }
  let cx = CARD.pad
  spec.chips.forEach((chip, i) => {
    const w = Math.min(chipWidth(chip, texts[i]), CARD.pad + maxRow - cx)
    if (w <= c.padX * 2) return
    roundRect(ctx, cx, c.top, w, c.height, c.height / 2)
    ctx.fillStyle = ink.chipBg
    ctx.fill()
    ctx.lineWidth = 0.28
    ctx.strokeStyle = ink.chipEdge
    roundRect(ctx, cx + 0.14, c.top + 0.14, w - 0.28, c.height - 0.28, (c.height - 0.28) / 2)
    ctx.stroke()
    // The icon: Tabler's 24-unit paths, stroked at 2.
    ctx.save()
    ctx.translate(cx + c.padX, c.top + (c.height - c.icon) / 2)
    ctx.scale(c.icon / 24, c.icon / 24)
    ctx.strokeStyle = ink.chipIcon
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const d of CHIP_ICON_PATHS[chip.icon]) ctx.stroke(new Path2D(d))
    ctx.restore()
    ctx.fillStyle = ink.chipText
    drawMixed(ctx, texts[i], cx + c.padX + c.icon + c.iconGap, c.top + c.height / 2 + 0.1, fonts, 500, c.font)
    cx += w + c.gap
  })

  // The title: ink, then grey; each line on one line.
  const t = CARD.title
  spec.title.forEach((line, i) => {
    let size = titleSize(line)
    while (size > 4 && measureMixed(ctx, line, fonts, 700, size) > t.maxWidth) size -= 0.2
    setSpacing(ctx, -0.035, size)
    ctx.fillStyle = i === 0 ? ink.title : ink.sub
    drawMixed(ctx, fitText(ctx, line, t.maxWidth, fonts, 700, size), CARD.pad, t.top + t.line * i + t.line / 2, fonts, 700, size)
    setSpacing(ctx, 0, size)
  })

  // The tip: its label in bold, then the words, at most three lines.
  const tip = CARD.tip
  ctx.font = `600 ${tip.size}px ${fonts.text}`
  const labelW = ctx.measureText(`${TIP_LABEL} `).width
  ctx.fillStyle = ink.label
  ctx.fillText(TIP_LABEL, CARD.pad, tip.top + tip.line / 2)
  ctx.font = `400 ${tip.size}px ${fonts.text}`
  const words = spec.tip.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const room = lines.length === 0 ? maxRow - labelW : maxRow
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= room || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > tip.lines) {
    lines.length = tip.lines
    let last = lines[tip.lines - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxRow) last = last.slice(0, -1)
    lines[tip.lines - 1] = `${last}…`
  }
  ctx.fillStyle = ink.tip
  lines.forEach((text, i) => ctx.fillText(text, CARD.pad + (i === 0 ? labelW : 0), tip.top + tip.line * i + tip.line / 2))

  ctx.restore()

  // The card's own edge.
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(u, u)
  roundRect(ctx, 0.14, 0.14, 99.72, H - 0.28, CARD.radius)
  ctx.lineWidth = 0.28
  ctx.strokeStyle = look.tone === 'night' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)'
  ctx.stroke()
  ctx.restore()
}

/** The image's layout: the card's width and top, and the pill's. */
const LAYOUT: Record<ShareFormat, { card: number; top: number; pillGap: number; pillH: number; pillFont: number }> = {
  story: { card: 860, top: 300, pillGap: 72, pillH: 124, pillFont: 46 },
  post: { card: 740, top: 84, pillGap: 52, pillH: 104, pillFont: 40 },
}

/** Draws the whole image: backdrop, card, "Book on detlio.com". */
export async function drawShareImage(canvas: HTMLCanvasElement, spec: PremiumCardSpec, format: ShareFormat): Promise<void> {
  const { width: W, height: H } = SHARE_FORMATS[format]
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
  const look = LOOKS[spec.look]
  const layout = LAYOUT[format]

  // The backdrop: the card's own light, wider.
  const back = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.hypot(W, H) * 0.62)
  back.addColorStop(0, look.backdrop[0])
  back.addColorStop(1, look.backdrop[1])
  ctx.fillStyle = back
  ctx.fillRect(0, 0, W, H)

  const cardW = layout.card
  const cardH = (cardW / 100) * CARD.height
  const x = (W - cardW) / 2
  const y = layout.top

  // A soft shadow lifting the card off the backdrop.
  ctx.save()
  ctx.shadowColor = look.tone === 'night' ? 'rgba(0,0,0,0.6)' : 'rgba(30,34,44,0.28)'
  ctx.shadowBlur = 90
  ctx.shadowOffsetY = 36
  roundRect(ctx, x, y, cardW, cardH, (cardW / 100) * CARD.radius)
  ctx.fillStyle = look.ground[1]
  ctx.fill()
  ctx.restore()

  await drawPremiumCard(ctx, spec, x, y, cardW, fonts)

  // "Book on detlio.com": the red pill every Detlio image carries.
  ctx.font = `600 ${layout.pillFont}px ${fonts.text}`
  const label = `${SHARE_LINE}  ↗`
  const pillW = ctx.measureText(label).width + layout.pillH * 1.1
  const pillX = (W - pillW) / 2
  const pillY = y + cardH + layout.pillGap
  const cta = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0)
  cta.addColorStop(0, '#E4002B')
  cta.addColorStop(0.66, '#CA0026')
  cta.addColorStop(1, '#B80022')
  ctx.fillStyle = cta
  roundRect(ctx, pillX, pillY, pillW, layout.pillH, layout.pillH / 2)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, W / 2, pillY + layout.pillH / 2 + 2)
  ctx.textAlign = 'left'
}

/** Draws the image and shares it (or downloads it where files can't be shared). */
export async function sharePremiumCard(spec: PremiumCardSpec, format: ShareFormat, name: string): Promise<ShareOutcome> {
  const canvas = document.createElement('canvas')
  await drawShareImage(canvas, spec, format)
  const file = await canvasFile(canvas, `${name}-${format}.png`)
  return shareImageFile(file, { title: 'Detlio', text: SHARE_LINE })
}
