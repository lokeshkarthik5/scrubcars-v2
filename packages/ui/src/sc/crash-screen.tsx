import { IconAlertCircle } from '@tabler/icons-react'
import { BrandMark } from './brand-mark'
import { ScButton } from './button'

interface CrashScreenProps {
  title: string
  message: string
  /** Re-renders what failed. Absent on a page that simply does not exist. */
  onRetry?: () => void
  homeHref: string
  homeLabel: string
  /** Next's error digest: shown small, so support can match it to the logs. */
  reference?: string
  /** More help under the actions — the customer app's call and WhatsApp. */
  children?: React.ReactNode
  /**
   * Rendered inside an app's own chrome (the admin panel's header and nav),
   * which already shows the brand and owns the page height.
   */
  inChrome?: boolean
}

/**
 * What every app shows when a page crashes or does not exist: a plain
 * sentence, a way to try again, and a way out. Shared so the three apps fail
 * the same way, and kept to the brand's dark graphite canvas so a crash does
 * not look like someone else's site.
 *
 * Home is a plain link, not a client-side navigation: after a crash the app's
 * own state is the suspect, and a full load starts it clean.
 */
export function CrashScreen({
  title,
  message,
  onRetry,
  homeHref,
  homeLabel,
  reference,
  children,
  inChrome = false,
}: CrashScreenProps) {
  return (
    <div
      className={
        inChrome
          ? 'flex w-full flex-col py-12 text-text-primary'
          : 'mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black px-4 py-6 text-text-primary'
      }
    >
      {!inChrome && <BrandMark height={28} />}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        {/* Amber, as errors are everywhere: red is kept for Try again. */}
        <IconAlertCircle size={36} className="text-error" aria-hidden="true" />
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        <p className="max-w-[300px] text-[14px] leading-6 text-text-secondary">{message}</p>

        <div className="mt-2 flex w-full max-w-[300px] flex-col gap-2">
          {onRetry && (
            <ScButton type="button" onClick={onRetry} className="min-h-11">
              Try again
            </ScButton>
          )}
          <a
            href={homeHref}
            className="flex min-h-11 items-center justify-center rounded-[10px] border border-border text-[14px] font-semibold text-text-primary transition-colors hover:bg-surface"
          >
            {homeLabel}
          </a>
        </div>

        {children && <div className="w-full max-w-[300px] pt-4">{children}</div>}

        {reference && (
          <p className="pt-2 text-[11px] text-text-muted">Reference {reference}</p>
        )}
      </div>
    </div>
  )
}
