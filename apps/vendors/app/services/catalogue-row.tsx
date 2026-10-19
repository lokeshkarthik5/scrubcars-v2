'use client'

/**
 * A row's small actions — Edit, Disable, Delete — as quiet outline buttons
 * with a full 48px height. They were 11px words, two of them in red, which
 * put three red things on every row of a screen whose one red is its Add
 * button.
 */
export function RowAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press min-h-12 rounded-full border border-white/20 px-4 text-[14px] font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:opacity-50"
    >
      {children}
    </button>
  )
}
