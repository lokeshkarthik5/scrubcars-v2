'use client'

import { use, useEffect, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { Chip } from '@/components/sc/chip'
import { ScToggle } from '@/components/sc/toggle'
import { TopBar } from '@/components/sc/top-bar'
import { getAvailableSlots } from '@/lib/api/bookings'
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments'
import { getVendorServices } from '@/lib/api/services'
import { getVendor, getVendorWorkingHours } from '@/lib/api/vendors'
import { openRazorpayCheckout } from '@/lib/razorpay'
import { useBookingsStore } from '@/lib/stores/bookings-store'
import { useUserStore } from '@/lib/stores/user-store'
import type { Service, Vendor } from '@/lib/types'
import { formatServicePrice, resolveServiceAmount } from '@/lib/pricing'
import { APP_TIMEZONE, cn } from '@/lib/utils'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const BOOKING_TYPE_OPTIONS = [
  { value: 'dropin' as const, label: 'Drop In' },
  { value: 'doorstep' as const, label: 'Doorstep' },
]

function buildDateOptions(count = 7) {
  // Anchor "today" to IST so the calendar days match the server's slot dates,
  // regardless of the customer's device timezone. Date-only arithmetic in UTC
  // is safe (no DST) and getUTC* keeps the day-of-week aligned with the server.
  const istToday = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
  const [y, m, d0] = istToday.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, d0 + i))
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return {
      value: `${yyyy}-${mm}-${dd}`,
      dayOfWeek: d.getUTCDay(),
      dayName: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAY_NAMES[d.getUTCDay()],
      date: `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`,
    }
  })
}

// Formats a YYYY-MM-DD value into the same chip labels used above, for a date
// picked from the calendar (which may fall outside the visible week).
function formatDateChip(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return {
    dayOfWeek: dt.getUTCDay(),
    dayName: DAY_NAMES[dt.getUTCDay()],
    date: `${dt.getUTCDate()} ${MONTH_NAMES[dt.getUTCMonth()]}`,
  }
}

