'use client'

import { IconMapPin, IconRoute, IconSparkles } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import { useLocationStore } from '@repo/core/stores/location-store'

/**
 * Asks for location in our own words before the browser asks in its.
 *
 * The browser's permission prompt gives no reason and offers no second chance:
 * a denial is sticky, and getting it reversed means talking someone through
 * site settings. So the cost of prompting cold is not a dismissed dialog, it is
 * losing distance sorting for that person more or less permanently.
 *
 * This sheet buys the explanation that makes the real prompt likely to succeed,
 * and "Not now" costs nothing — it is a dismissal of our sheet, not of the
 * browser's, so we can ask again later.
 */

interface LocationPromptSheetProps {
  open: boolean
  onClose: () => void
  /** Called once a fix actually arrives, so the caller can refresh its list. */
  onEnabled?: () => void
}

const REASONS = [
  {
    icon: IconRoute,
    title: 'Real distances',
    body: 'See how far each garage actually is, not just its area.',
  },
  {
    icon: IconSparkles,
    title: 'Nearest first',
    body: 'Sort by what is closest instead of scrolling to find it.',
  },
  {
    icon: IconMapPin,
    title: 'Doorstep that reaches you',
    body: 'Only show garages that travel to your address.',
  },
]

export function LocationPromptSheet({
  open,
  onClose,
  onEnabled,
}: LocationPromptSheetProps) {
  const requestGpsLocation = useLocationStore((s) => s.requestGpsLocation)
  const selectChennai = useLocationStore((s) => s.selectChennai)
  const locating = useLocationStore((s) => s.locating)
  const permission = useLocationStore((s) => s.permission)
  const dismiss = useLocationStore((s) => s.dismissPrompt)

  // Already refused at the browser level. Our sheet cannot reopen that prompt,
  // so offering a button that silently does nothing would be a lie — say where
  // the setting lives instead.
  const blocked = permission === 'denied'

  const enable = async () => {
    const location = await requestGpsLocation()
    if (location) onEnabled?.()
    // Closes either way. On a denial the store records it and the caller stops
    // offering this sheet, rather than asking again into a prompt that will
    // never appear.
    onClose()
  }

  const notNow = () => {
    dismiss()
    onClose()
  }

  const chooseCity = () => {
    selectChennai()
    onClose()
  }

  return (
    <ScSheet open={open} onClose={notNow} aria-label="Enable location">
      <div className="flex flex-col gap-5 px-5 pb-2 pt-1">
        {/* Graphite and white throughout, so the one red on the sheet is
            Enable location, the thing it is asking the customer to do. */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated">
            <IconMapPin size={24} className="text-text-primary" />
          </span>
          <h2 className="text-[20px] font-normal tracking-[-0.015em] text-text-primary">
            {blocked ? 'Location is blocked' : 'Find garages near you'}
          </h2>
          <p className="text-[15px] text-text-secondary">
            {blocked
              ? 'Your browser is blocking location for this site. You can turn it back on in the address bar, under site settings.'
              : 'Share your location and we’ll show the closest garages first, with real distances.'}
          </p>
        </div>

        {!blocked && (
          <ul className="flex flex-col gap-3">
            {REASONS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-surface">
                  <Icon size={15} className="text-text-primary" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-text-primary">
                    {title}
                  </span>
                  <span className="block text-[13px] text-text-secondary">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* One red button (the customer UX audit, F14): the main pill for
            what the sheet asks, an outline for the city, and "Not now" as
            white text. Blocked, the city is the only way on, so it leads. */}
        <div className="flex flex-col gap-2">
          {!blocked && (
            <ScButton variant="main" onClick={enable} disabled={locating}>
              {locating ? 'Finding you…' : 'Enable location'}
            </ScButton>
          )}
          <ScButton variant={blocked ? 'main' : 'outline'} onClick={chooseCity}>
            All of Chennai
          </ScButton>
          {!blocked && (
            <ScButton variant="text" onClick={notNow}>
              Not now
            </ScButton>
          )}
        </div>

        {!blocked && (
          // Sets expectations for the dialog that appears next, so the browser
          // prompt reads as the consequence of tapping rather than an ambush.
          <p className="text-center text-[12px] text-text-muted">
            Enable location asks your browser. We only use it to sort garages —
            it is never shared.
          </p>
        )}
      </div>
    </ScSheet>
  )
}
