'use client'

import { use, useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconCash, IconCreditCard } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { Chip } from '@/components/sc/chip'
import { ScToggle } from '@/components/sc/toggle'
import { TopBar } from '@/components/sc/top-bar'
import { getAvailableSlots } from '@/lib/api/bookings'
import { getVendorServices } from '@/lib/api/services'
import { getVendor } from '@/lib/api/vendors'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { useUserStore } from '@/lib/stores/user-store'
import type { BookingType, PaymentMethod, Service, Vendor } from '@/lib/types'
import { cn } from '@/lib/utils'

function BookContent({ vendorId }: { vendorId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const serviceId = searchParams.get('service')
  const createBooking = useBookingsStore((s) => s.createBooking)
  const vehicles = useUserStore((s) => s.vehicles)
  const addresses = useUserStore((s) => s.addresses)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  const fetchAddresses = useUserStore((s) => s.fetchAddresses)

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [bookingType, setBookingType] = useState<BookingType>('doorstep')
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [slots, setSlots] = useState<Array<{ time: string; label: string; available: boolean }>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getVendor(vendorId).then((v) => setVendor(v ?? null))
    getVendorServices(vendorId).then((svcs) => {
      setServices(svcs)
      const preselected = serviceId
        ? svcs.find((s) => s.id === serviceId)
        : svcs[0]
      setSelectedService(preselected ?? null)
    })
    void fetchVehicles()
    void fetchAddresses()
  }, [vendorId, serviceId, fetchVehicles, fetchAddresses])

  useEffect(() => {
    if (!selectedService) return
    getAvailableSlots({
      vendorId,
      serviceId: selectedService.id,
      date: 'today',
    }).then(setSlots)
  }, [vendorId, selectedService])

  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicle) {
      const defaultVehicle = vehicles.find((v) => v.isDefault) ?? vehicles[0]
      setSelectedVehicle(defaultVehicle.id)
    }
  }, [vehicles, selectedVehicle])

  useEffect(() => {
    if (addresses.length > 0 && !selectedAddress) {
      const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0]
      setSelectedAddress(defaultAddress.id)
    }
  }, [addresses, selectedAddress])

  const handleConfirm = async () => {
    if (!selectedService || !selectedSlot || !selectedVehicle) return
    if (bookingType === 'doorstep' && !selectedAddress) return
    setLoading(true)
    try {
      const booking = await createBooking({
        vendorId,
        serviceId: selectedService.id,
        scheduledAt: selectedSlot,
        bookingType,
        vehicleId: selectedVehicle,
        addressId: bookingType === 'doorstep' ? selectedAddress! : undefined,
        paymentMethod,
      })
      router.push(`/bookings/${booking.id}`)
    } finally {
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
            <span className="text-[13px] font-semibold">₹{selectedService.price}</span>
          </div>
        </ScCard>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Booking type</h2>
        <ScToggle
          options={[
            { value: 'doorstep', label: 'Doorstep' },
            { value: 'dropin', label: 'Drop-in' },
          ]}
          value={bookingType}
          onChange={setBookingType}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Pick a slot</h2>
        <p className="mb-2 text-[12px] text-text-secondary">Today</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {slots.length === 0 ? (
            <p className="text-[12px] text-text-secondary">No slots available today.</p>
          ) : (
            slots.map((slot) => (
              <Chip
                key={slot.time}
                label={slot.label}
                selected={selectedSlot === slot.time}
                disabled={!slot.available}
                onClick={() => setSelectedSlot(slot.time)}
              />
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Car details</h2>
        {vehicles.length === 0 ? (
          <p className="text-[12px] text-text-secondary">Add a vehicle from your profile first.</p>
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

      {bookingType === 'doorstep' && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Doorstep address</h2>
          {addresses.length === 0 ? (
            <p className="text-[12px] text-text-secondary">Add an address from your profile first.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {addresses.map((a) => (
                <button key={a.id} type="button" onClick={() => setSelectedAddress(a.id)}>
                  <ScCard className={cn(selectedAddress === a.id && 'border-brand-red')}>
                    <p className="text-[13px] font-medium">{a.label}</p>
                    <p className="text-[11px] text-text-secondary">{a.address}</p>
                  </ScCard>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Payment method</h2>
        <div className="flex flex-col gap-2">
          {([
            { value: 'online' as const, label: 'Online (Razorpay)', icon: IconCreditCard },
            { value: 'cash' as const, label: 'Cash on service', icon: IconCash },
          ]).map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" onClick={() => setPaymentMethod(value)}>
              <ScCard className={cn('flex items-center gap-3', paymentMethod === value && 'border-brand-red')}>
                <Icon size={20} className="text-text-secondary" />
                <span className="flex-1 text-left text-[13px]">{label}</span>
                {paymentMethod === value && (
                  <div className="h-4 w-4 rounded-full border-[5px] border-brand-red" />
                )}
              </ScCard>
            </button>
          ))}
        </div>
      </section>

      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[428px] -translate-x-1/2 border-t border-border bg-brand-black px-4 py-3">
        <ScButton
          disabled={!selectedService || !selectedSlot || !selectedVehicle || loading}
          onClick={handleConfirm}
        >
          {loading ? 'Confirming...' : `Confirm · ₹${selectedService?.price ?? 0}`}
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