// UTC date-only arithmetic on a YYYY-MM-DD key (no DST edge cases).
function addDaysToKey(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function BookContent({ vendorId }: { vendorId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const serviceId = searchParams.get('service')
  const createBooking = useBookingsStore((s) => s.createBooking)
  const vehicles = useUserStore((s) => s.vehicles)
  const profile = useUserStore((s) => s.profile)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  const fetchProfile = useUserStore((s) => s.fetchProfile)

  const dateOptions = buildDateOptions()
  // The calendar lets customers pick dates beyond the visible week.
  const calendarMin = addDaysToKey(dateOptions[dateOptions.length - 1].value, 1)

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value)
  // A date chosen from the calendar that falls outside the visible week.
  const [customDate, setCustomDate] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  // Month currently displayed in the calendar popup (anchored to the 1st).
  const [calMonth, setCalMonth] = useState(() => {
    const [y, m] = calendarMin.split('-').map(Number)
    return { year: y, month: m - 1 }
  })
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [bookingType, setBookingType] = useState<'dropin' | 'doorstep'>('dropin')
  const [slots, setSlots] = useState<Array<{ time: string; label: string; available: boolean }>>([])
  const [isClosedDay, setIsClosedDay] = useState(false)
  const [closedDays, setClosedDays] = useState<Set<number>>(new Set())
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
    getVendorWorkingHours(vendorId)
      .then((hours) =>
        setClosedDays(
          new Set(hours.filter((h) => h.isClosed).map((h) => h.dayOfWeek))
        )
      )
      .catch(() => setClosedDays(new Set()))
    void fetchVehicles()
    void fetchProfile()
  }, [vendorId, serviceId, fetchVehicles, fetchProfile])

  useEffect(() => {
    if (!selectedService) return
    setSelectedSlot(null)
    getAvailableSlots({
      vendorId,
      serviceId: selectedService.id,
      date: selectedDate,
    }).then(({ isClosed, slots }) => {
      setSlots(slots)
      setIsClosedDay(isClosed)
    })
  }, [vendorId, selectedService, selectedDate])

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

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {dateOptions.map((d) => {
            const closed = closedDays.has(d.dayOfWeek)
            return (
              <button
                key={d.value}
                type="button"
                disabled={closed}
                onClick={() => setSelectedDate(d.value)}
                className={cn(
                  'flex shrink-0 flex-col items-center rounded-[10px] border px-3 py-2 transition-colors',
                  closed
                    ? 'cursor-not-allowed border-border bg-surface text-text-secondary opacity-40'
                    : selectedDate === d.value
                      ? 'border-brand-red bg-accent-muted text-brand-red'
                      : 'border-border bg-surface text-text-primary'
                )}
              >
                <span className="text-[11px] font-medium">{d.dayName}</span>
                <span className="text-[13px] font-semibold">{d.date}</span>
                {closed && <span className="text-[9px] font-medium">Closed</span>}
              </button>
            )
          })}

          {customDate && (
            <button
              type="button"
              onClick={() => setSelectedDate(customDate)}
              className={cn(
                'flex shrink-0 flex-col items-center rounded-[10px] border px-3 py-2 transition-colors',
                selectedDate === customDate
                  ? 'border-brand-red bg-accent-muted text-brand-red'
                  : 'border-border bg-surface text-text-primary'
              )}
            >
              <span className="text-[11px] font-medium">{formatDateChip(customDate).dayName}</span>
              <span className="text-[13px] font-semibold">{formatDateChip(customDate).date}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const anchor = customDate ?? calendarMin
              const [y, m] = anchor.split('-').map(Number)
              setCalMonth({ year: y, month: m - 1 })
              setShowCalendar(true)
            }}
            className="flex shrink-0 flex-col items-center justify-center rounded-[10px] border border-border bg-surface px-3 py-2 text-text-secondary transition-colors hover:text-brand-red"
            title="Pick another date"
          >
            <IconCalendar size={20} stroke={1.5} />
            <span className="text-[9px] font-medium">More</span>
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {slots.length === 0 ? (
            <p className="text-[12px] text-text-secondary">
              {isClosedDay
                ? 'Vendor is closed on this day.'
                : 'No slots available on this date.'}
            </p>
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

      {showCalendar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
          onClick={() => setShowCalendar(false)}
        >
          <div
            className="w-full max-w-[340px] rounded-[20px] border border-border bg-brand-black p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setCalMonth((c) =>
                    c.month === 0
                      ? { year: c.year - 1, month: 11 }
                      : { year: c.year, month: c.month - 1 }
                  )
                }
                className="rounded-lg p-1 text-text-secondary hover:text-brand-red"
                aria-label="Previous month"
              >
                <IconChevronLeft size={20} />
              </button>
              <span className="text-sm font-semibold text-text-primary">
                {MONTH_NAMES[calMonth.month]} {calMonth.year}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCalMonth((c) =>
                    c.month === 11
                      ? { year: c.year + 1, month: 0 }
                      : { year: c.year, month: c.month + 1 }
                  )
                }
                className="rounded-lg p-1 text-text-secondary hover:text-brand-red"
                aria-label="Next month"
              >
                <IconChevronRight size={20} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 text-center">
              {DAY_NAMES.map((d) => (
                <span key={d} className="text-[10px] font-medium text-text-muted">
                  {d[0]}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({
                length: new Date(Date.UTC(calMonth.year, calMonth.month, 1)).getUTCDay(),
              }).map((_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {Array.from({
                length: new Date(Date.UTC(calMonth.year, calMonth.month + 1, 0)).getUTCDate(),
              }).map((_, i) => {
                const day = i + 1
                const key = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const disabled = key < calendarMin
                const selected = key === customDate
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setCustomDate(key)
                      setSelectedDate(key)
                      setShowCalendar(false)
                    }}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-lg text-[13px] transition-colors',
                      disabled
                        ? 'cursor-not-allowed text-text-muted opacity-30'
                        : selected
                          ? 'bg-brand-red font-semibold text-brand-white'
                          : 'text-text-primary hover:bg-surface'
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
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
