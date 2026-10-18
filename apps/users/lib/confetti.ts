/**
 * A small confetti burst on a canvas: about 1.5 s of paper falling from a
 * point, then the canvas is cleared. No library. The caller decides when
 * (never under prefers-reduced-motion) and owns the canvas, which should sit
 * over the moment with `pointer-events: none`. Returns a stop function.
 */

const DEFAULT_COLORS = ['#F7D58B', '#E2B451', '#FFF4D6', '#DCE1EC', '#FAFAFA', '#E4002B']

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  spin: number
  w: number
  h: number
  color: string
  round: boolean
}

export function burstConfetti(
  canvas: HTMLCanvasElement,
  options: { originX?: number; originY?: number; count?: number; durationMs?: number; colors?: string[] } = {}
): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const ratio = window.devicePixelRatio || 1
  const { width, height } = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

  const colors = options.colors ?? DEFAULT_COLORS
  const duration = options.durationMs ?? 1500
  const originX = (options.originX ?? 0.5) * width
  const originY = (options.originY ?? 0.45) * height
  const pieces: Piece[] = Array.from({ length: options.count ?? 90 }, (_, i) => {
    // Fanned upward and out, faster at the centre of the fan.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15
    const speed = 260 + Math.random() * 380
    return {
      x: originX + (Math.random() - 0.5) * 30,
      y: originY + (Math.random() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 14,
      w: 4 + Math.random() * 5,
      h: 2.5 + Math.random() * 3,
      color: colors[i % colors.length],
      round: i % 5 === 0,
    }
  })

  let frame = 0
  let last = performance.now()
  const start = last
  const gravity = 820
  const drag = 1.9

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = (now - start) / duration
    ctx.clearRect(0, 0, width, height)
    if (t >= 1) return
    const fade = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35
    for (const p of pieces) {
      p.vx -= p.vx * drag * dt
      p.vy += gravity * dt - p.vy * drag * dt * 0.6
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.angle += p.spin * dt
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle)
      ctx.fillStyle = p.color
      if (p.round) {
        ctx.beginPath()
        ctx.arc(0, 0, p.h * 0.8, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // A paper strip turning over: its height breathes with the spin.
        ctx.fillRect(-p.w / 2, (-p.h / 2) * Math.abs(Math.cos(p.angle * 1.7)), p.w, p.h * Math.abs(Math.cos(p.angle * 1.7)) + 0.6)
      }
      ctx.restore()
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    ctx.clearRect(0, 0, width, height)
  }
}
