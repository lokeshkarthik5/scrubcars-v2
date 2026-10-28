'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { IconCheck, IconCircleCheck, IconPlus } from '@tabler/icons-react'
import { ScSheet } from '@repo/ui/sc/modal'
import { ScButton } from '@repo/ui/sc/button'
import { Chip } from '@repo/ui/sc/chip'
import { track } from '@repo/core/analytics'
import { ApiError } from '@repo/core/api/client'
import { garageQuery } from '@repo/core/api/hooks/use-vendors'
import { useCreateRequest, useRequestWindows } from '@repo/core/api/hooks/use-booking-requests'
import type { CustomerRequest } from '@repo/core/api/booking-requests'
import type { JustOutsideVendor } from '@repo/core/api/vendors'
import {
  dayChipLabel,
  istClock,
  REQUEST_PROMISES,
  WINDOW_PART_LABELS,
  type RequestMode,
  type WindowPart,
} from '@repo/core/booking-requests'
import type { DraftAddress, DraftCar } from '@repo/core/booking-draft'
import { resolveServiceAmount } from '@repo/core/pricing'
import { effectiveDurationMins } from '@repo/core/service-duration'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import type { VehicleType } from '@repo/core/types'
import { cn } from '@repo/core/utils'
import { AddAddressSheet } from '@/components/add-address-sheet'
import { CheckoutSignInCard, useCheckoutSignIn } from '@/components/checkout/checkout-sign-in'
import { GuestCarForm, draftCarReady } from '@/components/checkout/guest-car'
import { saveGuestAddress, saveGuestCar } from './guest-save'

const GUEST_CAR = 'guest-car'
const GUEST_ADDRESS = 'guest-address'

type Window = { date: string; part: WindowPart }

/**
 * "Request a visit" / "Request a pickup" (customer reach, part 2, 0062;
 * mockup doorstep-request.png, frame 2): the services priced for the car, a
 * time window (today evening, tomorrow morning or afternoon, or a day and a
 * part of it, as the garage's hours allow), the address, and the promises.
 * Nothing is paid. A guest signs in on the in-page card first, because
 * sending needs an account; their car and address are then saved to it.
 */
