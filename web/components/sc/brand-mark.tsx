import { cn } from '@/lib/utils'

interface BrandMarkProps {
  className?: string
}

/**
 * The Detlio wordmark. The design spec is a 141.51 x 40 box that does not flex
 * (`flex: none; flex-grow: 0`); this renders it at 0.7 scale — 99.06 x 28 — to
 * sit comfortably in the mobile header. Adjust the two dimensions and the font
 * size together to keep the proportions.
 *
 * The period is the brand red, matching the treatment on the welcome screen.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <div
      className={cn(
        'flex h-7 w-[99.06px] shrink-0 grow-0 items-center',
        className
      )}
    >
      <span className="text-[28px] font-bold leading-none tracking-tight text-text-primary">
        Detlio<span className="text-brand-red">.</span>
      </span>
    </div>
  )
}
