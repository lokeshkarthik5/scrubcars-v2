'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: string
  showBack?: boolean
  backHref?: string
  right?: React.ReactNode
  /** Centers the title between the back button and the right slot. */
  center?: boolean
  className?: string
}

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
            <Link href={backHref} className="shrink-0 text-text-primary">
              <IconArrowLeft size={22} stroke={1.5} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => router.back()}
              className="shrink-0 text-text-primary"
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
