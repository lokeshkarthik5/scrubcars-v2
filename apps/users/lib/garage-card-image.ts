/**
 * A Detlio Garage card (0057) as an Instagram picture, drawn on the
 * customer's phone: a Story (1080×1920) or a Post (1080×1350), the card in
 * the middle on a backdrop lit in its rarity's colour, "Collected on Detlio"
 * above it and "Book on detlio.com" on the red pill under it. Drawn from the
 * same numbers as the screen (lib/garage-card.ts, card units: the card is
 * 100 wide). Only the card's own words go in it, and the sharer's first name
 * when they tick it: never a phone, a booking or a code. The car is the
 * card's fictional one (its drawn picture, or the team's art of it).
 */
import type { GarageOwnedCar } from '@repo/core/api/garage'
import { garageCarDataUrl } from '@repo/core/garage-art'
import { cardNumber, copiesLabel, RARITY_LOOKS } from '@repo/core/garage'
import { SHARE_FORMATS, type ShareFormat } from './premium-card'
import { carArtSrc, GARAGE_CARD as C, GARAGE_SHARE, TONE_LOOKS } from './garage-card'
import { canvasFile, fontFamilies, roundRect, shareImageFile, type ShareOutcome } from './share-image'

type Fonts = { text: string; figures: string }

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (cors) img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Couldn't load the car picture"))
    img.src = src
  })
}

/** The card's picture: the team's art (served for canvas use), else the drawn one, which always loads. */
async function carPicture(car: GarageOwnedCar): Promise<{ img: HTMLImageElement; photo: boolean }> {
  const src = carArtSrc(car)
  if (car.art.url) {
    try {
      return { img: await loadImage(src, true), photo: true }
    } catch {
      // A bucket without CORS for canvases: the drawn picture of the same car instead.
    }
  }
  const drawn = garageCarDataUrl({ number: car.number, series: car.series, paint: car.paint, tone: car.tone, rarity: car.rarity })
  return { img: await loadImage(drawn, false), photo: false }
}

/** Text with its figures in the numeric face. */
function drawMixed(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fonts: Fonts, weight: number, size: number) {
  let at = x
  text.split(/(\d[\d.,–]*)/).forEach((part, i) => {
    if (!part) return
    ctx.font = `${weight} ${size}px ${i % 2 === 1 ? fonts.figures : fonts.text}`
    ctx.fillText(part, at, y)
    at += ctx.measureText(part).width
  })
  return at - x
}

function measureMixed(ctx: CanvasRenderingContext2D, text: string, fonts: Fonts, weight: number, size: number) {
  let width = 0
  text.split(/(\d[\d.,–]*)/).forEach((part, i) => {
    if (!part) return
    ctx.font = `${weight} ${size}px ${i % 2 === 1 ? fonts.figures : fonts.text}`
    width += ctx.measureText(part).width
  })
  return width
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const words = text.split(' ')
  const out: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= max) line = next
    else {
      out.push(line)
      line = word
      if (out.length === lines) break
    }
  }
  if (out.length < lines && line) out.push(line)
  return out.slice(0, lines)
}

