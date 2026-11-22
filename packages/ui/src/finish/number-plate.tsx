import { formatIndianPlate } from '@repo/core/moments'
import { cn } from '@repo/core/utils'

/**
 * A car's plate drawn like an Indian number plate (moment 8): white, a black
 * edge, the blue IND band, the characters in their usual groups
 * ("TN 07 CD 9036", formatIndianPlate). Read as the plate itself. Hidden
 * from Microsoft Clarity like every plate on screen.
 *
 * `xs` sits in a list row (Garage Book's Customers), `sm` inside a checkout
 * car tile, `md` is a Garage Book customer's, `lg` fills Profile's car card
 * (22 Nov 2026: the plate in place of the car picture). CSS in
 * packages/ui/styles/finish.css (.mo-plate).
 */
export function NumberPlate({
  plate,
  size = 'md',
  className,
}: {
  plate: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const text = formatIndianPlate(plate)
  return (
    <span
      data-clarity-mask="true"
      className={cn(
        'mo-plate inline-flex max-w-full items-stretch overflow-hidden',
        size === 'lg' ? 'flex h-[60px] w-full rounded-[10px]' : 'self-start',
        size === 'xs'
          ? 'h-[18px] rounded-[4px]'
          : size === 'sm'
            ? 'h-[20px] rounded-[4px]'
            : size === 'md'
              ? 'h-[34px] rounded-[6px]'
              : '',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mo-plate__band flex shrink-0 items-end justify-center font-bold leading-none text-white',
          size === 'lg' ? 'w-8 pb-2 text-[10px]' : size === 'md' ? 'w-5 pb-1 text-[7px]' : 'w-3 pb-[2px] text-[4.5px]'
        )}
      >
        IND
      </span>
      <span
        className={cn(
          'flex items-center truncate whitespace-nowrap font-numeric font-bold leading-none tracking-[0.04em] text-[#111]',
          size === 'xs'
            ? 'px-1.5 text-[10px]'
            : size === 'sm'
              ? 'px-1.5 text-[11px]'
              : size === 'md'
                ? 'px-2.5 text-[19px]'
                : 'flex-1 justify-center px-3 text-[28px] tracking-[0.08em]'
        )}
      >
        {text}
      </span>
    </span>
  )
}
