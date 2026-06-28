import { IconAlertCircle } from '@tabler/icons-react'
import { ScButton } from './button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {icon && <div className="text-text-muted">{icon}</div>}
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {subtitle && <p className="max-w-[240px] text-[12px] text-text-secondary">{subtitle}</p>}
      {actionLabel && onAction && (
        <ScButton variant="primary" className="mt-2 max-w-[200px]" onClick={onAction}>
          {actionLabel}
        </ScButton>
      )}
    </div>
  )
}

export function ErrorState({
  message = 'Something went wrong',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <IconAlertCircle size={32} className="text-brand-red" />
      <p className="text-[13px] text-text-secondary">{message}</p>
      {onRetry && (
        <ScButton variant="secondary" className="max-w-[160px]" onClick={onRetry}>
          Retry
        </ScButton>
      )}
    </div>
  )
}

export function SkeletonCard() {
  return <div className="h-24 w-full rounded-[14px] shimmer" />
}
