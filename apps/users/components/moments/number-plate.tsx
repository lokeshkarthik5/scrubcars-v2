import { formatIndianPlate } from '@repo/core/moments'
import { cn } from '@repo/core/utils'

/**
 * A car's plate drawn like an Indian number plate (moment 8): white, a black
 * edge, the blue IND band, the characters in their usual groups
 * ("TN 07 CD 9036", formatIndianPlate). Read as the plate itself. Hidden
 * from Microsoft Clarity like every plate on screen.
 *
 * `sm` sits inside a checkout car tile; `md` is Profile's.
 */
export function NumberPlate({
  plate,
  size = 'md',
  className,
}: {
  plate: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const text = formatIndianPlate(plate)
  return (
    <span
      data-clarity-mask="true"
      className={cn(
        'mo-plate inline-flex max-w-full items-stretch self-start overflow-hidden',
        size === 'sm' ? 'h-[20px] rounded-[4px]' : 'h-[34px] rounded-[6px]',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mo-plate__band flex shrink-0 items-end justify-center font-bold leading-none text-white',
          size === 'sm' ? 'w-3 pb-[2px] text-[4.5px]' : 'w-5 pb-1 text-[7px]'
        )}
      >
        IND
      </span>
      <span
        className={cn(
          'flex items-center truncate whitespace-nowrap font-numeric font-bold leading-none tracking-[0.04em] text-[#111]',
          size === 'sm' ? 'px-1.5 text-[11px]' : 'px-2.5 text-[19px]'
        )}
      >
        {text}
      </span>
    </span>
  )
}
