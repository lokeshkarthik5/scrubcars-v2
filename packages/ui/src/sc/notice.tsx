import Link from 'next/link'
import { IconAlertTriangle, IconChevronRight, IconInfoCircle } from '@tabler/icons-react'
import { cn } from '@repo/core/utils'

type NoticeTone = 'warning' | 'neutral'

const toneStyles: Record<NoticeTone, { box: string; icon: string }> = {
  // The customer checkout's "Add a car to continue" card: amber edge on a
  // faint amber wash. Something the reader has to act on.
  warning: { box: 'border-warning bg-warning-muted/20', icon: 'text-warning' },
  // Waiting on someone else — under review, say. Not a caution, so not amber.
  neutral: { box: 'border-border bg-surface', icon: 'text-text-secondary' },
}

interface NoticeProps {
  title: React.ReactNode
  children?: React.ReactNode
  tone?: NoticeTone
  /** Makes the whole notice a link to where it is fixed, with a chevron. */
  href?: string
  /**
   * `status` when it appears after an action and should be announced. Not
   * applied to a notice with an href, which stays a link.
   */
  role?: 'status' | 'alert'
  className?: string
}

/**
 * A line of state above a screen's content: a garage that is not on the map,
 * paused, or still under review. Shared so each one reads the same — a title
 * in white, a sentence in grey, amber only when there is something to do.
 */
export function Notice({
  title,
  children,
  tone = 'warning',
  href,
  role,
  className,
}: NoticeProps) {
  const styles = toneStyles[tone]
  const Icon = tone === 'warning' ? IconAlertTriangle : IconInfoCircle
  const body = (
    <>
      <Icon size={18} aria-hidden="true" className={cn('mt-px shrink-0', styles.icon)} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-text-primary">{title}</span>
        {children && (
          <span className="mt-0.5 block text-[12px] text-text-secondary">{children}</span>
        )}
      </span>
      {href && (
        <IconChevronRight
          size={18}
          aria-hidden="true"
          className="mt-px shrink-0 self-center text-text-muted"
        />
      )}
    </>
  )
  const boxClass = cn(
    'flex items-start gap-3 rounded-[14px] border px-3.5 py-3',
    styles.box,
    className
  )

  // No role on the link: it would replace "link", which is what it is.
  if (href) {
    return (
      <Link href={href} className={cn(boxClass, 'press')}>
        {body}
      </Link>
    )
  }

  return (
    <div role={role} className={boxClass}>
      {body}
    </div>
  )
}
