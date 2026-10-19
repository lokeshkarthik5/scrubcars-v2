'use client'

import Link from 'next/link'
import {
  IconShieldCheck,
  IconShieldX,
  IconArrowUpRight,
  IconBell,
  IconBuildingStore,
  IconCalendarCheck,
  IconCalendarQuestion,
  IconCalendarRepeat,
  IconCalendarX,
  IconCar,
  IconCircleCheck,
  IconClock,
  IconFileInvoice,
  IconGift,
  IconMessageCheck,
  IconMessageDots,
  IconMessageX,
  IconPhoto,
  IconPlayerPause,
  IconReceipt,
  IconReceiptRefund,
  IconSpeakerphone,
  IconStar,
  IconSparkles,
  IconTool,
  IconToolsOff,
  IconTruckDelivery,
  IconX,
} from '@tabler/icons-react'
import type { UpdateKind } from '@repo/core/api/home'
import { updateTimeLabel } from '@repo/core/home-display'
import { cn } from '@repo/core/utils'

const KIND_ICONS: Record<UpdateKind, typeof IconTool> = {
  notice: IconSpeakerphone,
  accepted: IconCalendarCheck,
  reminder: IconClock,
  started: IconTool,
  completed: IconCircleCheck,
  photos: IconPhoto,
  bill_due: IconReceipt,
  bill_not_needed: IconReceipt,
  bill_paid: IconReceipt,
  receipt_ready: IconFileInvoice,
  declined: IconCalendarX,
  cancelled: IconCalendarX,
  refunded: IconReceiptRefund,
  moved: IconCalendarRepeat,
  garage_paused: IconPlayerPause,
  complaint_acknowledged: IconMessageDots,
  complaint_resolved: IconMessageCheck,
  complaint_closed: IconMessageX,
  // Pickup & drop's handover steps.
  picked_up: IconCar,
  at_garage: IconBuildingStore,
  out_for_delivery: IconTruckDelivery,
  // Suggested times and extra work (0041).
  time_proposal: IconCalendarQuestion,
  extra_work_due: IconTool,
  extra_work_paid: IconTool,
  extra_work_declined: IconToolsOff,
  extra_work_withdrawn: IconToolsOff,
  // A coating or detailing follow-up (0046), opening the car's page.
  service_reminder: IconSparkles,
  // "Notify me if a slot opens" (0047): it opens checkout on that day.
  slot_opened: IconBell,
  // A confirmed bypass report's reward (0052), opening Detlio credit.
  report_reward: IconGift,
  // Free redo claims (Detlio Guarantee, 0051).
  redo_claim: IconShieldCheck,
  redo_approved: IconShieldCheck,
  redo_refund: IconReceiptRefund,
  redo_not_approved: IconShieldX,
  redo_closed: IconShieldX,
  // Detlio Rewards (0050): each opens the Rewards page (a nudge, where it points).
  reward_card: IconStar,
  reward_voucher: IconGift,
  reward_nudge: IconStar,
}

export interface UpdateRowData {
  kind: UpdateKind
  title: string
  body: string | null
  at: string
  unread: boolean
  bookingId: string | null
  /** Who it is from, for a notice: the team, not a garage. */
  from?: string | null
  linkUrl?: string | null
  linkLabel?: string | null
}

/**
 * One row of Updates, on Home and on /updates: a soft icon disc, the line
 * itself, the detail under it and when, and a dot while it is unread. The
 * row opens the booking it is about; a team notice opens its own link, if
 * it has one, and can be closed with ×.
 */
export function UpdateRow({
  row,
  now,
  pinned = false,
  onDismiss,
}: {
  row: UpdateRowData
  now: Date
  pinned?: boolean
  onDismiss?: () => void
}) {
  const Icon = KIND_ICONS[row.kind]
  // One way to write a time on every screen (F10): "6:00 pm", not "6:00 PM".
  const when = updateTimeLabel(row.at, now).replace(
    /\b(AM|PM)\b/g,
    (meridiem) => meridiem.toLowerCase()
  )
  const meta = [row.from, row.body, when].filter(Boolean).join(' · ')
  const href =
    row.linkUrl ?? (row.bookingId ? `/bookings/${row.bookingId}` : null)
  const external = !!row.linkUrl && row.linkUrl.startsWith('https://')

  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full text-text-primary',
          pinned ? 'bg-white/10' : 'bg-white/[0.06]'
        )}
      >
        <Icon size={20} stroke={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'line-clamp-2 text-[17px] leading-[1.32] tracking-[-0.012em]',
            row.unread ? 'text-text-primary' : 'text-[#E4E4E7]'
          )}
        >
          {row.title}
          {row.unread && <span className="sr-only"> (new)</span>}
        </span>
        {meta && (
          <span className="mt-1 line-clamp-2 block text-[13px] text-dim">
            {meta}
          </span>
        )}
        {row.linkUrl && row.linkLabel && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-text-primary">
            {row.linkLabel}
            <IconArrowUpRight size={14} stroke={1.6} aria-hidden />
          </span>
        )}
      </span>
    </>
  )

  const main = 'flex min-w-0 flex-1 items-start gap-3.5 py-4 pl-4'

  return (
    <li
      data-update={row.kind}
      className="update-row relative flex items-start pr-2"
    >
      {href === null ? (
        <div className={main}>{content}</div>
      ) : external ? (
        <a href={href} target="_blank" rel="noopener" className={main}>
          {content}
        </a>
      ) : (
        <Link href={href} className={main}>
          {content}
        </Link>
      )}
      <span className="flex shrink-0 items-start pt-[13px]">
        {row.unread && (
          <span
            aria-hidden
            data-testid="unread-dot"
            className="mt-[9px] mr-2 size-[7px] rounded-full bg-brand-red"
          />
        )}
        {onDismiss && (
          <button
            type="button"
            aria-label={`Hide notice: ${row.title}`}
            onClick={onDismiss}
            className="grid size-11 place-items-center text-dim"
          >
            <IconX size={18} stroke={1.5} aria-hidden />
          </button>
        )}
        {!row.unread && !onDismiss && <span className="w-2" />}
      </span>
    </li>
  )
}

/** A card of rows with hairlines between them, inset past the icon. */
export function UpdateList({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <ul aria-label={label} className="update-list hub-card py-1">
      {children}
    </ul>
  )
}
