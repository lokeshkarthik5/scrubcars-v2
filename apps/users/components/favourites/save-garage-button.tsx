'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'react-toastify'
import { IconHeart, IconHeartFilled } from '@tabler/icons-react'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScSheet } from '@repo/ui/sc/modal'
import { ApiError } from '@repo/core/api/client'
import { useSavedGarages, useToggleSavedGarage } from '@repo/core/api/hooks/use-favourites'
import { useAuthStore } from '@repo/core/stores/auth-store'
import type { Vendor } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { saveGarageReturnPath } from '@/lib/saved-garages'

/**
 * The heart on a garage: on the list's cards and on the garage page's photo,
 * where the old unsaved one sat (top right, a dark disc over the photo).
 * White when saved, outlined when not: a state, not a thing to press, and
 * red on these screens belongs to Book.
 *
 * It changes at once and goes back if the server says no. Signed out, it
 * asks to sign in first, and the sign-in comes back to this garage with the
 * heart saved (`?save=1`, which the garage page acts on).
 */
export function SaveGarageButton({ vendor, className }: { vendor: Vendor; className?: string }) {
  const user = useAuthStore((s) => s.user)
  const ready = useAuthStore((s) => s.isSessionReady)
  const saved = useSavedGarages({ enabled: !!user })
  const toggle = useToggleSavedGarage()
  const [askSignIn, setAskSignIn] = useState(false)
  // The sheet is drawn on <body>: on a list card it would otherwise sit
  // inside the card's reveal animation, whose transform pins a fixed sheet
  // to the card. Only after a press, so nothing is portalled while hydrating.
  const [everAsked, setEverAsked] = useState(false)

  const isSaved = !!user && (saved.data?.vendors.some((v) => v.id === vendor.id) ?? false)

  const press = () => {
    if (!user) {
      setEverAsked(true)
      setAskSignIn(true)
      return
    }
    if (!saved.data) return
    const save = !isSaved
    toggle.mutate(
      { vendor, save },
      {
        onError: (err) => {
          toast.error(
            err instanceof ApiError && err.code === 'FAVOURITES_LIMIT'
              ? err.message
              : save
                ? "Couldn't save this garage. Try again."
                : "Couldn't remove this garage. Try again."
          )
        },
      }
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // It sits over a card that is itself a link.
          e.preventDefault()
          e.stopPropagation()
          press()
        }}
        // Until the session is known, and (signed in) until the saved list
        // is in: a press before then could undo a save it cannot see.
        disabled={!ready || (!!user && !saved.data)}
        aria-pressed={isSaved}
        aria-label={isSaved ? `Remove ${vendor.name} from saved garages` : `Save ${vendor.name}`}
        className={cn(
          // 44px: the disc is the whole target.
          'press flex size-11 items-center justify-center rounded-full bg-black/45 text-brand-white backdrop-blur-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-white/80',
          className
        )}
      >
        {isSaved ? <IconHeartFilled size={20} aria-hidden /> : <IconHeart size={20} aria-hidden />}
      </button>

      {everAsked &&
        createPortal(
          <ScSheet
            open={askSignIn}
            onClose={() => setAskSignIn(false)}
            aria-label="Sign in to save garages"
            className="px-4 pt-1"
          >
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Sign in to save garages</h2>
                <p className="mt-1 text-[13px] text-text-secondary">
                  Saved garages are kept on your account, under Profile. Signing in brings you back to{' '}
                  {vendor.name} with it saved.
                </p>
              </div>
              {/* The sheet's one red: signing in is what it asks. */}
              <ScButtonLink
                href={`/login?next=${encodeURIComponent(saveGarageReturnPath(vendor.id))}`}
                fullWidth
                className="min-h-12"
              >
                Sign in
              </ScButtonLink>
              <button
                type="button"
                onClick={() => setAskSignIn(false)}
                className="min-h-11 text-[13px] font-medium text-text-secondary"
              >
                Not now
              </button>
            </div>
          </ScSheet>,
          document.body
        )}
    </>
  )
}
