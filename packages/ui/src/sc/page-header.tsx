'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

interface PageHeaderProps {
  title: string
  /** One line under the title: a count, or what the page is for. */
  subtitle?: React.ReactNode
  /** Shows the back arrow. With no backHref it goes back in history. */
  showBack?: boolean
  backHref?: string
  /** The page's actions and badges; they wrap under the title on a phone. */
  actions?: React.ReactNode
  className?: string
}

// The same 44px target around a 22px arrow as TopBar, with the same negative
// margin, so the arrow lines up with the content edge below it.
const BACK_CLASS =
  '-ml-[11px] flex size-11 shrink-0 items-center justify-center rounded-[10px] text-text-primary transition-colors hover:bg-surface'

/**
 * The title row of an admin page. TopBar's language — the arrow, the white
 * semibold title — a step larger for a desktop workspace (20px rather than
 * 18px), with room for a subtitle and for actions that wrap below the title
 * instead of crushing it on a phone.
 */
export function PageHeader({
  title,
  subtitle,
  showBack,
  backHref,
  actions,
  className,
}: PageHeaderProps) {
  const router = useRouter()

  return (
    <header
      className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-3', className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        {(showBack || backHref) &&
          (backHref ? (
            <Link href={backHref} aria-label="Go back" className={BACK_CLASS}>
              <IconArrowLeft size={22} stroke={1.5} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className={BACK_CLASS}
            >
              <IconArrowLeft size={22} stroke={1.5} />
            </button>
          ))}
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold leading-7 tracking-tight text-text-primary">
            {title}
          </h1>
          {subtitle && <div className="text-[12px] text-text-secondary">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
