'use client'

import { useState } from 'react'
import { IconMapPin, IconQrcode } from '@tabler/icons-react'
import { DetlioMark, GoogleMapsText, GoogleMark } from '@repo/ui/sc/rating-marks'
import type { LinkBookResult, PublicLinkPage } from '@repo/core/api/garage-book'
import { useBookOnLink } from '@repo/core/api/hooks/use-garage-book'
import { addDays, dayLabel, initials, istDateKey, jobTime, rupees, spacedPhone } from '@repo/core/garage-book'
import { cn } from '@repo/core/utils'
import { RedLight } from '@repo/ui/finish/red-light'

const label = 'text-[14px] font-semibold text-[#D4D4DA]'
const well =
  'h-12 w-full rounded-control border border-[#1a1a20] bg-[#0b0b0e] px-4 text-[16px] text-text-primary shadow-[inset_0_2px_6px_rgb(0_0_0/0.7),inset_0_-1px_0_rgb(255_255_255/0.06)] outline-none placeholder:text-[#8A8A94] focus-visible:border-[#3a3a44]'

/** "Today, Wed 12 Nov", "Tomorrow, Thu 13 Nov", "Sat 15 Nov". */
function dayName(date: string, today: string): string {
  if (date === today) return `Today, ${dayLabel(date)}`
  if (date === addDays(today, 1)) return `Tomorrow, ${dayLabel(date)}`
  return dayLabel(date)
}

/** "10:30 am": a time as the customer reads it, in India's time. */
function timeText(iso: string): string {
  const hours = new Date(new Date(iso).getTime() + 330 * 60_000).getUTCHours()
  return `${jobTime(iso)} ${hours < 12 ? 'am' : 'pm'}`
}

/**
 * The booking page's form (L2): the garage on top, its services to pick
 * from, the next days' times, name and phone, how to pay at the garage, and
 * "Book · pay at the garage". The answer is a booking, or (decision 5) a
 * note that this customer books this garage in Detlio, with the link.
 */
