import { cn } from '@/lib/utils'

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

export function vendorStatusBadge(status: 'open' | 'busy' | 'closed') {
  const map = {
    open: { label: 'Open', variant: 'success' as const },
    busy: { label: 'Busy', variant: 'pending' as const },
    closed: { label: 'Closed', variant: 'muted' as const },
  }
  return map[status]
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

export function bookingStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    // Customer-facing name for `pending` while the vendor hasn't accepted yet.
    waiting: { label: 'Waiting', variant: 'pending' },
    pending: { label: 'New', variant: 'accent' },
    confirmed: { label: 'Confirmed', variant: 'success' },
    in_progress: { label: 'In progress', variant: 'danger' },
    completed: { label: 'Completed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'muted' },
    rescheduled: { label: 'Rescheduled', variant: 'muted' },
  }
  return map[status] ?? { label: status, variant: 'muted' as const }
}
