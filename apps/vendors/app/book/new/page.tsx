'use client'

import { Suspense, useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import type { BookCustomerRow, NewWalkIn } from '@repo/core/api/garage-book'
import {
  useAddWalkIn,
  useBookCustomer,
  useBookCustomers,
  useBookReminders,
  useBookServices,
} from '@repo/core/api/hooks/use-garage-book'
import {
  DEFAULT_INTERVAL_DAYS,
  carName,
  newClientId,
  plateText,
  remindLine,
  rupees,
  shortDate,
  walkInTime,
  type JobPayment,
  type WhenChoice,
} from '@repo/core/garage-book'
import { useDebounced } from '@repo/core/hooks/use-debounced'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { RedLight } from '@repo/ui/finish/red-light'
import { NumberPlate } from '@repo/ui/finish/number-plate'
import { BackHeader, BookScreen, Disc, Footnote, PickTile, Seg, Switch } from '@/components/book/parts'

const WHEN = [
  { value: 'now', label: 'Now' },
  { value: 'later', label: 'Later today' },
  { value: 'pick', label: 'Pick a time' },
] as const

const PAYMENTS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'later', label: 'Pay later' },
] as const

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Whether the browser has a connection. The web needs one to save (the app saves on the phone). */
function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

/**
 * Add a walk-in (S1, the +): type the plate or phone and a matching customer
 * fills in; pick services from the garage's own price list (or type one);
 * when; how it is paid (Pay later adds to money owed); a reminder to wash
 * again; the one red Save job. With no signal the web says so and blocks
 * saving; the app saves on the phone instead.
 */
function NewWalkInScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const isOwner = useIsVendorAdmin()
  const online = useOnline()
  const [clientId] = useState(() => newClientId())
  const [typed, setTyped] = useState('')
  const [chosen, setChosen] = useState<BookCustomerRow | null>(null)
  const [name, setName] = useState('')
  const [car, setCar] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [other, setOther] = useState<{ label: string; rupees: string } | null>(null)
  const [when, setWhen] = useState<WhenChoice>('now')
  const [time, setTime] = useState('')
  const [payment, setPayment] = useState<JobPayment>('upi')
  const [remind, setRemind] = useState(true)
  const add = useAddWalkIn()

  const services = useBookServices()
  const reminders = useBookReminders()
  const interval = reminders.data?.defaultIntervalDays ?? DEFAULT_INTERVAL_DAYS
  const search = useDebounced(typed.trim(), 250)
  const [cleared, setCleared] = useState(false)
  const fromLink = params.get('customer')
  const matches = useBookCustomers({ filter: 'own', q: search }, search.length >= 3 && !chosen && (cleared || !fromLink))
  const linked = useBookCustomer(fromLink && fromLink.startsWith('own:') ? fromLink : null)

  // "New job" from a customer's page: that customer, ready, until something else is typed.
  const linkedRow = useMemo<BookCustomerRow | null>(() => {
    const c = linked.data
    if (!c) return null
    return {
      id: c.id,
      source: 'own',
      viaDetlio: false,
      name: c.name,
      phone: c.phone,
      cars: c.cars,
      lastVisitAt: c.history[0]?.at ?? null,
      visits: c.visits,
      remindedAt: null,
      due: { state: 'none', dueOn: null, daysSince: null, intervalDays: null },
    }
  }, [linked.data])

  const match = chosen ?? (cleared ? null : linkedRow)
  const suggestion = !chosen ? matches.data?.customers[0] : undefined
  const lines = useMemo(() => {
    const list = (services.data ?? []).filter((service) => picked.includes(service.id))
    return list.map((service) => ({ serviceId: service.id, pricePaise: service.pricePaise, label: service.name }))
  }, [services.data, picked])
  const otherPaise = other && other.label.trim() && Number(other.rupees) > 0 ? Math.round(Number(other.rupees) * 100) : null
  const count = lines.length + (otherPaise ? 1 : 0)
  const totalPaise = lines.reduce((sum, line) => sum + line.pricePaise, 0) + (otherPaise ?? 0)
  const looksLikePhone = /^[+\d\s-]{10,}$/.test(typed.trim())
  const ready = count > 0 && (match !== null || typed.trim().length > 0 || name.trim().length > 0) && (when !== 'pick' || time !== '')

  const save = () => {
    if (!online) {
      toast.error('No signal. Save it when you are back online.')
      return
    }
    const timing = walkInTime(when, new Date(), when === 'pick' ? time : null)
    const [make, ...model] = car.trim().split(/\s+/)
    const input: NewWalkIn = {
      clientId,
      customer: match
        ? { id: match.id }
        : {
            name: name.trim() || undefined,
            phone: looksLikePhone ? typed.trim() : undefined,
            plate: looksLikePhone ? undefined : typed.trim() || undefined,
            make: make || undefined,
            model: model.join(' ') || undefined,
          },
      lines: [
        ...lines.map((line) => ({ serviceId: line.serviceId })),
        ...(otherPaise ? [{ label: other!.label.trim(), pricePaise: otherPaise }] : []),
      ],
      scheduledAt: timing.scheduledAt,
      status: timing.status,
      payment,
      remindInDays: remind ? interval : null,
    }
    add.mutate(input, {
      onSuccess: (job) => router.push(`/home?added=${job.id}`),
      onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save the job. Try again."),
    })
  }

  return (
    <BookScreen nav={false} className="gap-[18px] pb-32">
      <BackHeader
        title="New walk-in job"
        back="/home"
        close
        right={
          !online && (
            <span className="gb-tag-o h-[26px] gap-1.5 text-[#F5C46B]">
              <span className="size-1.5 rounded-full bg-[#F5A524]" />
              No signal
            </span>
          )
        }
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="walkin-who" className="text-t4 font-semibold text-[#D4D4DA]">
          Number plate or phone
        </label>
        <div className="fx-recessed flex h-[52px] items-center gap-2.5 rounded-control px-3">
          {plateText(typed) && !looksLikePhone && /\d/.test(typed) && <NumberPlate plate={typed} size="sm" />}
          <input
            id="walkin-who"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value)
              setChosen(null)
              setCleared(true)
            }}
            placeholder="TN 09 AB 4521 or 98400 12345"
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
          />
        </div>
        {match ? (
          <CustomerMatch
            row={match}
            chosen
            onPick={() => {
              setChosen(null)
              setCleared(true)
            }}
          />
        ) : suggestion ? (
          <CustomerMatch row={suggestion} chosen={false} onPick={() => setChosen(suggestion)} />
        ) : (
          typed.trim().length >= 3 && (
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label="Customer's name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Customer's name"
                className="fx-recessed h-12 min-w-0 rounded-control px-3 text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
              />
              <input
                aria-label="Car"
                value={car}
                onChange={(event) => setCar(event.target.value)}
                placeholder="Car (Hyundai Creta)"
                className="fx-recessed h-12 min-w-0 rounded-control px-3 text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
              />
            </div>
          )
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-t4 font-semibold text-[#D4D4DA]">Services, from your price list</span>
        <div className="grid grid-cols-2 gap-2">
          {(services.data ?? []).map((service) => (
            <PickTile
              key={service.id}
              title={service.name}
              sub={[rupees(service.pricePaise), service.durationMins ? `${service.durationMins} min` : null].filter(Boolean).join(' · ')}
              on={picked.includes(service.id)}
              onClick={() => setPicked((list) => (list.includes(service.id) ? list.filter((id) => id !== service.id) : [...list, service.id]))}
            />
          ))}
          <PickTile title="+ Other" sub="Type a job and price" on={other !== null} onClick={() => setOther((value) => (value ? null : { label: '', rupees: '' }))} />
        </div>
        {other && (
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <input
              aria-label="The job"
              value={other.label}
              onChange={(event) => setOther({ ...other, label: event.target.value })}
              placeholder="Headlight polish"
              className="fx-recessed h-12 min-w-0 rounded-control px-3 text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
            />
            <input
              aria-label="Price in rupees"
              inputMode="numeric"
              value={other.rupees}
              onChange={(event) => setOther({ ...other, rupees: event.target.value.replace(/[^\d.]/g, '') })}
              placeholder="₹ price"
              className="fx-recessed h-12 min-w-0 rounded-control px-3 font-numeric text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-t4 font-semibold text-[#D4D4DA]">When</span>
        <Seg<WhenChoice> label="When" value={when} options={WHEN} onChange={setWhen} />
        {when === 'pick' && (
          <input
            type="time"
            aria-label="Time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="fx-recessed h-12 rounded-control px-3 font-numeric text-t3 text-text-primary outline-none"
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-t4 font-semibold text-[#D4D4DA]">Payment</span>
        <Seg<JobPayment> label="Payment" value={payment} options={PAYMENTS} onChange={setPayment} />
      </div>

      <div className="fx-edge flex items-center gap-3 rounded-control px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-t3 font-semibold text-text-primary">Remind to wash again</span>
          <span className="block text-[12px] text-[#A8A8B2]">{remind ? `${remindLine(interval, new Date())} · from your WhatsApp` : 'Off for this job'}</span>
        </span>
        <Switch checked={remind} onChange={setRemind} label="Remind to wash again" />
      </div>

      <Footnote>
        {online
          ? 'Saved jobs show on Today straight away. Walk-ins never change your Detlio slots.'
          : 'No signal: the website can’t save without the internet. The Detlio for Garages app saves it on your phone and sends it later.'}
      </Footnote>

      <div className="fx-glass fixed bottom-0 left-1/2 z-50 flex w-full max-w-[428px] -translate-x-1/2 items-center gap-3 rounded-none border-x-0 border-b-0 px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <span className="min-w-0 flex-1">
          <span className="block text-over font-semibold uppercase text-[#8E8E98]">
            {isOwner ? `Total · ${count} ${count === 1 ? 'service' : 'services'}` : `${count} ${count === 1 ? 'service' : 'services'}`}
          </span>
          {isOwner && <span className="font-numeric text-[22px] font-semibold text-text-primary">{rupees(totalPaise)}</span>}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!ready || add.isPending || !online}
          className="fx-red-button fx-press h-[52px] rounded-control px-7 text-t3 font-semibold"
        >
          {add.isPending ? 'Saving…' : 'Save job'}
        </button>
      </div>
    </BookScreen>
  )
}

function CustomerMatch({ row, chosen, onPick }: { row: BookCustomerRow; chosen: boolean; onPick: () => void }) {
  const firstCar = row.cars[0]
  return (
    <button type="button" aria-pressed={chosen} onClick={onPick} className="fx-edge fx-press flex items-center gap-3 rounded-control px-3 py-2.5 text-left">
      <Disc name={row.name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-t3 font-semibold text-text-primary">
          {row.name}
          {firstCar && carName(firstCar) ? ` · ${carName(firstCar)}` : ''}
        </span>
        <span className="block truncate text-[12px] text-[#A8A8B2]">
          Your customer · {row.visits} {row.visits === 1 ? 'visit' : 'visits'}
          {row.lastVisitAt ? ` · last ${shortDate(row.lastVisitAt)}` : ''}
          {chosen ? '' : ' · tap to use'}
        </span>
      </span>
      <RedLight state={chosen ? 'on' : 'dim'} className="w-[18px]" />
    </button>
  )
}

export default function NewWalkInPage() {
  return (
    <Suspense fallback={null}>
      <NewWalkInScreen />
    </Suspense>
  )
}
