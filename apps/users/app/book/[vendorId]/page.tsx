'use client'

import { use, useEffect, useRef, useState, Suspense } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  IconChevronRight,
  IconPercentage,
  IconPlus,
  IconShoppingCart,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { AddCarSheet } from '@repo/ui/features/add-car-sheet'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ScSheet } from '@repo/ui/sc/modal'
import { Reveal } from '@repo/ui/sc/reveal'
import { SlotPicker } from '@repo/ui/sc/slot-picker'
import { ScToggle } from '@repo/ui/sc/toggle'
import { TopBar } from '@repo/ui/sc/top-bar'
import type { AppliedDiscount } from '@repo/core/api/discounts'
import {
  errorMessage,
  useValidateDiscount,
} from '@repo/core/api/hooks/use-discounts'
import { createBookingIntent, verifyPayment } from '@repo/core/api/payments'
import { ApiError } from '@repo/core/api/client'
import { getVendorServices } from '@repo/core/api/services'
import { getVendor } from '@repo/core/api/vendors'
import { openRazorpayCheckout } from '@repo/core/razorpay'
import { useUserStore } from '@repo/core/stores/user-store'
import type { Service, Vendor } from '@repo/core/types'
import { formatServicePrice, resolveServiceAmount } from '@repo/core/pricing'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import { cn, formatDuration } from '@repo/core/utils'

const BOOKING_TYPE_OPTIONS = [
  { value: 'dropin' as const, label: 'Drop In' },
  { value: 'doorstep' as const, label: 'Doorstep' },
]

