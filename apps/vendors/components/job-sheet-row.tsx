import type { ReactNode } from 'react'
import { IconChevronRight } from '@tabler/icons-react'

/**
 * A row on a job's page that opens its own sheet: Extra work, Final bill
 * (garage mockup 03). A button when there is something to do, plain text
 * when there isn't; 48px and up either way.
 */
export function JobSheetRow({
  icon,
  title,
  detail,
  onOpen,
  'aria-label': ariaLabel,
}: {
  icon: ReactNode
  title: ReactNode
  detail?: ReactNode
  /** Leave out for a row with nothing to open. */
  onOpen?: () => void
  'aria-label'?: string
}) {
  const body = (
    <>
      <span aria-hidden="true" className="shrink-0 text-text-secondary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold text-text-primary">
          {title}
        </span>
        {detail && (
          <span className="block text-[15px] text-text-secondary">
            {detail}
          </span>
        )}
      </span>
      {onOpen && (
        <IconChevronRight
          size={20}
          aria-hidden="true"
          className="shrink-0 text-text-secondary"
        />
      )}
    </>
  )
  const className =
    'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left'
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      className={`press ${className} hover:bg-white/[0.03]`}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  )
}
