/**
 * A Detlio Garage card (0057) as an Instagram picture, drawn on the
 * customer's phone: a Story (1080×1920) or a Post (1080×1350), the card in
 * the middle on a backdrop lit in its rarity's colour, "Collected on Detlio"
 * above it, the illustration line and "Book on detlio.com" on the red pill
 * under it. Drawn from the same numbers as the screen (lib/garage-card.ts,
 * card units: the card is 100 wide). The photo is the card's licensed photo
 * at 1600 px, same-origin, so the canvas stays exportable. Only the card's
 * own words go in it, and the sharer's first name when they tick it: never a
 * phone, a booking or a code.
 */
import type { GarageOwnedCar } from '@repo/core/api/garage'
import { cardCarSrc } from '@repo/core/card-cars'
import { cardNumber, copiesLabel, ILLUSTRATION_LINE, RARITY_LOOKS } from '@repo/core/garage'
import { SHARE_FORMATS, type ShareFormat } from './premium-card'
import { carArtSrc, cardPhoto, GARAGE_CARD as C, GARAGE_SHARE, TONE_LOOKS } from './garage-card'
import { canvasFile, fontFamilies, roundRect, shareImageFile, type ShareOutcome } from './share-image'

type Fonts = { text: string; figures: string }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Couldn't load the car picture"))
    img.src = src
  })
}

/** The card's picture: a future series' upload when it loads for a canvas, else the pool photo (same-origin, always). */
async function carPicture(car: GarageOwnedCar): Promise<HTMLImageElement> {
  if (car.art.source === 'upload' && car.art.url) {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('upload'))
        img.src = carArtSrc(car, 1600)
      })
      return img
    } catch {
      // A bucket without CORS for canvases: the pool photo instead.
    }
  }
  return loadImage(cardCarSrc(cardPhoto(car.photoId), 1600))
}

/** "50% 40%" → [0.5, 0.4]. */
function position(value: string): [number, number] {
  const [x, y] = value.split(/\s+/).map((part) => Number.parseFloat(part) / 100)
  return [Number.isFinite(x) ? x : 0.5, Number.isFinite(y) ? y : 0.5]
}

/** Draws `img` covering w × h at x, y, cropped at the CSS object-position. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, at: [number, number]) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / scale
  const sh = h / scale
  const sx = (img.naturalWidth - sw) * at[0]
  const sy = (img.naturalHeight - sh) * at[1]
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

/** Draws the card at x, y, `width` px wide, in card units throughout (the CSS's numbers). */
export async function drawGarageCard(ctx: CanvasRenderingContext2D, car: GarageOwnedCar, x: number, y: number, width: number, fonts: Fonts) {
  const img = await carPicture(car)
  const photo = cardPhoto(car.photoId)
  const u = width / 100
  const tone = TONE_LOOKS[photo.tone]
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

  // The face: ground, then the photo fading into it.
  const f = C.frame
  const fw = 100 - f * 2
  const fh = C.height - f * 2
  ctx.save()
  ctx.translate(f, f)
  roundRect(ctx, 0, 0, fw, fh, C.radius - 1.4)
  ctx.clip()
  const ground = ctx.createLinearGradient(0, 0, 0, fh)
  ground.addColorStop(0, tone.ground[0])
  ground.addColorStop(0.55, tone.ground[1])
  ground.addColorStop(1, tone.ground[2])
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, fw, fh)
  drawCover(ctx, img, 0, 0, fw, C.photo.height, position(photo.position))
  const fade = ctx.createLinearGradient(0, C.photo.height * 0.72, 0, C.photo.height)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(1, tone.ground[1])
  ctx.fillStyle = fade
  ctx.fillRect(0, C.photo.height * 0.72 - 0.5, fw, C.photo.height * 0.28 + 1)
  const wash = ctx.createLinearGradient(0, 0, 0, 22)
  wash.addColorStop(0, 'rgba(0,0,0,0.55)')
  wash.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, fw, 22)

  const L = C.pad - f
  ctx.textBaseline = 'alphabetic'
  // Wordmark and number.
  ctx.fillStyle = '#F5F6F8'
  ctx.font = `600 3.4px ${fonts.text}`
  ctx.fillText('Detlio', L, 8.4)
  const markW = ctx.measureText('Detlio').width
  ctx.fillStyle = '#E4002B'
  ctx.fillText('.', L + markW, 8.4)
  ctx.fillStyle = 'rgba(245,246,248,0.75)'
  ctx.font = `500 3.4px ${fonts.text}`
  ctx.fillText(' Garage', L + markW + ctx.measureText('.').width, 8.4)
  ctx.fillStyle = 'rgba(245,246,248,0.85)'
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

  // Colour and setting.
  let chipX = L
  const chipY = C.chips.top - f
  ctx.font = `500 ${C.chips.size}px ${fonts.text}`
  for (const text of [car.colour, car.setting]) {
    const w = ctx.measureText(text).width + 4.4
    roundRect(ctx, chipX, chipY, w, C.chips.height, C.chips.height / 2)
    ctx.fillStyle = tone.chipBg
    ctx.fill()
    ctx.strokeStyle = tone.chipEdge
    ctx.lineWidth = 0.28
    ctx.stroke()
    ctx.fillStyle = tone.chipText
    ctx.fillText(text, chipX + 2.2, chipY + 4.25)
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

const LAYOUT: Record<ShareFormat, { card: number; top: number; heading: number; pillGap: number; pillH: number; pillFont: number }> = {
  story: { card: 760, top: 400, heading: 250, pillGap: 120, pillH: 96, pillFont: 38 },
  post: { card: 620, top: 196, heading: 118, pillGap: 74, pillH: 80, pillFont: 32 },
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

  // The illustration line: the photo is of a real car.
  ctx.fillStyle = 'rgba(200,204,212,0.75)'
  ctx.font = `500 ${format === 'story' ? 26 : 22}px ${fonts.text}`
  ctx.textAlign = 'center'
  ctx.fillText(ILLUSTRATION_LINE, W / 2, y + cardH + (format === 'story' ? 58 : 40))
  ctx.textAlign = 'left'

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