export function LinkBooking({ slug, page }: { slug: string; page: PublicLinkPage }) {
  const book = useBookOnLink(slug)
  const today = istDateKey(new Date())
  const days = page.days.filter((day) => day.times.length > 0)
  const [serviceId, setServiceId] = useState<string | null>(page.services.length === 1 ? page.services[0]!.id : null)
  const [date, setDate] = useState<string | null>(days[0]?.date ?? null)
  const [at, setAt] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState<LinkBookResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
  const ready = Boolean(serviceId && at && name.trim() && digits.length === 10)
  const day = days.find((d) => d.date === date) ?? null
  const { garage } = page

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready || !serviceId || !at) return
    setError(null)
    book.mutate(
      { serviceId, at, name: name.trim(), phone: digits },
      {
        onSuccess: setResult,
        onError: (failure) => setError(failure instanceof Error && failure.message ? failure.message : 'Couldn’t book that. Please try again.'),
      }
    )
  }

  const header = (
    <header className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-14 shrink-0 place-items-center rounded-[16px] text-[17px] font-semibold text-[#E4E4EA] shadow-[inset_0_1px_0_rgb(255_255_255/0.07),inset_0_-4px_8px_rgb(0_0_0/0.45),0_0_0_1px_rgb(255_255_255/0.06)]"
        style={{ background: 'radial-gradient(circle at 50% 30%, #26262b 0%, #18181b 60%, #121214 100%)' }}
      >
        {initials(garage.name)}
      </span>
      <div className="min-w-0">
        <h1 className="text-[20px] leading-7 font-semibold break-words text-text-primary">{garage.name}</h1>
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-[#A8A8B2]">
          {garage.area && (
            <span className="inline-flex items-center gap-1">
              <IconMapPin size={14} aria-hidden />
              {garage.area}
            </span>
          )}
          <span aria-hidden>·</span>
          <span className={garage.openNow ? 'text-[#4ADE80]' : undefined}>{garage.openNow ? 'Open now' : 'Closed now'}</span>
          {garage.google ? (
            // Google's rating while it is the garage's main one (a linked
            // garage under 5 counted Detlio reviews, 21 Nov 2026).
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <GoogleMark size={12} />
                {garage.google.rating.toFixed(1)}
                <GoogleMapsText className="ml-0.5" />
              </span>
            </>
          ) : (
            garage.rating !== null && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <DetlioMark size={13} rating={garage.rating} />
                  <span aria-hidden="true">{garage.rating.toFixed(1)}</span>
                </span>
              </>
            )
          )}
        </p>
      </div>
    </header>
  )

  if (result?.detlio) {
    return (
      <>
        {header}
        <div role="status" className="fx-edge flex flex-col gap-3 rounded-[20px] p-4">
          <p className="text-t3 font-semibold text-text-primary">You&apos;ve booked this garage on Detlio before</p>
          <p className="text-t4 text-[#A8A8B2]">Book in Detlio to keep your bookings, receipts and car history in one place.</p>
          <a href={result.url} className="fx-red-button fx-press flex h-12 items-center justify-center rounded-control text-t3 font-semibold">
            Book in Detlio
          </a>
        </div>
      </>
    )
  }

  if (result && !result.detlio) {
    const done = result.booked
    return (
      <>
        {header}
        <div role="status" className="fx-edge flex flex-col gap-2 rounded-[20px] p-4">
          <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#8E8E98]">Booked</span>
          <p className="text-t2 font-semibold text-text-primary">{done.service}</p>
          <p className="text-t4 text-[#D4D4DA]">
            {dayName(istDateKey(new Date(done.at)), today)} · {timeText(done.at)}
          </p>
          <p className="text-t4 text-[#A8A8B2]">
            At {done.garage}. Pay {rupees(done.pricePaise)} at the garage, by cash or UPI. The garage may call or WhatsApp you to confirm.
          </p>
        </div>
      </>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {header}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[10px] font-semibold tracking-[0.1em] uppercase text-[#8E8E98]">Pick a service</legend>
        {page.services.length === 0 ? (
          <p className="text-t4 text-[#A8A8B2]">This garage isn&apos;t taking bookings here just now. Call them instead.</p>
        ) : (
          page.services.map((service) => {
            const on = service.id === serviceId
            return (
              <button
                key={service.id}
                type="button"
                aria-pressed={on}
                onClick={() => setServiceId(service.id)}
                className="fx-raised fx-press flex min-h-[60px] items-center justify-between gap-3 rounded-[18px] px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-text-primary">{service.name}</span>
                  {service.durationMins && <span className="block text-[12px] text-[#A8A8B2]">{service.durationMins} min</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="font-numeric text-[16px] font-semibold text-text-primary">{rupees(service.pricePaise)}</span>
                  <RedLight state={on ? 'on' : 'dim'} className="w-[22px]" />
                </span>
              </button>
            )
          })
        )}
      </fieldset>

      {days.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[10px] font-semibold tracking-[0.1em] uppercase text-[#8E8E98]">{day ? dayName(day.date, today) : 'Pick a day'}</legend>
          {days.length > 1 && (
            <div role="group" aria-label="Day" className="flex gap-2">
              {days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={d.date === date}
                  onClick={() => {
                    setDate(d.date)
                    setAt(null)
                  }}
                  className={cn('fx-raised fx-press h-11 min-w-0 flex-1 rounded-[14px] px-2 text-[13px]', d.date === date ? 'font-semibold text-text-primary' : 'font-medium text-[#A8A8B2]')}
                >
                  <span className="block truncate">{d.date === today ? 'Today' : d.date === addDays(today, 1) ? 'Tomorrow' : dayLabel(d.date).split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}
          <div role="group" aria-label="Time" className="grid grid-cols-3 gap-2">
            {day?.times.map((time) => {
              const on = time === at
              return (
                <button
                  key={time}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAt(time)}
                  className={cn('fx-raised fx-press flex h-11 flex-col items-center justify-center gap-1 rounded-[14px] font-numeric text-[15px]', on ? 'font-semibold text-text-primary' : 'text-[#A8A8B2]')}
                >
                  {timeText(time)}
                  {on && <RedLight className="w-[18px]" />}
                </button>
              )
            })}
          </div>
        </fieldset>
      ) : (
        <p className="text-t4 text-[#A8A8B2]">No free times in the next few days. Call the garage to book.</p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="book-name" className={label}>
          Your name
        </label>
        <input id="book-name" autoComplete="given-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className={well} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="book-phone" className={label}>
          Phone
        </label>
        <input
          id="book-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98400 12345"
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/[^\d +]/g, '').slice(0, 16))}
          aria-describedby="book-phone-why"
          className={cn(well, 'font-numeric')}
        />
        <p id="book-phone-why" className="text-[12px] text-[#A8A8B2]">
          Only the garage sees it, to confirm your booking.
        </p>
      </div>

      <div className="fx-edge flex items-center gap-3 rounded-[18px] px-3.5 py-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[10px] text-[#D4D4DA] shadow-[inset_0_1px_0_rgb(255_255_255/0.07),0_0_0_1px_rgb(255_255_255/0.06)]"
          style={{ background: 'radial-gradient(circle at 50% 30%, #26262b 0%, #18181b 60%, #121214 100%)' }}
        >
          <IconQrcode size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-text-primary">Pay at the garage</span>
          <span className="block text-[12px] text-[#A8A8B2]">
            Cash or UPI
            {page.pay?.phone && (
              <>
                {' · '}
                {page.pay.appsText ? `${page.pay.appsText.replaceAll('/', ' / ')} ` : 'UPI '}
                <b className="font-numeric font-semibold text-text-primary">{spacedPhone(page.pay.phone)}</b>
              </>
            )}
          </span>
        </span>
      </div>

      {error && (
        <p role="alert" className="text-[13px] font-semibold text-[#FF8A95]">
          {error}
        </p>
      )}

      <button type="submit" disabled={!ready || book.isPending} className="fx-red-button fx-press h-[52px] rounded-control text-t3 font-semibold">
        {book.isPending ? 'Booking…' : 'Book · pay at the garage'}
      </button>
      <p className="text-center text-[12px] text-[#A8A8B2]">The garage confirms on WhatsApp · booked with Detlio for Garages</p>
    </form>
  )
}
