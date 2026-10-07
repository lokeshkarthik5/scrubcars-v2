'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

interface TopBarProps {
  title?: string
  showBack?: boolean
  backHref?: string
  right?: React.ReactNode
  /** Centers the title between the back button and the right slot. */
  center?: boolean
  className?: string
}

// A 44px touch target around a 22px arrow. The negative margin gives back
// the extra size, so the bar's height and the title's position don't move.
const BACK_CLASS =
  '-m-[11px] flex size-11 shrink-0 items-center justify-center text-text-primary'

export function TopBar({ title, showBack, backHref, right, center, className }: TopBarProps) {
  const router = useRouter()
  return (
    <header
      className={cn(
        'relative flex items-center justify-between gap-3 py-3',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {showBack &&
          (backHref ? (
            <Link href={backHref} aria-label="Go back" className={BACK_CLASS}>
              <IconArrowLeft size={22} stroke={1.5} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => router.back()}
              className={BACK_CLASS}
              aria-label="Go back"
            >
              <IconArrowLeft size={22} stroke={1.5} />
            </button>
          ))}
        {title && !center && (
          <h1 className="truncate text-lg font-semibold text-text-primary">{title}</h1>
        )}
      </div>
      {/* Centered variant: absolutely positioned so an odd-width right slot
          can't nudge the title off-centre. */}
      {title && center && (
        <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 truncate text-[17px] font-semibold text-text-primary">
          {title}
        </h1>
      )}
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}
