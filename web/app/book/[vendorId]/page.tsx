'use client'

import { use, useEffect, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { SlotPicker } from '@/components/sc/slot-picker'
import { ScToggle } from '@/components/sc/toggle'
import { TopBar } from '@/components/sc/top-bar'
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments'
import { getVendorServices } from '@/lib/api/services'
import { getVendor } from '@/lib/api/vendors'
import { openRazorpayCheckout } from '@/lib/razorpay'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { useUserStore } from '@/lib/stores/user-store'
import type { Service, Vendor } from '@/lib/types'
import { formatServicePrice, resolveServiceAmount } from '@/lib/pricing'
import { cn } from '@/lib/utils'

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

  const selectedVehicleType = vehicles.find((v) => v.id === selectedVehicle)?.vehicleType
  // The concrete amount to charge for the selected service/vehicle.
  const resolvedAmount = selectedService
    ? resolveServiceAmount(selectedService, selectedVehicleType)
    : null

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
          router.push(`/bookings/${booking.id}`)
        },
        onDismiss: () => {
          toast.info('Payment cancelled. Your booking is saved — you can pay from booking details.')
        },
        onFailure: (message) => {
          toast.error(message)
        },
      })
    } catch (error) {
      if (error instanceof Error && error.message !== 'Payment cancelled') {
        toast.error(error.message)
      }
    } finally {
      bookingLockRef.current = false
      setLoading(false)
    }
  }

  return (
    <AppShell className="gap-5 pb-24 pt-4">
      <TopBar showBack title="Book service" />

      {selectedService && vendor && (
        <ScCard>
          <div className="flex justify-between">
            <div>
              <p className="text-[13px] font-semibold text-text-primary">{selectedService.name}</p>
              <p className="text-[11px] text-text-secondary">{vendor.name}</p>
              <p className="text-[11px] text-text-secondary">{selectedService.durationMins} min</p>
            </div>
            <span className="text-[13px] font-semibold">
              {formatServicePrice(selectedService, selectedVehicleType)}
            </span>
          </div>
        </ScCard>
      )}

      {vendor && vendor.dropinEnabled && vendor.doorstepEnabled && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Service type</h2>
          <ScToggle
            options={BOOKING_TYPE_OPTIONS}
            value={bookingType}
            onChange={setBookingType}
          />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Pick a slot</h2>
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

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Car details</h2>
        {vehicles.length === 0 ? (
          <p className="text-[12px] text-text-secondary">No cars added yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {vehicles.map((v) => (
              <button key={v.id} type="button" onClick={() => setSelectedVehicle(v.id)}>
                <ScCard className={cn(selectedVehicle === v.id && 'border-brand-red')}>
                  <p className="text-[13px] font-medium">{v.make} {v.model}</p>
                  <p className="text-[11px] text-text-secondary">{v.plate}</p>
                </ScCard>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Payment</h2>
        <ScCard className="flex items-center gap-3 border-brand-red">
          <span className="flex-1 text-left text-[13px]">Online (Razorpay)</span>
          <div className="h-4 w-4 rounded-full border-[5px] border-brand-red" />
        </ScCard>
        <p className="mt-2 text-[12px] text-text-secondary">
          Bookings are confirmed after online payment.
        </p>
      </section>

      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-border bg-brand-black px-4 py-3">
        <ScButton
          disabled={!selectedService || !selectedSlot || !selectedVehicle || loading}
          onClick={handleConfirm}
        >
          {loading
            ? 'Processing payment...'
            : resolvedAmount == null
              ? 'Confirm booking'
              : `Pay · ₹${resolvedAmount}`}
        </ScButton>
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
