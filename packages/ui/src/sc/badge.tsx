import { cn } from '@repo/core/utils'

type BadgeVariant = 'success' | 'pending' | 'muted' | 'accent' | 'danger'

const variants: Record<BadgeVariant, string> = {
  success: 'bg-success-muted text-success',
  pending: 'bg-warning-muted text-warning',
  muted: 'bg-surface-elevated text-text-secondary border border-border',
  accent: 'bg-accent-muted text-brand-red',
  danger: 'bg-accent-muted text-brand-red',
}

interface ScBadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

export function ScBadge({ children, variant = 'muted', className }: ScBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

/** Onboarding stage shown in the admin panel (`vendors.status`). */
export function vendorAdminStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    active: { label: 'Active', variant: 'success' },
    pending: { label: 'Pending', variant: 'pending' },
    suspended: { label: 'Suspended', variant: 'danger' },
    archived: { label: 'Archived', variant: 'muted' },
  }
  return map[status] ?? { label: status, variant: 'muted' as const }
}

/** A booking's status as the garage and the admin panel name it. */
export function bookingStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending: { label: 'New', variant: 'accent' },
    confirmed: { label: 'Confirmed', variant: 'success' },
    in_progress: { label: 'In progress', variant: 'danger' },
    completed: { label: 'Completed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'muted' },
    rescheduled: { label: 'Rescheduled', variant: 'muted' },
  }
  return map[status] ?? { label: status, variant: 'muted' as const }
}

/**
 * A booking's status as the customer names it — the list and the detail page
 * both, so one booking never reads "New" in one place and "Waiting" in the
 * other.
 *
 * It differs from the garage's wording in one place: `pending`. To the garage
 * that is a new job to accept; to the customer who has just paid, it is a
 * request the garage has not accepted yet, and anything that sounds like a
 * confirmation would promise a slot nobody has agreed to.
 */
export function customerBookingStatusBadge(status: string) {
  if (status === 'pending') {
    return { label: 'Requested', variant: 'pending' as const }
  }
  return bookingStatusBadge(status)
}
