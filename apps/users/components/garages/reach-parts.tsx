'use client'

import Link from 'next/link'
import {
  IconArrowRight,
  IconCamera,
  IconChevronRight,
  IconKey,
  IconShieldCheck,
} from '@tabler/icons-react'
import { VendorCard } from '@repo/ui/features/vendor-card'
import { bookingTypeParam } from '@repo/core/booking-types'
import type { JustOutsideVendor } from '@repo/core/api/vendors'
import {
  outsideLine,
  skipTheDriveTitle,
  type NextTabOffer,
  type SkipTheDriveRow,
} from '@repo/core/reach'
import type { BookingType } from '@repo/core/types'
import { FreeWashSlot, RequestActionSlot } from './reach-slots'

/**
 * The garage list's "never empty" pieces (customer reach, 0062). Every piece
 * is something to tap; none of them switches a tab by itself. The rules for
 * when each shows are in @repo/core/reach (unit-tested).
 */

/**
 * At garage, when the nearest garage is 10 km or more: what can be done
 * without driving, with real counts. Each row switches to its tab.
 */
export function SkipTheDriveCard({
  rows,
  nearestKm,
  onSwitch,
}: {
  rows: SkipTheDriveRow[]
  nearestKm: number | null
  onSwitch: (mode: BookingType) => void
}) {
  return (
    <section
      aria-labelledby="skip-the-drive"
      className="flex flex-col gap-3 rounded-[18px] border border-[#2B4A7A] bg-[#0E1A2E] p-4"
    >
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#8FB4F0]">
          Skip the drive
        </p>
        <h2 id="skip-the-drive" className="mt-1.5 text-[17px] font-medium text-text-primary">
          {skipTheDriveTitle(nearestKm)}
        </h2>
        <p className="mt-0.5 text-[13px] text-text-secondary">Get it done without driving:</p>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.mode}>
            <button
              type="button"
              onClick={() => onSwitch(row.mode)}
              className="press flex min-h-14 w-full items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-text-primary">{row.title}</span>
                <span className="block text-[12px] text-text-secondary">{row.detail}</span>
              </span>
              <IconChevronRight size={18} aria-hidden className="shrink-0 text-text-secondary" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** At garage, nearest 5–10 km, and a doorstep garage comes to them. */
export function AtHomeLine({ onSwitch }: { onSwitch: () => void }) {
  return (
    <button
      type="button"
      onClick={onSwitch}
      className="flex min-h-11 items-center gap-1 self-start text-[13px] text-text-secondary"
    >
      or have it done at home
      <IconArrowRight size={14} aria-hidden />
    </button>
  )
}

/** "Can collect your car" on an at-garage card whose pickup reaches the customer. */
export function CanCollectChip() {
  return (
    <span className="rounded-md bg-[#13233D] px-2 py-0.5 text-[12px] font-medium text-[#8FB4F0]">
      Can collect your car
    </span>
  )
}

/**
 * The Pickup & drop tab's explainer. Every line is what the product does
 * today (pickup & drop, 0037; car photos, 0045): the customer hands the car
 * over with a code and gets it back with a second one, follows each step on
 * the booking, may add their own photos before pickup, and the garage
 * accepted responsibility for the car when it turned pickup on. Garages are
 * only nudged to take before/after photos during the pilot
 * (JOB_PHOTOS_REQUIRED is off), so photos at handover are not promised.
 */
export function PickupExplainer() {
  const steps = [
    'Collected from your address. You hand it over with a code from the app.',
    'Worked on at the garage. Follow each step on your booking, from picked up to on its way back.',
    'Brought back to the same address, handed over with a second code.',
  ]
  return (
    <section aria-labelledby="pickup-explainer" className="hub-card flex flex-col gap-3 p-4">
      <h2 id="pickup-explainer" className="text-[17px] font-medium text-text-primary">
        They collect, you relax
      </h2>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-3 text-[13px] leading-snug text-text-secondary">
            <span
              aria-hidden
              className="grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.08] font-numeric text-[11px] text-text-primary"
            >
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <ul aria-label="Why it is safe" className="flex flex-wrap gap-1.5">
        <li className="flex items-center gap-1 rounded-md bg-success-muted px-2 py-1 text-[12px] text-success">
          <IconShieldCheck size={13} aria-hidden />
          Garage responsible for your car
        </li>
        <li className="flex items-center gap-1 rounded-md bg-success-muted px-2 py-1 text-[12px] text-success">
          <IconKey size={13} aria-hidden />
          Handover codes both ways
        </li>
        <li className="flex items-center gap-1 rounded-md bg-success-muted px-2 py-1 text-[12px] text-success">
          <IconCamera size={13} aria-hidden />
          Add your own photos before pickup
        </li>
      </ul>
    </section>
  )
}

/**
 * Doorstep and Pickup & drop: garages whose reach stops short of the
 * customer, within 15 km past it. Each shows its reach and how far out the
 * customer is, "See prices" (its page), and part 2's request button beside
 * it (RequestActionSlot).
 */
export function JustOutsideSection({
  items,
  mode,
}: {
  items: JustOutsideVendor[]
  mode: Extract<BookingType, 'doorstep' | 'pickup'>
}) {
  const modeParam = bookingTypeParam(mode)
  return (
    <section aria-labelledby="just-outside" className="flex flex-col gap-3 pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="just-outside" className="text-[17px] font-medium text-text-primary">
          Just outside their area
        </h2>
        <span className="text-[12px] text-text-muted">by distance</span>
      </div>
      {items.map((item) => (
        <div key={item.vendor.id} data-garage-card="" data-just-outside="">
          <VendorCard
            vendor={item.vendor}
            mode={mode}
            chips={
              <span className="text-[12px] font-medium text-warning">
                {outsideLine(item.coverKm, item.outsideKm)}
              </span>
            }
            footer={
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={`/garage/${item.vendor.id}${modeParam ? `?mode=${modeParam}` : ''}`}
                  className="press flex min-h-11 items-center rounded-full border border-stroke px-4 text-[14px] text-text-primary"
                  aria-label={`See prices at ${item.vendor.name}`}
                >
                  See prices
                </Link>
                <RequestActionSlot garage={item} mode={mode} />
              </div>
            }
          />
        </div>
      ))}
    </section>
  )
}

/**
 * The bottom of every tab: the next way to have it done. At garage → "Have
 * it done at home", Doorstep → "We collect your car", Pickup & drop → part
 * 2's free wash (FreeWashSlot). A tab with no garages for the customer is
 * never offered.
 */
export function NextTabFooter({
  mode,
  offer,
  onSwitch,
}: {
  mode: BookingType
  offer: NextTabOffer | null
  onSwitch: (mode: BookingType) => void
}) {
  if (mode === 'pickup') return <FreeWashSlot />
  if (!offer) return null
  return (
    <button
      type="button"
      onClick={() => onSwitch(offer.mode)}
      className="press mt-1 flex min-h-14 w-full items-center gap-3 rounded-[16px] border border-dashed border-stroke px-4 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-text-muted">Nothing here suits you?</span>
        <span className="block text-[15px] text-text-primary">{offer.label}</span>
      </span>
      <IconArrowRight size={18} aria-hidden className="shrink-0 text-text-secondary" />
    </button>
  )
}
