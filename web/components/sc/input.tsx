import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'

interface ScInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const ScInput = forwardRef<HTMLInputElement, ScInputProps>(
  ({ className, label, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[11px] font-medium text-text-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          'w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none transition-colors focus:border-brand-red',
          className
        )}
        {...props}
      />
    </div>
  )
)
ScInput.displayName = 'ScInput'

interface ScFieldProps extends Omit<ScInputProps, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
}

/**
 * ScInput with a plain `(value) => void` onChange. Convenience for the long
 * admin/vendor forms where every field is a controlled string.
 */
export function ScField({ value, onChange, ...props }: ScFieldProps) {
  return <ScInput value={value} onChange={(e) => onChange(e.target.value)} {...props} />
}

interface ScTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export const ScTextarea = forwardRef<HTMLTextAreaElement, ScTextareaProps>(
  ({ className, label, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[11px] font-medium text-text-secondary">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        className={cn(
          'w-full resize-none rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none transition-colors focus:border-brand-red',
          className
        )}
        {...props}
      />
    </div>
  )
)
ScTextarea.displayName = 'ScTextarea'
