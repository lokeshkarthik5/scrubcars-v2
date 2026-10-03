import { cn } from '@repo/core/utils'
import { type SelectHTMLAttributes, forwardRef } from 'react'

interface ScSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

/** Native select styled to match ScInput, so forms read the same everywhere. */
export const ScSelect = forwardRef<HTMLSelectElement, ScSelectProps>(
  ({ className, label, id, children, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[11px] font-medium text-text-secondary">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={cn(
          'w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none transition-colors focus:border-text-secondary',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
)
ScSelect.displayName = 'ScSelect'