function BookContent({ vendorId }: { vendorId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const serviceId = searchParams.get('service')
  const vehicles = useUserStore((s) => s.vehicles)
  const profile = useUserStore((s) => s.profile)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  const fetchProfile = useUserStore((s) => s.fetchProfile)

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [pickedVehicle, setPickedVehicle] = useState<string | null>(null)
  const [bookingType, setBookingType] = useState<'dropin' | 'doorstep'>('dropin')
  const [loading, setLoading] = useState(false)
  const bookingLockRef = useRef(false)

  // What is typed vs what is actually applied. Kept apart so a keystroke never
  // re-queries — only pressing Apply does.
  const [promoInput, setPromoInput] = useState('')
  // The coupon field starts closed — a row to tap, not a form to ignore.
  const [promoOpen, setPromoOpen] = useState(false)
  const [addCarOpen, setAddCarOpen] = useState(false)
  // Stored with the service and vehicle it was validated against. Those two
  // decide the subtotal, so a code checked against one pair says nothing about
  // another — see `appliedDiscount` below.
  const [appliedPromo, setAppliedPromo] = useState<{
    discount: AppliedDiscount
    serviceId: string
    vehicleId: string
  } | null>(null)
  // The request lifecycle (pending, error) is the mutation's; `appliedPromo`
  // above is ours, because "which code did the customer commit to" is client
  // state, not a server response.
  const applyPromo = useValidateDiscount()

  useEffect(() => {
    getVendor(vendorId).then((v) => {
      setVendor(v ?? null)
      if (v && !v.dropinEnabled && v.doorstepEnabled) {
        setBookingType('doorstep')
      }
    })
    getVendorServices(vendorId).then((svcs) => {
      // The list itself is never rendered — this screen books one service, so
      // only the selection is kept.
      const preselected = serviceId
        ? svcs.find((s) => s.id === serviceId)
        : svcs[0]
      setSelectedService(preselected ?? null)
    })
    void fetchVehicles()
    void fetchProfile()
  }, [vendorId, serviceId, fetchVehicles, fetchProfile])

  // Auto-select only when there is nothing to choose between. With several
  // cars, preselecting one would make the order summary appear the instant a
  // time was picked — collapsing the "pick your car" step the page is built
  // around. With exactly one car, asking for a tap is pure friction.
  //
  // Derived rather than written back by an effect, for the same reason
  // `appliedDiscount` below is: with one car there is no render where the
  // selection is still empty, and nothing has to re-fire when the car list
  // arrives.
  const selectedVehicle =
    pickedVehicle ?? (vehicles.length === 1 ? vehicles[0].id : null)

  // Derived rather than cleared in an effect: if the customer switches service
  // or car, the applied code is simply not the applied code any more. There is
  // no render in between where a stale discount could be shown or submitted.
  const appliedDiscount =
    appliedPromo &&
    appliedPromo.serviceId === selectedService?.id &&
    appliedPromo.vehicleId === selectedVehicle
      ? appliedPromo.discount
      : null

  const selectedVehicleType = vehicles.find((v) => v.id === selectedVehicle)?.vehicleType
  // The tier drives the price for per-vehicle services, so the summary names
  // it — using the same labels the vendor priced against ("SUV / MUV", not "suv").
  const vehicleTierLabel = VEHICLE_TIERS.find(
    (tier) => tier.value === selectedVehicleType
  )?.label
  // The concrete amount to charge for the selected service/vehicle.
  const resolvedAmount = selectedService
    ? resolveServiceAmount(selectedService, selectedVehicleType)
    : null
  // A per-vehicle service with no price for this vehicle. The server refuses
  // such a booking (it would otherwise bill another vehicle's rate), so block
  // it here rather than letting the customer pay and hit an error.
  const unpricedForVehicle =
    selectedService != null &&
    selectedVehicleType != null &&
    resolvedAmount == null

  // What the customer will actually be charged. The server recomputes this at
  // booking time; this is only what the button says.
  const payableAmount = appliedDiscount
    ? Number(appliedDiscount.finalAmount)
    : resolvedAmount

  const canApplyPromo =
    promoInput.trim().length >= 3 &&
    selectedService != null &&
    selectedVehicle != null &&
    !unpricedForVehicle

  const handleApplyPromo = () => {
    if (!canApplyPromo || applyPromo.isPending) return

    const serviceId = selectedService!.id
    const vehicleId = selectedVehicle!

    applyPromo.mutate(
      { code: promoInput.trim(), vendorId, serviceId, vehicleId },
      {
        onSuccess: (applied) => {
          setAppliedPromo({ discount: applied, serviceId, vehicleId })
          setPromoOpen(false)
        },
        onError: () => setAppliedPromo(null),
      }
    )
  }

  const handleRemovePromo = () => {
    setAppliedPromo(null)
    setPromoInput('')
    applyPromo.reset()
    // Back to the resting row rather than an empty open form; trying another
    // code is one tap away.
    setPromoOpen(false)
  }

  // Derived the same way `appliedDiscount` is, and for the same reason: the
  // failure belongs to the service/vehicle it was submitted against, so
  // changing either retires the message without an imperative reset. The
  // server's wording is the customer-facing reason — "This code has expired",
  // "needs a booking of ₹500 or more" — so it is shown verbatim.
  const promoError =
    applyPromo.error &&
    applyPromo.variables?.serviceId === selectedService?.id &&
    applyPromo.variables?.vehicleId === selectedVehicle
      ? errorMessage(applyPromo.error, "This code isn't valid.")
      : ''

  const handleConfirm = async () => {
    if (bookingLockRef.current || loading) return
    if (!selectedService || !selectedSlot || !selectedVehicle) return
    bookingLockRef.current = true
    setLoading(true)
    try {
      // Nothing is booked yet. The intent is priced and validated server-side,
      // but it holds no slot, no promo code and no claim on the car — so a
      // customer who closes the sheet below leaves the garage none the wiser.
      // verifyPayment is what turns it into a booking.
      const order = await createBookingIntent({
        vendorId,
        serviceId: selectedService.id,
        scheduledAt: selectedSlot,
        bookingType,
        vehicleId: selectedVehicle,
        paymentMethod: 'online',
        discountCode: appliedDiscount?.code,
      })

      await openRazorpayCheckout({
        order,
        description: `${selectedService.name} at ${vendor?.name ?? 'vendor'}`,
        customer: {
          name: profile?.name,
          phone: profile?.phone,
        },
        onSuccess: async (response) => {
          const { bookingId } = await verifyPayment({
            intentId: order.intentId,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          })
          // ?celebrate=1 triggers the success burst on arrival; the booking
          // page strips it once played.
          router.push(`/bookings/${bookingId}?celebrate=1`)
        },
        onDismiss: () => {
          toast.info('Payment cancelled. Nothing was booked.')
        },
        onFailure: (message) => {
          toast.error(message)
        },
      })
    } catch (error) {
      // A code can lapse between Apply and Pay — someone else took the last
      // use, or it expired. Drop it so the retry goes through at full price.
      if (error instanceof ApiError && error.code?.startsWith('DISCOUNT_')) {
        setAppliedPromo(null)
        toast.error(error.message)
      } else if (error instanceof Error && error.message !== 'Payment cancelled') {
        toast.error(error.message)
      }
    } finally {
      bookingLockRef.current = false
      setLoading(false)
    }
  }

  return (
    <AppShell className="gap-7 pb-[calc(8rem_+_env(safe-area-inset-bottom))] pt-0">
      {/* Sticky, not fixed: it keeps its place in the flow so the content
          below needs no compensating offset. Full-bleed via -mx-4 against
          AppShell's px-4, and opaque so rows scroll under it cleanly. */}
      <TopBar
        showBack
        center
        title="Pick a Slot"
        className="sticky top-0 z-30 -mx-4 mb-1 border-b border-border bg-brand-black px-4"
      />

      {/* Identity only — what you're booking and where. Every rupee figure
          lives in the order summary at the bottom, after the choices that
          determine it: a per-vehicle service isn't priced until a car is
          picked, so quoting up here would show a number that later moves. */}
      {selectedService && vendor && (
        <ScCard className="flex items-center gap-3 py-3.5">
          {vendor.logoUrl && (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] border border-border bg-surface-elevated">
              <Image
                src={vendor.logoUrl}
                alt={`${vendor.name} logo`}
                fill
                sizes="40px"
                className="object-cover"
              />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-text-primary">{vendor.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary">
              <IconShoppingCart size={13} />
              {selectedService.name} · {formatDuration(selectedService.durationMins)}
            </p>
          </div>
        </ScCard>
      )}

      {vendor && vendor.dropinEnabled && vendor.doorstepEnabled && (
        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-text-primary">Service type</h2>
          <ScToggle
            options={BOOKING_TYPE_OPTIONS}
            value={bookingType}
            onChange={setBookingType}
          />
        </section>
      )}

      {/* Each step below appears only once the one before it is answered, so
          the page opens as a single question rather than five stacked ones.
          The picker reveals its own time slots after a date is chosen. */}
      <section>
        <SlotPicker
          progressive
          vendorId={vendorId}
          serviceId={selectedService?.id ?? null}
          value={selectedSlot}
          onChange={setSelectedSlot}
        />
      </section>

      {/* Not in the design, but the booking intent requires a vehicleId — the
          booking can't be created without one. */}
      {selectedSlot && (
        <Reveal as="section">
          <h2 className="mb-2 text-[15px] font-semibold text-text-primary">Car details</h2>
          {vehicles.length === 0 ? (
            <ScCard className="flex flex-col items-start gap-2 border-warning bg-warning-muted/20">
              <p className="text-[13px] font-medium text-text-primary">
                Add a car to continue
              </p>
              <p className="text-[12px] text-text-secondary">
                We need to know which car we&apos;re washing — pricing can
                differ by type.
              </p>
              <ScButton
                fullWidth={false}
                variant="secondary"
                onClick={() => setAddCarOpen(true)}
                className="mt-1 flex items-center gap-1 px-3 py-1.5 text-[12px]"
              >
                <IconPlus size={14} /> Add a car
              </ScButton>
            </ScCard>
          ) : (
            <div className="flex flex-col gap-2">
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setPickedVehicle(v.id)}
                >
                  <ScCard className={cn(selectedVehicle === v.id && 'border-brand-red')}>
                    <p className="text-[13px] font-medium">{v.make} {v.model}</p>
                    <p className="text-[11px] text-text-secondary">{v.plate}</p>
                  </ScCard>
                </button>
              ))}
              {/* In place, not a link to /profile: leaving the page would
                  discard the slot and any applied code. */}
              <button
                type="button"
                onClick={() => setAddCarOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-border py-3 text-[12px] font-medium text-text-secondary transition-colors hover:border-brand-red hover:text-brand-red"
              >
                <IconPlus size={14} /> Add another car
              </button>
            </div>
          )}
        </Reveal>
      )}

      {/* Coupons, then the payment summary — the Urban Company cart shape.
          Coupons is a row you tap rather than a form that is always open, and
          the saving reads as a strike-through on the line it applies to
          instead of its own subtotal/discount block. With a single service
          that says the same thing in two rows fewer. */}
      {selectedService && selectedSlot && selectedVehicle && (
        <Reveal as="section" className="flex flex-col gap-4">
          <ScCard className="py-3.5">
            {appliedDiscount ? (
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-success-muted text-success">
                    <IconPercentage size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {appliedDiscount.code} applied
                    </p>
                    <p className="text-[11px] text-success">
                      You save ₹
                      {Number(appliedDiscount.discountAmount).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePromo}
                  className="shrink-0 text-[12px] font-medium text-brand-red"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setPromoOpen(true)}
                  className="flex w-full items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex size-6 items-center justify-center rounded-full bg-success-muted text-success">
                      <IconPercentage size={14} />
                    </span>
                    <span className="text-[13px] font-medium text-text-primary">
                      Coupons and offers
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-brand-red">
                    Apply
                    <IconChevronRight size={14} />
                  </span>
                </button>

              </>
            )}
          </ScCard>

          <div>
            <h2 className="mb-2 text-[15px] font-semibold text-text-primary">
              Payment summary
            </h2>
            <ScCard className="flex flex-col gap-3 py-3.5">
              <div className="flex items-start justify-between gap-3 text-[13px]">
                <span className="min-w-0 text-text-secondary">
                  {selectedService.name}
                  {vehicleTierLabel && (
                    <span className="text-text-muted"> · {vehicleTierLabel}</span>
                  )}
                </span>
                <span className="shrink-0 font-medium text-text-primary">
                  {unpricedForVehicle
                    ? '—'
                    : formatServicePrice(selectedService, selectedVehicleType)}
                </span>
              </div>

              {/* Spelled out rather than folded into a struck-through price:
                  the discount can be most of the bill, and the customer should
                  see the arithmetic that produced what they are about to pay. */}
              {appliedDiscount && (
                <div className="flex items-start justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-success">
                    Discount ({appliedDiscount.code})
                  </span>
                  <span className="shrink-0 font-medium text-success">
                    −₹{Number(appliedDiscount.discountAmount).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3 text-[15px] font-semibold text-text-primary">
                <span>Amount to pay</span>
                <span>
                  {payableAmount == null
                    ? '—'
                    : `₹${payableAmount.toLocaleString('en-IN')}`}
                </span>
              </div>
            </ScCard>

            {/* Mirrors what the server actually enforces: CANCELLATION_CUTOFF_MS
                and MAX_RESCHEDULES in bookings.service.ts. Deliberately silent
                on refunds — there is no refund path in the code yet, so
                promising one here would be a claim the product can't keep. */}
            <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
              <span className="font-medium text-text-secondary">
                Cancellation policy:
              </span>{' '}
              Cancel or reschedule up to 2 hours before your slot. A booking can
              be rescheduled up to 2 times.
            </p>
          </div>
        </Reveal>
      )}

      {/* Coupon entry as a sheet rather than an inline expander: it keeps the
          summary from reflowing under the customer, and gives the field room
          plus a keyboard without the page jumping. */}
      <AddCarSheet
        open={addCarOpen}
        onClose={() => setAddCarOpen(false)}
        onAdded={(vehicle) => setPickedVehicle(vehicle.id)}
      />

      <ScSheet
        open={promoOpen}
        onClose={() => setPromoOpen(false)}
        dismissible={!applyPromo.isPending}
        aria-label="Coupons and offers"
        className="px-4"
      >
        <h2 className="text-[19px] font-semibold text-text-primary">
          Coupons &amp; Offers
        </h2>

        <div className="mt-4 flex items-center gap-2 rounded-[12px] border border-border bg-surface px-3">
          <input
            id="promo-code"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="Enter coupon code"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
            className="min-w-0 flex-1 bg-transparent py-3.5 text-[14px] uppercase text-text-primary outline-none placeholder:normal-case placeholder:text-text-muted"
          />
          <button
            type="button"
            disabled={!canApplyPromo || applyPromo.isPending}
            onClick={handleApplyPromo}
            className="shrink-0 px-1 text-[14px] font-semibold text-brand-red transition-colors disabled:text-text-muted"
          >
            {applyPromo.isPending ? 'Checking…' : 'Apply'}
          </button>
        </div>

        {promoError && (
          <p className="mt-2 text-[12px] text-brand-red">{promoError}</p>
        )}

        <p className="mt-4 text-[12px] text-text-muted">
          Have a code from Detlio? Enter it above to see your savings before you
          pay.
        </p>
      </ScSheet>

      {/* Height here (~104px: py-3 + the py-4 button + the helper line) is what
          the page's bottom padding above must clear, plus the iOS home
          indicator inset added to both. */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-border bg-brand-black px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
        <ScButton
          disabled={
            !selectedService ||
            !selectedSlot ||
            !selectedVehicle ||
            unpricedForVehicle ||
            loading
          }
          onClick={handleConfirm}
          className="rounded-full py-4 text-[15px]"
        >
          {loading
            ? 'Processing payment...'
            : unpricedForVehicle
              ? 'Not priced for this vehicle'
              : payableAmount == null
                ? 'Confirm booking'
                : `Pay Now (₹${payableAmount.toLocaleString('en-IN')})`}
        </ScButton>
        <p className="mt-2 text-center text-[11px] text-text-muted">
          {unpricedForVehicle
            ? 'This garage has not set a price for your vehicle type. Pick another vehicle or contact them.'
            : 'Bookings are confirmed after online payment.'}
        </p>
      </div>
    </AppShell>
  )
}

export default function BookPage({
  params,
}: {
  params: Promise<{ vendorId: string }>
}) {
  const { vendorId } = use(params)
  return (
    <Suspense>
      <BookContent vendorId={vendorId} />
    </Suspense>
  )
}
