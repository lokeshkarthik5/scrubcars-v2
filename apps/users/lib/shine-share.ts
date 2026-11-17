import { shineShareText } from '@repo/core/shine-score'

type ShareInput = { score: number } | { before: number; after: number }

/**
 * A square image of the score, drawn here: the number, the arc and the
 * app's name, nothing else. No name, car, plate, place or photo, so it can
 * go anywhere. Null when the browser cannot draw it.
 */
async function shareCard(input: ShareInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const size = 1080
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const bg = ctx.createLinearGradient(0, 0, 0, size)
  bg.addColorStop(0, '#1a0b0f')
  bg.addColorStop(1, '#09090b')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  const score = 'score' in input ? input.score : input.after
  // The gauge: grey track, red → amber → green to the reading.
  const cx = size / 2
  const cy = 600
  const r = 300
  ctx.lineCap = 'round'
  ctx.lineWidth = 36
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI)
  ctx.stroke()
  const arc = ctx.createLinearGradient(cx - r, 0, cx + r, 0)
  arc.addColorStop(0, '#ff2d4a')
  arc.addColorStop(0.4, '#F5B83D')
  arc.addColorStop(1, '#22C55E')
  ctx.strokeStyle = arc
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * Math.min(1, Math.max(0, score / 100)))
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = '600 56px Inter, system-ui, sans-serif'
  ctx.fillText('Shine Score', cx, 170)
  ctx.font = '600 200px Inter, system-ui, sans-serif'
  ctx.fillText('score' in input ? String(input.score) : `${input.before} → ${input.after}`, cx, 640)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '400 48px Inter, system-ui, sans-serif'
  ctx.fillText('score' in input ? 'out of 100' : 'before → after', cx, 730)
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 52px Inter, system-ui, sans-serif'
  ctx.fillText('Detlio', cx, 960)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/**
 * Shares the score through the phone's share sheet: the image card when the
 * browser can share files, else the text; on a computer without a share
 * sheet the text is copied. Says which happened.
 */
export async function shareShineScore(input: ShareInput): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const text = shineShareText(input)
  const url = 'https://detlio.com'
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const blob = await shareCard(input).catch(() => null)
      const file = blob ? new File([blob], 'shine-score.png', { type: 'image/png' }) : null
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
      } else {
        await navigator.share({ text, url })
      }
      return 'shared'
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(`${text} ${url}`)
      return 'copied'
    }
    return 'failed'
  } catch (err) {
    return (err as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}
