'use client'

import { use, useEffect, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconShoppingCart, IconTag } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { SlotPicker } from '@/components/sc/slot-picker'
import { ScToggle } from '@/components/sc/toggle'
import { TopBar } from '@/components/sc/top-bar'
import type { AppliedDiscount } from '@/lib/api/discounts'
import {
  errorMessage,
  useValidateDiscount,
} from '@/lib/api/hooks/use-discounts'
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments'
import { ApiError } from '@/lib/api/client'
import { getVendorServices } from '@/lib/api/services'
import { getVendor } from '@/lib/api/vendors'
import { openRazorpayCheckout } from '@/lib/razorpay'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { useUserStore } from '@/lib/stores/user-store'
import type { Service, Vendor } from '@/lib/types'
import { formatServicePrice, resolveServiceAmount } from '@/lib/pricing'
import { cn, formatDuration } from '@/lib/utils'

const BOOKING_TYPE_OPTIONS = [
  { value: 'dropin' as const, label: 'Drop In' },
  { value: 'doorstep' as const, label: 'Doorstep' },
]

function BookContent({ vendorId }: { vendorId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const serviceId = searchParams.get('service')
  const createBooking = useBookingsStore((s) => s.createBooking)
  const vehicles = useUserStore((s) => s.vehicles)
  const profile = useUserStore((s) => s.profile)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  const fetchProfile = useUserStore((s) => s.fetchProfile)

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [bookingType, setBookingType] = useState<'dropin' | 'doorstep'>('dropin')
  const [loading, setLoading] = useState(false)
  const bookingLockRef = useRef(false)

  // What is typed vs what is actually applied. Kept apart so a keystroke never
  // re-queries — only pressing Apply does.
  const [promoInput, setPromoInput] = useState('')
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
      setServices(svcs)
      const preselected = serviceId
        ? svcs.find((s) => s.id === serviceId)
        : svcs[0]
      setSelectedService(preselected ?? null)
    })
    void fetchVehicles()
    void fetchProfile()
  }, [vendorId, serviceId, fetchVehicles, fetchProfile])

  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicle) {
      const defaultVehicle = vehicles.find((v) => v.isDefault) ?? vehicles[0]
      setSelectedVehicle(defaultVehicle.id)
    }
  }, [vehicles, selectedVehicle])

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
        onSuccess: (applied) =>
          setAppliedPromo({ discount: applied, serviceId, vehicleId }),
        onError: () => setAppliedPromo(null),
      }
    )
  }

  const handleRemovePromo = () => {
    setAppliedPromo(null)
    setPromoInput('')
    applyPromo.reset()
  }

  // The server's message is the customer-facing reason — "This code has
  // expired", "needs a booking of ₹500 or more" — so it is shown verbatim.
  const promoError = applyPromo.error
    ? errorMessage(applyPromo.error, "This code isn't valid.")
    : ''

  const handleConfirm = async () => {
    if (bookingLockRef.current || loading) return
    if (!selectedService || !selectedSlot || !selectedVehicle) return
    bookingLockRef.current = true
    setLoading(true)
    try {
      const booking = await createBooking({
        vendorId,
        serviceId: selectedService.id,
        scheduledAt: selectedSlot,
        bookingType,
        vehicleId: selectedVehicle,
        paymentMethod: 'online',
        discountCode: appliedDiscount?.code,
      })

      const order = await createPaymentOrder(booking.id)

      await openRazorpayCheckout({
        order,
        description: `${selectedService.name} at ${vendor?.name ?? 'vendor'}`,
        customer: {
          name: profile?.name,
          phone: profile?.phone,
        },
        onSuccess: async (response) => {
          await verifyPayment({
            bookingId: booking.id,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          })
          // ?celebrate=1 triggers the success burst on arrival; the booking
          // page strips it once played.
          router.push(`/bookings/${booking.id}?celebrate=1`)
        },
        onDismiss: () => {
          toast.info('Payment cancelled. Your booking is saved — you can pay from booking details.')
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
    <AppShell className="gap-5 pb-24 pt-4">
      <TopBar showBack center title="Pick a Slot" />

      {/* Cart summary — vendor, what's being booked, and the total to pay. */}
      {selectedService && vendor && (
        <ScCard className="py-3.5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[15px] font-semibold text-text-primary">{vendor.name}</p>
            <span className="shrink-0 text-[15px] font-semibold text-text-primary">
              {formatServicePrice(selectedService, selectedVehicleType)}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary">
            <IconShoppingCart size={13} />
            {selectedService.name} · {formatDuration(selectedService.durationMins)}
          </p>

          {/* Only shown once a code is applied — an untouched booking keeps the
              single-line summary it has always had. */}
          {appliedDiscount && (
            <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-[12px]">
              <div className="flex items-center justify-between text-text-secondary">
                <span>Subtotal</span>
                <span>₹{Number(appliedDiscount.subtotal).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between text-success">
                <span>Discount ({appliedDiscount.code})</span>
                <span>
                  −₹{Number(appliedDiscount.discountAmount).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px] font-semibold text-text-primary">
                <span>Total</span>
                <span>₹{Number(appliedDiscount.finalAmount).toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}
        </ScCard>
      )}

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-text-primary">
          Promo code
        </h2>
        {appliedDiscount ? (
          <ScCard className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-success">
                <IconTag size={14} /> {appliedDiscount.code} applied
              </p>
              <p className="text-[11px] text-text-secondary">
                You save ₹
                {Number(appliedDiscount.discountAmount).toLocaleString('en-IN')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemovePromo}
              className="shrink-0 text-[12px] font-medium text-brand-red"
            >
              Remove
            </button>
          </ScCard>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <ScInput
                id="promo-code"
                placeholder="Enter code"
                autoCapitalize="characters"
                autoComplete="off"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                className="flex-1 uppercase"
              />
              <ScButton
                fullWidth={false}
                variant="secondary"
                disabled={!canApplyPromo || applyPromo.isPending}
                onClick={handleApplyPromo}
                className="shrink-0 px-4 py-2.5 text-[13px]"
              >
                {applyPromo.isPending ? 'Checking…' : 'Apply'}
              </ScButton>
            </div>
            {promoError && (
              <p className="text-[11px] text-brand-red">{promoError}</p>
            )}
          </div>
        )}
      </section>

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

      <section>
        <SlotPicker
          vendorId={vendorId}
          serviceId={selectedService?.id ?? null}
          value={selectedSlot}
          onChange={setSelectedSlot}
        />
      </section>

      {vehicles.length === 0 && (
        <ScCard className="flex flex-col gap-1 border-warning bg-warning-muted/20">
          <p className="text-[13px] font-medium text-text-primary">Before you book</p>
          <p className="text-[12px] text-text-secondary">
            Add a car to continue.
          </p>
          <Link href="/profile" className="mt-1 text-[12px] font-medium text-brand-red">
            Go to profile →
          </Link>
        </ScCard>
      )}

      {/* Not in the design, but createBookingSchema requires a vehicleId — the
          booking can't be created without one. */}
      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-text-primary">Car details</h2>
        {vehicles.length === 0 ? (
          <p className="text-[12px] text-text-secondary">No cars added yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setSelectedVehicle(v.id)
                  applyPromo.reset()
                }}
              >
                <ScCard className={cn(selectedVehicle === v.id && 'border-brand-red')}>
                  <p className="text-[13px] font-medium">{v.make} {v.model}</p>
                  <p className="text-[11px] text-text-secondary">{v.plate}</p>
                </ScCard>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-border bg-brand-black px-4 py-3">
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
