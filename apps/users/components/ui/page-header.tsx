'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'
import { useT } from '@repo/core/i18n'

/**
 * An inner screen's header (the consistency system's second kind): a back
 * arrow and a left-aligned title in sentence case — "Book your wash",
 * "Booking" — at T2 (18/600) on the finish's type scale. Tab screens keep
 * TopBar's page title.
 */
export function PageHeader({
  title,
  backHref,
  onBack,
  right,
  solid = false,
  className,
}: {
  title: string
  /** Where the arrow goes; without one it goes back in history. */
  backHref?: string
  /** What the arrow does instead of going back (the booking page folds into its bar). */
  onBack?: () => void
  right?: React.ReactNode
  /** Glass under it (`gp-top`'s), for a header stuck over a page that scrolls. */
  solid?: boolean
  className?: string
}) {
  const t = useT()
  const router = useRouter()
  const arrow = <IconArrowLeft size={22} stroke={1.5} aria-hidden />
  const backClass =
    '-m-[11px] flex size-11 shrink-0 items-center justify-center text-text-primary'
  return (
    <header
      data-solid={solid ? '' : undefined}
      className={cn('flex min-h-14 items-center gap-4 py-2', className)}
    >
      {backHref ? (
        <Link href={backHref} aria-label={t('Go back')} className={backClass}>
          {arrow}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => (onBack ? onBack() : router.back())}
          aria-label={t('Go back')}
          className={backClass}
        >
          {arrow}
        </button>
      )}
      <h1 className="min-w-0 flex-1 text-t2 font-semibold text-text-primary">
        {title}
      </h1>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}
