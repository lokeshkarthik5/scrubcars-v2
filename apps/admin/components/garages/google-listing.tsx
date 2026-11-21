'use client'

import { useEffect, useId, useState } from 'react'
import { toast } from 'react-toastify'
import { IconLink, IconPencil, IconSearch, IconUnlink } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScModal } from '@repo/ui/sc/modal'
import { GoogleMapsText, GoogleMark } from '@repo/ui/sc/rating-marks'
import type { AdminVendor } from '@repo/core/api/admin'
import type { AdminGooglePlace } from '@repo/core/api/admin-google'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useLinkGarageGoogle,
  useSearchGarageGoogle,
  useUnlinkGarageGoogle,
} from '@repo/core/api/hooks/use-admin-vendors'
import { cn } from '@repo/core/utils'
import { SignedAs } from '@/components/signed-as'
import { SidePanelSection } from '@/components/table'
import {
  customersLine,
  defaultGoogleSearch,
  fromPin,
  linkedLine,
  placeBlocked,
  readLine,
} from '@/lib/google-listing'
import { garageArea } from '@/lib/vendor-list'

const ACTION =
  'inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-text-primary hover:bg-surface-elevated disabled:opacity-50'

/**
 * The garage side panel's "Google listing" (Google rating for new garages,
 * 21 Nov 2026): the listing as Google has it, its rating with the G and the
 * words "Google Maps" (as in the app), when Detlio last read it and reads it
 * next, whether customers see it now, and Change / Unlink. With none, "Link
 * to Google listing". No link out to Google anywhere.
 */
