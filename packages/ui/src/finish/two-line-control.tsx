'use client'

import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@repo/core/utils'

/**
 * A two-line control (§1, layout): a raised 56px button with a main line
 * (14/600) over a quiet line (11/500), an optional pearl icon tile on the
 * left and anything trailing on the right (a chevron, a count). `pinned`
 * is its 44px form, with the quiet line hidden, for a control stuck to the
 * top of the screen.
 */
export function TwoLineControl({
  main,
  quiet,
  tile,
  trailing,
  pinned = false,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  main: ReactNode
  quiet?: ReactNode
  /** The pearl icon tile's icon. */
  tile?: ReactNode
  trailing?: ReactNode
  pinned?: boolean
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'fx-raised fx-press flex min-w-0 items-center gap-3 rounded-[18px] pl-2 pr-4 text-left transition-[height] duration-200',
        pinned ? 'h-11' : 'h-14',
        className
      )}
    >
      {tile && (
        <span
          aria-hidden="true"
          className={cn(
            'fx-pearl grid shrink-0 place-items-center [&_svg]:size-[18px]',
            pinned ? 'size-8 rounded-[10px]' : 'size-10 rounded-[12px]'
          )}
        >
          {tile}
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[14px] font-semibold text-text-primary">{main}</span>
        {quiet && (
          <span className={cn('truncate text-t5 font-medium text-[#8E8E98]', pinned && 'hidden')}>{quiet}</span>
        )}
      </span>
      {trailing && <span className="ml-auto flex shrink-0 items-center text-[#8E8E98]">{trailing}</span>}
    </button>
  )
}
