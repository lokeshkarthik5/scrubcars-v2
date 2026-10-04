import { IconPhone } from '@tabler/icons-react'
import { telHref } from '@repo/core/contact-links'
import { cn } from '@repo/core/utils'

/**
 * A phone number ops can tap to call — from a phone on the move, or through
 * a desktop's dialler app. Falls back to plain text when the number can't be
 * dialled, rather than offering a link that opens an error.
 *
 * `relative z-10` lifts it above a card's stretched link, and the 44px
 * minimum height keeps it a real touch target inside a dense row.
 */
export function PhoneLink({
  phone,
  name,
  className,
}: {
  phone: string
  /**
   * Whose number it is, for the accessible name: "Call Marina Auto Spa,
   * 9876543210". The number stays in the name so a screen reader still reads
   * it out, and a voice-control user can say the number they see.
   */
  name: string
  className?: string
}) {
  const href = telHref(phone)
  if (!href)
    return <span className={cn('font-numeric', className)}>{phone}</span>

  return (
    <a
      href={href}
      aria-label={`Call ${name}, ${phone}`}
      className={cn(
        'relative z-10 inline-flex min-h-11 items-center gap-1 font-numeric text-text-primary underline-offset-2 hover:underline',
        className
      )}
    >
      <IconPhone size={13} aria-hidden className="shrink-0 text-text-muted" />
      {phone}
    </a>
  )
}