export function GoogleListingSection({ vendor: v }: { vendor: AdminVendor }) {
  const [linking, setLinking] = useState(false)
  const unlink = useUnlinkGarageGoogle(v.id)
  // An API older than this feature sends no `google`: nothing to show.
  if (v.google === undefined) return null
  const listing = v.google
  const inBin = v.deletedAt != null

  const doUnlink = () => {
    unlink.mutate(undefined, {
      onSuccess: () => toast.success(`${v.businessName} is no longer linked to Google.`),
      onError: (error) => toast.error(errorMessage(error, 'Could not unlink. Try again.')),
    })
  }

  return (
    <SidePanelSection title="Google listing">
      {listing ? (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-text-primary">
            <IconLink size={14} aria-hidden="true" className="shrink-0 text-text-secondary" />
            <span className="min-w-0 truncate">{listing.name ?? 'Listing details expired'}</span>
          </p>
          {listing.address && (
            <p className="text-[12px] text-text-secondary">{listing.address} (as Google lists it)</p>
          )}
          {listing.google && (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-text-secondary">
              <GoogleMark size={13} />
              <span className="font-numeric font-semibold text-text-primary">
                {listing.google.rating.toFixed(1)}
              </span>
              <span>
                · <span className="font-numeric">{listing.google.reviewCount}</span>{' '}
                {listing.google.reviewCount === 1 ? 'review' : 'reviews'}
              </span>
              <GoogleMapsText className="ml-1" />
            </p>
          )}
          <p className="text-[12px] text-text-muted">{readLine(listing)}</p>
          <CustomersLine listing={listing} />
          <p className="text-[12px] text-text-muted">{linkedLine(listing)}</p>
          {!inBin && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={ACTION} onClick={() => setLinking(true)}>
                <IconPencil size={14} aria-hidden="true" />
                Change
              </button>
              <button type="button" className={ACTION} disabled={unlink.isPending} onClick={doUnlink}>
                <IconUnlink size={14} aria-hidden="true" />
                {unlink.isPending ? 'Unlinking…' : 'Unlink'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] text-text-secondary">
            Not linked. Customers see “New” until it has Detlio reviews.
          </p>
          {!inBin && (
            <button type="button" className={cn(ACTION, 'self-start')} onClick={() => setLinking(true)}>
              <IconLink size={14} aria-hidden="true" />
              Link to Google listing
            </button>
          )}
        </div>
      )}
      {linking && <LinkGoogleDialog vendor={v} onClose={() => setLinking(false)} />}
    </SidePanelSection>
  )
}

function CustomersLine({ listing }: { listing: NonNullable<AdminVendor['google']> }) {
  const line = customersLine(listing)
  return (
    <p className="text-[12px] text-text-secondary">
      <span className={line.shown ? 'font-medium text-success' : 'font-medium text-text-primary'}>{line.lead}</span>
      {line.rest}
    </p>
  )
}

/**
 * "Link <garage> to Google": Google's places for the garage's name near its
 * pin, nearest first, each with its address and rating so the right one is
 * easy to spot. One search when it opens; another only when asked (each is a
 * paid Google call).
 */
function LinkGoogleDialog({ vendor: v, onClose }: { vendor: AdminVendor; onClose: () => void }) {
  const search = useSearchGarageGoogle(v.id)
  const link = useLinkGarageGoogle(v.id)
  const [text, setText] = useState(() => defaultGoogleSearch(v.businessName, garageArea(v)))
  const [picked, setPicked] = useState<string | null>(null)
  const inputId = useId()
  const listId = useId()

  const run = (words: string) => {
    setPicked(null)
    search.mutate(words.trim().length >= 2 ? words.trim() : undefined)
  }
  // The first search, as the dialog opens, for the garage's name and area.
  const { mutate: searchNow } = search
  const [firstWords] = useState(text)
  useEffect(() => {
    searchNow(firstWords.length >= 2 ? firstWords : undefined)
  }, [searchNow, firstWords])

  const places = search.data?.places ?? []
  const choose = () => {
    if (!picked) return
    link.mutate(picked, {
      onSuccess: () => {
        toast.success(`${v.businessName} is linked to its Google listing.`)
        onClose()
      },
    })
  }

  return (
    <ScModal
      open
      onClose={onClose}
      dismissible={!link.isPending}
      aria-label={`Link ${v.businessName} to Google`}
      className="flex max-w-[520px] flex-col gap-3"
    >
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Link {v.businessName} to Google</h2>
        <p className="mt-1 text-[12px] text-text-secondary">
          Pick the garage’s own listing. Its Google rating shows to customers until it has 5 Detlio reviews.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          run(text)
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Search Google for
        </label>
        <input
          id={inputId}
          value={text}
          maxLength={80}
          onChange={(event) => setText(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 text-[13px] text-text-primary"
        />
        <button type="submit" className={ACTION} disabled={search.isPending}>
          <IconSearch size={14} aria-hidden="true" />
          {search.isPending ? 'Searching…' : 'Search'}
        </button>
      </form>

      <p id={listId} className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        Found on Google, nearest the garage’s pin
      </p>
      {search.isError && (
        <p role="alert" className="text-[12px] text-error">
          {errorMessage(search.error, 'Could not search Google. Try again.')}
        </p>
      )}
      {search.isSuccess && places.length === 0 && (
        <p className="text-[12.5px] text-text-secondary">Nothing found near the pin. Try other words.</p>
      )}
      {places.length > 0 && (
        <div role="radiogroup" aria-labelledby={listId} className="flex flex-col gap-2">
          {places.map((place) => (
            <PlaceOption
              key={place.placeId}
              place={place}
              checked={picked === place.placeId}
              onPick={() => setPicked(place.placeId)}
            />
          ))}
        </div>
      )}

      {link.isError && (
        <p role="alert" className="text-[12px] text-error">
          {errorMessage(link.error, 'Could not link. Try again.')}
        </p>
      )}
      <SignedAs />
      <div className="flex justify-end gap-2">
        <ScButton variant="secondary" onClick={onClose} disabled={link.isPending} className="min-h-11">
          Cancel
        </ScButton>
        <ScButton onClick={choose} disabled={!picked || link.isPending} className="min-h-11">
          {link.isPending ? 'Linking…' : 'Link'}
        </ScButton>
      </div>
    </ScModal>
  )
}

function PlaceOption({
  place,
  checked,
  onPick,
}: {
  place: AdminGooglePlace
  checked: boolean
  onPick: () => void
}) {
  const blocked = placeBlocked(place)
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-start gap-3 rounded-[12px] border px-3 py-2.5',
        checked ? 'border-white/40 bg-surface-elevated' : 'border-border',
        blocked && 'cursor-not-allowed opacity-60'
      )}
    >
      <input
        type="radio"
        name="google-place"
        value={place.placeId}
        checked={checked}
        disabled={blocked !== null}
        onChange={onPick}
        className="mt-1 size-4 shrink-0 accent-white"
        aria-label={place.name}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-text-primary">{place.name}</span>
        {place.address && <span className="block text-[12px] text-text-secondary">{place.address}</span>}
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-secondary">
          {place.rating !== null ? (
            <>
              <GoogleMark size={12} />
              <span className="font-numeric">{place.rating.toFixed(1)}</span>
              {place.reviewCount !== null && (
                <span>
                  · <span className="font-numeric">{place.reviewCount}</span> reviews
                </span>
              )}
            </>
          ) : (
            <span>No rating on Google</span>
          )}
          <span className={cn(place.distanceM < 500 && 'text-success')}>· {fromPin(place.distanceM)}</span>
        </span>
        {place.current && <span className="mt-0.5 block text-[12px] text-text-muted">Linked to this garage now</span>}
        {blocked && <span className="mt-0.5 block text-[12px] text-warning">{blocked}</span>}
        {place.onLead && (
          <span className="mt-0.5 block text-[12px] text-text-muted">
            On the lead “{place.onLead.name}” in Coverage: linking makes it this garage’s lead
          </span>
        )}
      </span>
      {/* Google's attribution with the place's rating. */}
      {place.rating !== null && <GoogleMapsText className="mt-1 shrink-0" />}
    </label>
  )
}
