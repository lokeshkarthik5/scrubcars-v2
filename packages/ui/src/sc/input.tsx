import { cn } from '@repo/core/utils'
import { type InputHTMLAttributes, forwardRef, useId } from 'react'

type FieldTone = 'solid' | 'glass'

interface ScInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  /**
   * 'glass' on the frosted sign-in card (AuthStage), matching ScPhoneInput's
   * glass field: a solid field there reads as a hole in the glass. It is also
   * a 16px field, the size below which iOS Safari zooms into a focused input.
   */
  tone?: FieldTone
}

const FIELD_TONES: Record<FieldTone, string> = {
  solid: 'rounded-[10px] border-border bg-surface px-3 py-2.5 text-[13px]',
  glass: 'rounded-[12px] border-white/15 bg-white/[0.06] px-3.5 py-3.5 text-[16px]',
}

export const ScInput = forwardRef<HTMLInputElement, ScInputProps>(
  ({ className, label, id, tone = 'solid', ...props }, ref) => {
    // Callers almost never pass an id, and a <label htmlFor={undefined}> is
    // decorative: clicking it does not focus the field, and a screen reader
    // announces an unlabelled input. Generating one here fixes every form at
    // once rather than one id at a time, and an explicit id still wins.
    const generatedId = useId()
    const inputId = id ?? generatedId

    // Focus is a light edge rather than red: red marks what to press, and a
    // form full of red-edged fields reads as a form full of errors.
    return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[11px] font-medium text-text-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'w-full border text-text-primary outline-none transition-colors focus:border-text-secondary',
          FIELD_TONES[tone],
          className
        )}
        {...props}
      />
    </div>
    )
  }
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
  ({ className, label, id, ...props }, ref) => {
    const generatedId = useId()
    const textareaId = id ?? generatedId

    return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={textareaId} className="text-[11px] font-medium text-text-secondary">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        className={cn(
          'w-full resize-none rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none transition-colors focus:border-text-secondary',
          className
        )}
        {...props}
      />
    </div>
    )
  }
)
ScTextarea.displayName = 'ScTextarea'
