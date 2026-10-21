'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

/**
 * An inner screen's header (the consistency system's second kind): a back
 * arrow and a 20pt left-aligned title in sentence case — "Book your wash",
 * "Booking". Tab screens keep TopBar's large title.
 */
export function PageHeader({
  title,
  backHref,
  right,
  className,
}: {
  title: string
  /** Where the arrow goes; without one it goes back in history. */
  backHref?: string
  right?: React.ReactNode
  className?: string
}) {
  const router = useRouter()
  const arrow = <IconArrowLeft size={22} stroke={1.5} aria-hidden />
  const backClass =
    '-m-[11px] flex size-11 shrink-0 items-center justify-center text-text-primary'
  return (
    <header className={cn('flex min-h-14 items-center gap-4 py-2', className)}>
      {backHref ? (
        <Link href={backHref} aria-label="Go back" className={backClass}>
          {arrow}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className={backClass}
        >
          {arrow}
        </button>
      )}
      <h1 className="min-w-0 flex-1 text-[20px] leading-tight font-normal tracking-[-0.015em] text-text-primary">
        {title}
      </h1>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}
