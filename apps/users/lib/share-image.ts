/**
 * What every image Detlio draws on the customer's phone shares (Wrapped,
 * premium cards): the page's own fonts for the canvas, a rounded rectangle,
 * and handing the PNG to the phone's share sheet (the Web Share API, a
 * file) or, where files cannot be shared (most desktops), a download. No
 * server renders anything and no outside service sees the image.
 */

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/** The app's text face (Inter) and its figures face (Space Grotesk), as canvas font families. */
export function fontFamilies(): { text: string; figures: string } {
  if (typeof window === 'undefined') return { text: 'system-ui, sans-serif', figures: 'system-ui, sans-serif' }
  const style = getComputedStyle(document.body)
  const text = style.fontFamily || 'system-ui, sans-serif'
  const grotesk = style.getPropertyValue('--font-space-grotesk').trim()
  return { text, figures: grotesk ? `${grotesk}, ${text}` : text }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** The canvas as a PNG file. */
export async function canvasFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error("Couldn't make the image")
  return new File([blob], name, { type: 'image/png' })
}

/**
 * Shares the file through the phone's share sheet; where files cannot be
 * shared, downloads it. Closing the share sheet is a choice, not a failure.
 */
export async function shareImageFile(file: File, words: { title: string; text: string }): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: words.title, text: words.text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Some browsers say they can share files and then refuse: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  return 'downloaded'
}