/** Draws the card at x, y, `width` px wide, in card units throughout (the CSS's numbers). */
export async function drawGarageCard(ctx: CanvasRenderingContext2D, car: GarageOwnedCar, x: number, y: number, width: number, fonts: Fonts) {
  const { img, photo } = await carPicture(car)
  const u = width / 100
  const tone = TONE_LOOKS[car.tone]
  const look = RARITY_LOOKS[car.rarity]
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(u, u)

  // The frame's metal.
  const metal = ctx.createLinearGradient(0, 0, 100, C.height)
  const [m0, m1, m2, m3] = look.metal
  metal.addColorStop(0, m0)
  metal.addColorStop(0.28, m1)
  metal.addColorStop(0.52, m2)
  metal.addColorStop(0.78, m3)
  metal.addColorStop(1, m1)
  roundRect(ctx, 0, 0, 100, C.height, C.radius)
  ctx.fillStyle = metal
  ctx.fill()

  // The face: ground, studio light, floor.
  const f = C.frame
  const fw = 100 - f * 2
  const fh = C.height - f * 2
  ctx.save()
  ctx.translate(f, f)
  roundRect(ctx, 0, 0, fw, fh, C.radius - 1.4)
  ctx.clip()
  const ground = ctx.createLinearGradient(0, 0, 0, fh)
  ground.addColorStop(0, tone.ground[0])
  ground.addColorStop(0.48, tone.ground[1])
  ground.addColorStop(1, tone.ground[2])
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, fw, fh)
  ctx.save()
  ctx.translate(fw / 2, 38)
  ctx.scale(1, 34 / 70)
  const light = ctx.createRadialGradient(0, 0, 0, 0, 0, 70)
  light.addColorStop(0, tone.light)
  light.addColorStop(0.72, 'rgba(0,0,0,0)')
  ctx.fillStyle = light
  ctx.fillRect(-70, -70, 140, 140)
  ctx.restore()

  // The car.
  if (photo) {
    ctx.drawImage(img, 0, 11 - f, fw, 50)
  } else {
    const artW = C.art.width
    ctx.drawImage(img, C.art.left - f, C.art.top - f, artW, artW / C.art.aspect)
  }

  const L = C.pad - f
  ctx.textBaseline = 'alphabetic'
  // Wordmark and number.
  ctx.fillStyle = tone.ink
  ctx.font = `600 3.4px ${fonts.text}`
  ctx.fillText('Detlio', L, 8.4)
  const markW = ctx.measureText('Detlio').width
  ctx.fillStyle = '#E4002B'
  ctx.fillText('.', L + markW, 8.4)
  ctx.fillStyle = tone.sub
  ctx.font = `500 3.4px ${fonts.text}`
  ctx.fillText(' Garage', L + markW + ctx.measureText('.').width, 8.4)
  ctx.font = `600 3.4px ${fonts.figures}`
  ctx.textAlign = 'right'
  ctx.fillText(cardNumber(car.number, car.total), fw - L, 8.4)
  ctx.textAlign = 'left'

  // The rarity pill.
  ctx.font = `700 2.6px ${fonts.text}`
  const pillText = car.rarityLabel.toUpperCase()
  const spacing = 0.31
  let pillTextW = 0
  for (const ch of pillText) pillTextW += ctx.measureText(ch).width + spacing
  const pillW = pillTextW + 4.8
  roundRect(ctx, L, C.pill.top - f, pillW, C.pill.height, C.pill.height / 2)
  ctx.fillStyle = look.pill
  ctx.fill()
  ctx.fillStyle = look.ink
  let cx = L + 2.4
  for (const ch of pillText) {
    ctx.fillText(ch, cx, C.pill.top - f + 3.75)
    cx += ctx.measureText(ch).width + spacing
  }
  const copies = copiesLabel(car.count)
  if (copies) {
    ctx.fillStyle = tone.sub
    ctx.font = `600 3px ${fonts.figures}`
    ctx.fillText(copies, L + pillW + 1.6, C.pill.top - f + 4)
  }

  // The name.
  ctx.fillStyle = tone.ink
  ctx.font = `700 ${C.name.size}px ${fonts.text}`
  ctx.fillText(car.name, L, C.name.top - f + 7.4, fw - L * 2)

  // The chips, wrapping onto a second row.
  let chipX = L
  let chipY = C.chips.top - f
  for (const stat of car.stats) {
    const w = measureMixed(ctx, stat, fonts, 500, C.chips.size) + 4.4
    if (chipX + w > fw - L) {
      chipX = L
      chipY += C.chips.row
    }
    roundRect(ctx, chipX, chipY, w, C.chips.height, C.chips.height / 2)
    ctx.fillStyle = tone.chipBg
    ctx.fill()
    ctx.strokeStyle = tone.chipEdge
    ctx.lineWidth = 0.28
    ctx.stroke()
    ctx.fillStyle = tone.chipText
    drawMixed(ctx, stat, chipX + 2.2, chipY + 4.25, fonts, 500, C.chips.size)
    chipX += w + C.chips.gap
  }

  // The line, in italics.
  ctx.fillStyle = tone.sub
  ctx.font = `italic 400 ${C.lore.size}px ${fonts.text}`
  wrap(ctx, car.lore, fw - L * 2, C.lore.lines).forEach((line, i) => ctx.fillText(line, L, C.lore.top - f + 3.4 + i * C.lore.line))

  // The foot.
  ctx.fillStyle = tone.muted
  ctx.font = `500 ${C.foot.size}px ${fonts.text}`
  ctx.fillText(`SERIES ${car.series} · DETLIO GARAGE`, L, C.foot.top - f + 2)
  ctx.restore()
  ctx.restore()
}

