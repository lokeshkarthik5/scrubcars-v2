'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Vendor } from '@repo/core/types'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { isCitywide, useLocationStore } from '@repo/core/stores/location-store'
import { usePickupFeeConfig } from '@repo/core/api/hooks/use-pickup-fee'
import { garagePageFeeLine } from '@repo/core/pickup-fee'
import { addressPickupFee, askSuggestion, noPickupTitle } from '@repo/core/pickup-fee-customer'
import { askSuggestionLine } from '@repo/core/pickup-fee'
import { requestActionLabel } from '@repo/core/booking-requests'
import { insidePickupReach } from '@repo/core/pickup'
import { RequestSheet } from '@/components/reach/request-sheet'
import { useT } from '@repo/core/i18n'

/** Where the fee is worked out for: the customer's default pinned address, else where they browse from. */
export function useCustomerPin(): { lat: number; lng: number; label: string | null } | null {
  const user = useAuthStore((s) => s.user)
  const addresses = useUserStore((s) => s.addresses)
  const fetchAddresses = useUserStore((s) => s.fetchAddresses)
  const location = useLocationStore((s) => s.location)
  useEffect(() => {
    if (user) void fetchAddresses().catch(() => undefined)
  }, [user, fetchAddresses])
  return useMemo(() => {
    const pinned = user ? addresses.filter((a) => a.lat !== null && a.lng !== null) : []
    const home = pinned.find((a) => a.isDefault) ?? pinned[0]
    if (home) return { lat: home.lat!, lng: home.lng!, label: home.label || null }
    if (location && !isCitywide(location)) return { lat: location.lat, lng: location.lng, label: null }
    return null
  }, [user, addresses, location])
}

/**
 * The line under the mode switch on Pickup & drop (0079): "Pickup & drop
 * ₹99 to Home (6.2 km by road). Velan Car Care collects your car…", or
 * today's "Free pickup & drop: …" when the garage chose Free.
 */
export function GaragePickupLine({ vendor }: { vendor: Vendor }) {
  const t = useT()
  const pin = useCustomerPin()
  const what = t('{name} collects your car from your address, works on it at the garage and brings it back.', {
    name: vendor.name,
  })
  const plan = vendor.pickupFee
  const trip = pin ? addressPickupFee(plan, vendor, pin) : null
  const fee = plan?.mode === 'fixed' && !trip ? Math.round(plan.fixed) : (trip?.fee ?? null)

  if (!plan || plan.mode === 'free' || fee === 0) {
    return (
      <p className="mt-2.5 text-t5 font-medium leading-relaxed text-[#8E8E98]" data-pickup-fee-line="">
        {t('Free pickup & drop: {name} collects your car from your address, works on it at the garage and brings it back.', { name: vendor.name })}
      </p>
    )
  }
  if (fee === null) {
    return (
      <p className="mt-2.5 text-t5 font-medium leading-relaxed text-[#8E8E98]" data-pickup-fee-line="">
        {t('Pickup & drop: the fee depends on your address.')} {what}
      </p>
    )
  }
  const line = garagePageFeeLine({ fee, roadKm: trip?.roadKm ?? null, placeLabel: pin?.label ?? null })
  return (
    <p className="mt-2.5 text-t5 font-medium leading-relaxed text-[#8E8E98]" data-pickup-fee-line="">
      <span className="text-text-primary">
        {line.lead} {line.amount}
      </span>
      {line.rest} {what}
    </p>
  )
}

/**
 * "Murugan Motors doesn't collect cars yet / Ask them to collect yours…
 * [Ask for pickup]" (0079): on a garage that doesn't collect, and on one
 * whose pickup area stops short of the customer. Opens today's request
 * sheet in Ask for pickup mode.
 */
export function AskForPickupCard({ vendor, outside }: { vendor: Vendor; outside?: boolean }) {
  const t = useT()
  const pin = useCustomerPin()
  const config = usePickupFeeConfig()
  const [open, setOpen] = useState(false)
  const suggestion = config.data && pin ? askSuggestion(config.data, vendor, pin) : null
  const label = requestActionLabel('pickup')
  return (
    <section className="hub-card mt-4 flex flex-col gap-2 p-4" aria-labelledby="ask-for-pickup" data-ask-for-pickup="">
      <h2 id="ask-for-pickup" className="text-t2 font-medium text-text-primary">
        {outside ? t('Your address is outside their pickup area') : noPickupTitle(vendor.name)}
      </h2>
      <p className="text-t4 leading-relaxed text-text-secondary">
        {suggestion ? askSuggestionLine(suggestion.suggested, suggestion.roadKm) : t('Ask them to collect yours. The garage confirms the fee. Free to ask.')}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('{label} from {name}', { label, name: vendor.name })}
        className="press mt-1 flex min-h-11 items-center self-start rounded-full bg-brand-white px-4 text-[14px] font-medium text-brand-black"
      >
        {label}
      </button>
      {open && (
        <RequestSheet open={open} onClose={() => setOpen(false)} garage={{ vendor, coverKm: null, outsideKm: 0 }} mode="pickup" />
      )}
    </section>
  )
}

/**
 * Where the garage page offers Ask for pickup: a garage that doesn't collect
 * cars (with a pin to measure from), or, on Pickup & drop, one whose area
 * stops short of the customer's address. Nothing otherwise.
 */
export function GaragePickupAsk({ vendor, mode }: { vendor: Vendor; mode: string }) {
  const pin = useCustomerPin()
  if (vendor.lat == null || vendor.lng == null || vendor.bookingsPaused) return null
  if (!vendor.pickupEnabled) return <AskForPickupCard vendor={vendor} />
  if (mode === 'pickup' && pin && insidePickupReach(vendor, pin) === false) return <AskForPickupCard vendor={vendor} outside />
  return null
}
