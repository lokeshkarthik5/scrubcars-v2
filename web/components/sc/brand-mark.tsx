import Image from 'next/image'
import { cn } from '@/lib/utils'

/** Intrinsic size of `/detlio-logo.png` — white wordmark, brand-red period. */
const LOGO_W = 316
const LOGO_H = 90
const RATIO = LOGO_W / LOGO_H

interface BrandMarkProps {
  /** Rendered height in px; the width follows the artwork's 3.51:1 ratio. */
  height?: number
  /** Set on the logo that is above the fold on first paint. */
  priority?: boolean
  className?: string
}

/**
 * The Detlio wordmark. The artwork is white on transparent, so it only reads on
 * the brand-black surfaces — which is every shell in the app.
 *
 * Size it with `height`; never set a width, or the letterforms distort.
 */
export function BrandMark({ height = 28, priority = false, className }: BrandMarkProps) {
  return (
    <Image
      src="/detlio-logo.png"
      alt="Detlio"
      width={LOGO_W}
      height={LOGO_H}
      priority={priority}
      sizes={`${Math.round(height * RATIO)}px`}
      style={{ height, width: 'auto' }}
      className={cn('shrink-0 grow-0 object-contain', className)}
    />
  )
}