const LAYOUT: Record<ShareFormat, { card: number; top: number; heading: number; pillGap: number; pillH: number; pillFont: number }> = {
  story: { card: 760, top: 400, heading: 250, pillGap: 92, pillH: 96, pillFont: 38 },
  post: { card: 640, top: 210, heading: 120, pillGap: 54, pillH: 84, pillFont: 34 },
}

/** The whole picture: backdrop, "Collected on Detlio", the card, the pill. */
export async function drawGarageShareImage(canvas: HTMLCanvasElement, car: GarageOwnedCar, format: ShareFormat, firstName: string | null) {
  const { width: W, height: H } = SHARE_FORMATS[format]
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  try {
    await document.fonts?.ready
  } catch {
    // The system font draws the same words.
  }
  const fonts = fontFamilies()
  const layout = LAYOUT[format]
  const look = RARITY_LOOKS[car.rarity]

  const back = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.6)
  back.addColorStop(0, '#22242B')
  back.addColorStop(1, '#050506')
  ctx.fillStyle = back
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, layout.top + layout.card * 0.6, 0, W / 2, layout.top + layout.card * 0.6, layout.card * 0.95)
  glow.addColorStop(0, look.glow)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Epic and Legendary: rays of their colour behind the card, like the reveal's burst.
  if (car.rarity === 'epic' || car.rarity === 'legendary') {
    const cx = W / 2
    const cy = layout.top + layout.card * 0.62
    ctx.save()
    ctx.globalAlpha = car.rarity === 'legendary' ? 0.5 : 0.32
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2
      const ray = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * W * 0.75, cy + Math.sin(a) * W * 0.75)
      ray.addColorStop(0, look.glow)
      ray.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = ray
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, W * 0.75, a - 0.035, a + 0.035)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  // The heading.
  ctx.textAlign = 'center'
  ctx.fillStyle = '#9EA3AD'
  ctx.font = `600 ${format === 'story' ? 30 : 26}px ${fonts.text}`
  const kicker = firstName ? `${firstName}’s Garage · ${car.rarityLabel}` : `Detlio Garage · ${car.rarityLabel}`
  ctx.fillText(kicker.toUpperCase(), W / 2, layout.heading - 70)
  ctx.fillStyle = '#F5F6F8'
  ctx.font = `700 ${format === 'story' ? 76 : 60}px ${fonts.text}`
  ctx.fillText(GARAGE_SHARE.collected, W / 2, layout.heading + 10)
  ctx.textAlign = 'left'

  const cardW = layout.card
  const cardH = (cardW / 100) * C.height
  const x = (W - cardW) / 2
  const y = layout.top
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = 90
  ctx.shadowOffsetY = 40
  roundRect(ctx, x, y, cardW, cardH, (cardW / 100) * C.radius)
  ctx.fillStyle = '#111216'
  ctx.fill()
  ctx.restore()
  await drawGarageCard(ctx, car, x, y, cardW, fonts)

  // "Book on detlio.com": the red pill every Detlio picture carries.
  ctx.font = `600 ${layout.pillFont}px ${fonts.text}`
  const label = `${GARAGE_SHARE.book}  ↗`
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
  ctx.textBaseline = 'alphabetic'
}

export async function shareGarageCard(car: GarageOwnedCar, format: ShareFormat, firstName: string | null): Promise<ShareOutcome> {
  const canvas = document.createElement('canvas')
  await drawGarageShareImage(canvas, car, format, firstName)
  const file = await canvasFile(canvas, `detlio-garage-${String(car.number).padStart(2, '0')}-${format}.png`)
  return shareImageFile(file, { title: 'Detlio Garage', text: `${GARAGE_SHARE.collected}. ${GARAGE_SHARE.book}` })
}
