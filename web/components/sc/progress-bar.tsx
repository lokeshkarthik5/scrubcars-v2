import { cn } from '@/lib/utils'

interface ProgressBarProps {
  progress: number
  className?: string
}

export function ProgressBar({ progress, className }: ProgressBarProps) {
  return (
    <div className={cn('h-[3px] w-full overflow-hidden rounded-sm bg-surface', className)}>
      <div
        className="h-full rounded-sm bg-brand-red transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  )
}