export function RequestSheet({
  open,
  onClose,
  garage,
  mode,
}: {
  open: boolean
  onClose: () => void
  garage: JustOutsideVendor
  mode: RequestMode
}) {
  const vendor = garage.vendor
  const user = useAuthStore((s) => s.user)
  const vehicles = useUserStore((s) => s.vehicles)
  const addresses = useUserStore((s) => s.addresses)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  const fetchAddresses = useUserStore((s) => s.fetchAddresses)
  const garageData = useQuery({ ...garageQuery(vendor.id), enabled: open })
  const create = useCreateRequest()
  const signIn = useCheckoutSignIn()

  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [carPicked, setCarChoice] = useState<string | null>(null)
  const [guestCar, setGuestCar] = useState<DraftCar | null>(null)
  const [addressPicked, setAddressChoice] = useState<string | null>(null)
  const [guestAddress, setGuestAddress] = useState<DraftAddress | null>(null)
  const [addAddressOpen, setAddAddressOpen] = useState(false)
  const [windowPicked, setWindow] = useState<Window | null>(null)
  const [pickingDay, setPickingDay] = useState(false)
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<CustomerRequest | null>(null)
  const savedGuest = useRef<{ car?: string; address?: string }>({})

  // A signed-in customer's own cars and addresses.
  useEffect(() => {
    if (!open || !user) return
    void fetchVehicles().catch(() => undefined)
    void fetchAddresses().catch(() => undefined)
  }, [open, user, fetchVehicles, fetchAddresses])

  // Their default car and first pinned address, chosen for them until they pick.
  const pinned = useMemo(() => addresses.filter((a) => a.lat !== null && a.lng !== null), [addresses])
  const carChoice =
    carPicked ?? (user && vehicles.length > 0 ? (vehicles.find((v) => v.isDefault) ?? vehicles[0])!.id : null)
  const addressChoice =
    addressPicked ?? (user && pinned.length > 0 ? (pinned.find((a) => a.isDefault) ?? pinned[0])!.id : null)

  const services = useMemo(
    () => (garageData.data?.services ?? []).filter((s) => s.isActive && s.category !== 'package'),
    [garageData.data]
  )
  const guest = !user
  const vehicleType: VehicleType | null =
    carChoice === GUEST_CAR || guest
      ? (guestCar?.vehicleType ?? null)
      : (vehicles.find((v) => v.id === carChoice)?.vehicleType ?? null)
  const chosen = services.filter((s) => serviceIds.includes(s.id))
  const durationMins = chosen.reduce((sum, s) => sum + effectiveDurationMins(s), 0)
  const windows = useRequestWindows(open && chosen.length > 0 ? { vendorId: vendor.id, mode, durationMins } : null)

  // A window the garage can no longer fit (hours, the job got longer) is dropped.
  const window = useMemo(() => {
    if (!windowPicked || !windows.data) return null
    const quick = windows.data.quick.find((w) => w.date === windowPicked.date && w.part === windowPicked.part)
    const day = windows.data.days.find((d) => d.date === windowPicked.date)
    const stillOpen = quick
      ? quick.open
      : windowPicked.part !== 'evening' && day
        ? day[windowPicked.part as 'morning' | 'afternoon']
        : false
    return stillOpen ? windowPicked : null
  }, [windows.data, windowPicked])

  const priced = chosen.map((s) => ({ service: s, amount: vehicleType ? resolveServiceAmount(s, vehicleType) : null }))
  const unpriced = vehicleType !== null && priced.some((p) => p.amount === null)
  const carReady = guest ? draftCarReady(guestCar) : carChoice !== null
  const addressReady = guest ? guestAddress !== null : addressChoice !== null
  const ready = chosen.length > 0 && !unpriced && carReady && addressReady && window !== null

  const toggleService = (id: string) =>
    setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const label = mode === 'pickup' ? 'Request a pickup' : 'Request a visit'
  const carLabel = VEHICLE_TIERS.find((t) => t.value === vehicleType)?.label.toUpperCase()

  /** Sends the request: the guest's car and address saved first, once each. */
  const send = async (ids?: { vehicleId: string; addressId: string }) => {
    if (!window) return
    setError('')
    setSending(true)
    try {
      let vehicleId = ids?.vehicleId ?? carChoice
      let addressId = ids?.addressId ?? addressChoice
      if (!ids && (guest || carChoice === GUEST_CAR)) {
        if (!guestCar) return
        savedGuest.current.car ??= await saveGuestCar(guestCar)
        vehicleId = savedGuest.current.car
      }
      if (!ids && (guest || addressChoice === GUEST_ADDRESS)) {
        if (!guestAddress) return
        savedGuest.current.address ??= await saveGuestAddress(guestAddress)
        addressId = savedGuest.current.address
      }
      if (!vehicleId || !addressId) return
      const created = await create.mutateAsync({
        vendorId: vendor.id,
        bookingType: mode,
        serviceIds,
        vehicleId,
        addressId,
        window,
      })
      track('request_sent', { vendorId: vendor.id, mode })
      setSent(created)
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : "Couldn't send the request. Try again."
      )
    } finally {
      setSending(false)
    }
  }

  /** The guest's Verify: the sign-in, then the request. */
  const verifyAndSend = async () => {
    const ok = await signIn.verify()
    if (!ok) return
    await send()
  }

  const close = () => {
    onClose()
    // A sent request starts clean next time.
    if (sent) {
      setSent(null)
      setServiceIds([])
      setWindow(null)
    }
  }

  return (
    <ScSheet open={open} onClose={close} aria-label={`Request ${vendor.name}`}>
      <div className="flex flex-col gap-5 px-5 pt-2" data-request-sheet="">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
            <IconCircleCheck size={44} className="text-success" aria-hidden />
            <h2 className="text-[20px] font-medium text-text-primary">Request sent</h2>
            <p className="text-[15px] text-text-secondary">
              Waiting for {sent.garage.name}. They reply by {istClock(sent.respondBy)}, or we ask the next garage.
              Nothing to pay yet.
            </p>
            <div className="flex w-full flex-col gap-2 pt-2">
              <Link
                href="/requests"
                onClick={close}
                className="press flex min-h-12 items-center justify-center rounded-full bg-brand-white text-[15px] font-medium text-brand-black"
              >
                See your request
              </Link>
              <ScButton variant="text" onClick={close}>
                Done
              </ScButton>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-[20px] font-medium text-text-primary">Request {vendor.name}</h2>
              <p className="text-[13px] text-text-secondary">
                {mode === 'pickup' ? 'They collect your car and bring it back' : 'To your home'} ·{' '}
                {garage.coverKm !== null ? `covers ${garage.coverKm} km, ` : ''}
                {garage.outsideKm} km outside
              </p>
            </div>

            {(guest || carChoice === GUEST_CAR) && (
              <section aria-labelledby="request-car" className="flex flex-col gap-2">
                <h3 id="request-car" className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-muted">
                  Your car
                </h3>
                <GuestCarForm car={guestCar} onChange={setGuestCar} />
              </section>
            )}
            {!guest && vehicles.length > 1 && (
              <section aria-labelledby="request-saved-car" className="flex flex-col gap-2">
                <h3 id="request-saved-car" className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-muted">
                  Which car
                </h3>
                <div className="flex flex-wrap gap-2" data-clarity-mask="true">
                  {vehicles.map((v) => (
                    <Chip key={v.id} label={`${v.make} ${v.model}`} selected={carChoice === v.id} onClick={() => setCarChoice(v.id)} />
                  ))}
                </div>
              </section>
            )}
            {!guest && vehicles.length === 0 && carChoice !== GUEST_CAR && (
              <button
                type="button"
                onClick={() => setCarChoice(GUEST_CAR)}
                className="flex min-h-11 items-center gap-1.5 self-start text-[13px] text-text-secondary underline"
              >
                <IconPlus size={14} aria-hidden /> Add your car
              </button>
            )}

            <section aria-labelledby="request-services" className="flex flex-col gap-2">
              <h3 id="request-services" className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-muted">
                Service{carLabel ? ` · your ${carLabel}` : ''}
              </h3>
              {garageData.isLoading ? (
                <p className="text-[13px] text-text-secondary">Loading services…</p>
              ) : services.length === 0 ? (
                <p className="text-[13px] text-text-secondary">This garage has no services to ask for yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {services.map((service) => {
                      const on = serviceIds.includes(service.id)
                      const amount = vehicleType ? resolveServiceAmount(service, vehicleType) : null
                      return (
                        <li key={service.id}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleService(service.id)}
                            className={cn(
                              'press flex min-h-14 w-full items-center gap-3 rounded-[14px] border px-4 text-left',
                              on ? 'border-brand-white' : 'border-border'
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'grid size-5 shrink-0 place-items-center rounded-full border',
                                on ? 'border-brand-white bg-brand-white text-brand-black' : 'border-stroke'
                              )}
                            >
                              {on && <IconCheck size={13} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[15px] text-text-primary">{service.name}</span>
                              <span className="block text-[12px] text-text-muted">{service.durationMins} min</span>
                            </span>
                            <span className="shrink-0 font-numeric text-[15px] text-text-primary">
                              {vehicleType ? (amount === null ? 'Not priced' : `₹${amount.toLocaleString('en-IN')}`) : `from ₹${service.price.toLocaleString('en-IN')}`}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                </ul>
              )}
              {unpriced && (
                <p role="alert" className="text-[13px] text-error">
                  One of these isn&apos;t priced for your car at this garage. Remove it to send the request.
                </p>
              )}
            </section>

            <section aria-labelledby="request-when" className="flex flex-col gap-2">
              <h3 id="request-when" className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-muted">
                When
              </h3>
              {chosen.length === 0 ? (
                <p className="text-[13px] text-text-secondary">Pick a service to see when they can come.</p>
              ) : windows.isLoading ? (
                <p className="text-[13px] text-text-secondary">Checking their hours…</p>
              ) : windows.isError || !windows.data ? (
                <p className="text-[13px] text-error">Couldn&apos;t load their hours. Close and try again.</p>
              ) : (
                <>
                  <div role="group" aria-label="Time window" className="flex flex-wrap gap-2">
                    {windows.data.quick.map((w) => (
                      <Chip
                        key={`${w.date}-${w.part}`}
                        label={w.label}
                        disabled={!w.open}
                        selected={!pickingDay && window?.date === w.date && window.part === w.part}
                        onClick={() => {
                          setPickingDay(false)
                          setWindow({ date: w.date, part: w.part })
                        }}
                      />
                    ))}
                    <Chip
                      label="Pick a day"
                      selected={pickingDay}
                      onClick={() => {
                        setPickingDay(true)
                        setWindow(null)
                      }}
                    />
                  </div>
                  {pickingDay && (
                    <div className="flex flex-col gap-2">
                      <div role="group" aria-label="Day" className="-mx-5 flex gap-2 overflow-x-auto px-5 py-1">
                        {windows.data.days.map((d) => (
                          <Chip
                            key={d.date}
                            label={dayChipLabel(d.date)}
                            disabled={!d.morning && !d.afternoon}
                            selected={pickedDay === d.date}
                            onClick={() => {
                              setPickedDay(d.date)
                              setWindow(null)
                            }}
                          />
                        ))}
                      </div>
                      {pickedDay && (
                        <div role="group" aria-label="Part of the day" className="flex gap-2">
                          {(['morning', 'afternoon'] as const).map((part) => {
                            const day = windows.data!.days.find((d) => d.date === pickedDay)
                            return (
                              <Chip
                                key={part}
                                label={WINDOW_PART_LABELS[part]}
                                disabled={!day?.[part]}
                                selected={window?.date === pickedDay && window.part === part}
                                onClick={() => setWindow({ date: pickedDay, part })}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[12px] text-text-muted">
                    A window, not an exact time: the garage picks a start inside it.
                  </p>
                </>
              )}
            </section>

            <section aria-labelledby="request-where" className="flex flex-col gap-2">
              <h3 id="request-where" className="text-[12px] font-medium uppercase tracking-[0.12em] text-text-muted">
                Where
              </h3>
              <div className="flex flex-col gap-2" data-clarity-mask="true">
                {!guest &&
                  pinned.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={addressChoice === a.id}
                      onClick={() => setAddressChoice(a.id)}
                      className={cn(
                        'press flex min-h-14 w-full flex-col justify-center rounded-[14px] border px-4 py-2 text-left',
                        addressChoice === a.id ? 'border-brand-white' : 'border-border'
                      )}
                    >
                      <span className="text-[15px] text-text-primary">{a.label || 'Address'}</span>
                      <span className="truncate text-[12px] text-text-muted">{a.address}</span>
                    </button>
                  ))}
                {guestAddress && (guest || addressChoice === GUEST_ADDRESS) && (
                  <div className="flex min-h-14 flex-col justify-center rounded-[14px] border border-brand-white px-4 py-2">
                    <span className="text-[15px] text-text-primary">{guestAddress.label || 'Address'}</span>
                    <span className="truncate text-[12px] text-text-muted">{guestAddress.address}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAddAddressOpen(true)}
                className="flex min-h-11 items-center gap-1.5 self-start text-[13px] text-text-secondary underline"
              >
                <IconPlus size={14} aria-hidden /> {guestAddress || pinned.length > 0 ? 'Use another address' : 'Add your address'}
              </button>
            </section>

            <ul aria-label="What happens next" className="flex flex-col gap-1.5">
              {REQUEST_PROMISES.map((line) => (
                <li key={line} className="flex items-start gap-2 text-[13px] text-text-secondary">
                  <IconCheck size={15} className="mt-0.5 shrink-0 text-success" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>

            {error && (
              <p role="alert" className="text-[13px] text-error">
                {error}
              </p>
            )}

            {guest ? (
              ready ? (
                <CheckoutSignInCard
                  signIn={signIn}
                  verifyLabel="Verify and send request"
                  onVerify={() => void verifyAndSend()}
                  busy={sending}
                />
              ) : (
                <p className="text-[13px] text-text-secondary">
                  Pick a service, your car, a time and your address. Then sign in with your number to send it.
                </p>
              )
            ) : (
              <ScButton variant="main" size="lg" disabled={!ready || sending} onClick={() => void send()}>
                {sending ? 'Sending…' : 'Send request'}
              </ScButton>
            )}
            <p className="pb-2 text-center text-[12px] text-text-muted">{label}: free to ask, no payment until they say yes.</p>
          </>
        )}
      </div>

      <AddAddressSheet
        open={addAddressOpen}
        onClose={() => setAddAddressOpen(false)}
        pickup={mode === 'pickup'}
        onAdded={
          guest
            ? undefined
            : (address) => {
                setAddressChoice(address.id)
              }
        }
        onSaveLocal={
          guest
            ? (address) => {
                setGuestAddress(address)
                setAddressChoice(GUEST_ADDRESS)
                setAddAddressOpen(false)
              }
            : undefined
        }
      />
    </ScSheet>
  )
}
