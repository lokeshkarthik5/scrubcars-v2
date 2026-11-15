import type { AdminRepairFilter, AdminRepairRequest } from '@repo/core/api/repair-quotes'
import { formatClock } from '@repo/core/format'
import { priceRangeLabel, timeLeftLabel } from '@repo/core/repair-quotes'

/** Admin's Repair quotes chips (0075), in the order drawn. */
export const REPAIR_FILTERS: Array<{ value: AdminRepairFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'booked', label: 'Booked' },
  { value: 'no_quote', label: 'No quote' },
  { value: 'expired', label: 'Expired' },
]

/** The page's `?filter=`, Open when missing or unknown. */
export function parseRepairFilter(value: string | null): AdminRepairFilter {
  return REPAIR_FILTERS.some((option) => option.value === value) ? (value as AdminRepairFilter) : 'open'
}

export function repairQuotesHref(filter: AdminRepairFilter): string {
  return filter === 'open' ? '/requests/repair-quotes' : `/requests/repair-quotes?filter=${filter}`
}

export type RepairTone = 'attention' | 'progress' | 'done' | 'late' | 'closed'

/** The request's chip: words and tone. */
export function repairStateChip(request: AdminRepairRequest): { label: string; tone: RepairTone } {
  const quoted = request.quotes.filter((quote) => quote.state === 'quoted').length
  if (request.state === 'booked') return { label: 'Visit booked', tone: 'done' }
  if (request.state === 'cancelled') return { label: 'Cancelled by customer', tone: 'closed' }
  if (request.filter === 'no_quote') return { label: 'No quote', tone: 'late' }
  if (request.state === 'expired') return { label: 'Expired', tone: 'closed' }
  if (quoted > 0) return { label: quoted === 1 ? '1 quote in' : `${quoted} quotes in`, tone: 'progress' }
  return { label: 'No answer yet', tone: 'attention' }
}

/** "Sent to 4 garages · answers by 2:40 pm · open until Mon 10:40 am", or how it ended. */
export function repairClockLine(request: AdminRepairRequest, now: number): string {
  const sent = request.quotes.length === 1 ? 'Sent to 1 garage' : `Sent to ${request.quotes.length} garages`
  if (request.state !== 'open') return sent
  const parts = [sent]
  if (request.answerBy) {
    const left = Date.parse(request.answerBy) - now
    parts.push(left < 2 * 60 * 60 * 1000 ? `${timeLeftLabel(left)} left` : `answers by ${formatClock(request.answerBy)}`)
  }
  parts.push(`open until ${openUntil(request.closesAt)}`)
  return parts.join(' · ')
}

const WEEKDAY = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })

function openUntil(iso: string): string {
  return `${WEEKDAY.format(new Date(iso))} ${formatClock(iso)}`
}

/** One garage's answer on the card: "₹4,000–5,500 · 2 days · needs to see car", "can't do", "waiting". */
export function repairQuoteLine(quote: AdminRepairRequest['quotes'][number]): string {
  switch (quote.state) {
    case 'quoted': {
      const parts = [priceRangeLabel(quote.priceFrom ?? 0, quote.priceTo ?? 0)]
      if (quote.days !== null) parts.push(quote.days === 1 ? '1 day' : `${quote.days} days`)
      if (quote.needsInspection) parts.push('needs to see car')
      if (quote.bookingId) parts.push('visit booked')
      return parts.join(' · ')
    }
    case 'declined':
      return quote.declineReason ? `can’t do: “${quote.declineReason}”` : 'can’t do'
    case 'missed':
      return 'no answer in time'
    case 'closed':
      return 'closed before answering'
    default:
      return `waiting · by ${formatClock(quote.respondBy)}`
  }
}
