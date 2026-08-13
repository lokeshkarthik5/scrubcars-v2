import { cn } from '@/lib/utils'

interface ScSectionProps {
  title: string
  /** Optional trailing slot in the header row (a button, count, badge…). */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Titled group for form screens. Deliberately transparent rather than
 * `bg-surface` like ScCard — inputs are themselves `bg-surface`, so a surface
 * background here would flatten them against the group.
 */
export function ScSection({ title, action, children, className }: ScSectionProps) {
  return (
    <section
      className={cn('space-y-3 rounded-[14px] border border-border p-4', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
