'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { IconBrandWhatsapp, IconPlus } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useBookCustomer, useSendReminder, useUpdateBookCustomer } from '@repo/core/api/hooks/use-garage-book'
import { carName, monthYear, plateText, rupees, shortDate, washWords } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { cn } from '@repo/core/utils'
import { NumberPlate } from '@repo/ui/finish/number-plate'
import { WashGauge } from '@repo/ui/finish/wash-gauge'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BackHeader, BookScreen, LoadFailed, Overline, Tag, Tile, raised } from '@/components/book/parts'
import { openReminder } from '@/components/book/reminders'

/**
 * One customer (S3): the plate, the wash gauge (moment 8: the customer
 * app's own WashStatusTile gauge), Visits / Spent / Owes (Spent and Owes the
 * owner's), Remind and New job, the full history (Detlio and walk-ins,
 * Detlio tagged) and a private team note. A Detlio customer has no phone
 * here, and gets their reminder from Detlio.
 */
export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params)
  const id = decodeURIComponent(raw)
  // One screen per customer, so a typed note never carries to the next one.
  return <CustomerScreen key={id} id={id} />
}

function CustomerScreen({ id }: { id: string }) {
  const isOwner = useIsVendorAdmin()
  const customer = useBookCustomer(id)
  const send = useSendReminder()
  const save = useUpdateBookCustomer()
  const [note, setNote] = useState<string | null>(null)
  const c = customer.data
  const now = new Date()

  if (!c) {
    return (
      <BookScreen>
        <BackHeader title="Customer" back="/book/customers" />
        {customer.isError ? <LoadFailed what="this customer" onRetry={() => void customer.refetch()} /> : <SkeletonList count={3} itemClassName="h-24" />}
      </BookScreen>
    )
  }

  const sub = c.viaDetlio
    ? `Via Detlio · since ${monthYear(c.since)}`
    : [c.phone ? `+91 ${c.phone.slice(0, 5)} ${c.phone.slice(5)}` : null, `your customer since ${monthYear(c.since)}`].filter(Boolean).join(' · ')

  return (
    <BookScreen>
      <BackHeader title={c.name} back="/book/customers" sub={sub} />

      {c.cars.map((car) => {
        const words = washWords(car.wash, now)
        const plate = plateText(car.plate)
        return (
          <div key={car.id} className="fx-edge flex items-center gap-3 rounded-surface px-4 py-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {plate && <NumberPlate plate={plate} size="sm" className="h-[30px]" />}
              <span className="text-[14px] font-semibold text-text-primary">{[carName(car), car.colour].filter(Boolean).join(' · ') || 'Car'}</span>
              <span className="text-[12px] text-[#A8A8B2]">
                <b className="font-medium text-[#FAFAFA]">{words.lead}</b>
                {words.rest}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <span className="px-1">
                <WashGauge daysSinceWash={car.wash.daysSinceWash} intervalDays={car.wash.intervalDays} over={car.wash.dueState === 'overdue'} />
              </span>
              {car.wash.daysSinceWash !== null && (
                <span className="flex items-baseline gap-1">
                  <span className="font-numeric text-[28px] leading-[0.9] font-medium tracking-[-0.045em] text-text-primary">{car.wash.daysSinceWash}</span>
                  <span className="text-[11px] text-[#A8A8B2]">{car.wash.daysSinceWash === 1 ? 'day ago' : 'days ago'}</span>
                </span>
              )}
            </div>
          </div>
        )
      })}

      <div className={cn('grid gap-2', isOwner ? 'grid-cols-3' : 'grid-cols-1')}>
        <Tile label="Visits" value={c.visits} />
        {isOwner && <Tile label="Spent" value={rupees(c.spentPaise) ?? '–'} />}
        {isOwner && <Tile label="Owes" value={rupees(c.owesPaise) ?? '₹0'} />}
      </div>

      <div className={cn('grid gap-2', c.viaDetlio ? 'grid-cols-1' : 'grid-cols-2')}>
        <button
          type="button"
          disabled={send.isPending || (!c.viaDetlio && !c.phone)}
          onClick={() => openReminder(send, c.id, c.name)}
          className={cn(raised, 'flex h-12 items-center justify-center gap-2 rounded-control text-[14px] font-semibold text-text-primary')}
        >
          <IconBrandWhatsapp size={18} aria-hidden />
          {c.viaDetlio ? 'Remind via Detlio' : c.phone ? 'Remind' : 'Add a phone to remind'}
        </button>
        {!c.viaDetlio && (
          <Link href={`/book/new?customer=${encodeURIComponent(c.id)}`} className={cn(raised, 'flex h-12 items-center justify-center gap-2 rounded-control text-[14px] font-semibold text-text-primary')}>
            <IconPlus size={18} aria-hidden />
            New job
          </Link>
        )}
      </div>

      <div>
        <Overline>History · Detlio and yours</Overline>
        {c.history.length === 0 ? (
          <p className="py-3 text-t4 text-[#A8A8B2]">No visits yet.</p>
        ) : (
          c.history.map((h) => (
            <div key={`${h.source}-${h.id}`} className="flex gap-3 border-b border-[#1d1d23] py-3">
              <div className="w-14 shrink-0 pt-0.5 text-[12px] text-[#A8A8B2]">{shortDate(h.at) || ''}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[14px] font-semibold text-text-primary">
                  <span className="truncate">{h.lines.join(', ') || 'Job'}</span>
                  {h.source === 'detlio' ? <Tag detlio /> : <Tag>walk-in</Tag>}
                </div>
                <div className="mt-0.5 text-[12px] text-[#A8A8B2]">
                  {h.source === 'detlio' ? `Detlio booking · ${h.status}` : `Walk-in · ${h.payment === 'later' ? 'Pay later' : h.payment.toUpperCase()}${h.status !== 'done' ? ` · ${h.status.replace('_', ' ')}` : ''}`}
                </div>
              </div>
              {h.amountPaise !== undefined && <div className="shrink-0 font-numeric text-[14px] font-semibold text-text-primary">{rupees(h.amountPaise)}</div>}
            </div>
          ))
        )}
      </div>

      <div className="fx-recessed rounded-control px-3.5 py-3">
        <label htmlFor="team-note">
          <Overline>Your note · only your team sees it</Overline>
        </label>
        <textarea
          id="team-note"
          rows={2}
          maxLength={500}
          value={note ?? c.note ?? ''}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if (note === null || note === (c.note ?? '')) return
            save.mutate(
              { id: c.id, patch: { note: note.trim() || null } },
              {
                onSuccess: () => toast.success('Note saved'),
                onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save the note."),
              }
            )
          }}
          placeholder="Likes tyre shine. Pays on UPI."
          className="mt-1 w-full resize-none border-0 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-[#8A8A94]"
        />
      </div>
    </BookScreen>
  )
}
