'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { LoadError } from '@repo/ui/sc/load-error'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { ScSwitch } from '@repo/ui/sc/switch'
import { TopBar } from '@repo/ui/sc/top-bar'
import { IconTool } from '@tabler/icons-react'
import { useAnswerRepairQuote, useGarageRepairQuotes } from '@repo/core/api/hooks/use-repair-quotes'
import { REPAIR_QUOTE_RULES, typedRupees } from '@repo/core/repair-quotes'
import { cn } from '@repo/core/utils'
import { AnswerDeadline } from '@/components/answer-deadline'
import { carLine } from '@/components/repair-quote-card'

const R = REPAIR_QUOTE_RULES
const DAY_CHOICES = [1, 2, 3] as const

/** Whole rupees from what was typed ("4,000" → 4000; "4,000.50" → 4000), or null. */
const rupees = typedRupees

/**
 * "Your quote" (0076): the garage's estimate for a repair request — price
 * from and to, days needed, whether it must see the car first, and a note
 * for the customer — under the same answer timer as a new booking. Only
 * while it waits for this garage, in time; the API refuses anything else.
 */
export default function RepairQuoteAnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT()
  const { id } = use(params)
  const router = useRouter()
  const list = useGarageRepairQuotes('open')
  const answer = useAnswerRepairQuote()
  const quote = list.data?.items.find((item) => item.id === id)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [days, setDays] = useState<number | null>(null)
  const [moreDays, setMoreDays] = useState('4')
  const [needsInspection, setNeedsInspection] = useState(true)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const priceFrom = rupees(from)
  const priceTo = rupees(to)
  const dayCount = days === 4 ? rupees(moreDays) : days
  const problem =
    priceFrom === null || priceFrom < 1
      ? t('Enter a price from')
      : priceTo === null || priceTo < 1
        ? t('Enter a price to')
        : priceTo < priceFrom
          ? t('The price to must be the same as or above the price from')
          : priceTo > R.priceMax
            ? t('That price is too high')
            : dayCount === null || dayCount < 1 || dayCount > R.daysMax
              ? t('Pick the days needed')
              : null

  const send = async () => {
    if (problem || priceFrom === null || priceTo === null || dayCount === null) return
    setError(null)
    try {
      await answer.mutateAsync({
        quoteId: id,
        answer: { canDo: true, priceFrom, priceTo, days: dayCount, needsInspection, ...(note.trim() && { note: note.trim() }) },
      })
      toast.success(t('Quote sent. We’ll tell you if they book a visit.'))
      router.push('/requests')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not send the quote. Please try again.'))
    }
  }

  return (
    <AppShell showNav navType="vendor" className="gap-4 py-4">
      <TopBar showBack backHref="/requests" title={t('Your quote')} />
      {list.isLoading ? (
        <SkeletonList count={2} itemClassName="h-[200px]" />
      ) : list.isError && !list.data ? (
        <LoadError what={t('this request')} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : !quote ? (
        <EmptyState
          icon={<IconTool size={28} stroke={1.5} />}
          title={t('This request isn’t waiting for you')}
          subtitle={t('It was answered, closed, or its time ran out.')}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-[20px] border border-border bg-surface">
            <AnswerDeadline deadline={{ respondBy: quote.respondBy, enforced: true, windowMins: quote.answerWindowMins }} />
            <p className="px-5 pb-4 pt-3 text-[15px] text-text-secondary">
              {quote.title} · {carLine(quote, t)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ScInput
              label={t('Price from (₹)')}
              inputMode="numeric"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="font-numeric text-[15px]"
              placeholder="4,000"
            />
            <ScInput
              label={t('Price to (₹)')}
              inputMode="numeric"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="font-numeric text-[15px]"
              placeholder="5,500"
            />
          </div>

          <div className="flex flex-col gap-2">
            <p id="repair-days" className="text-[12px] text-text-secondary">
              {t('Days needed')}
            </p>
            <div role="radiogroup" aria-labelledby="repair-days" className="grid grid-cols-4 gap-2">
              {[...DAY_CHOICES, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={days === value}
                  onClick={() => setDays(value)}
                  className={cn(
                    'min-h-11 rounded-[12px] border font-numeric text-[14px] font-medium transition-colors',
                    days === value ? 'border-brand-white bg-brand-white text-brand-black' : 'border-border bg-surface text-text-primary'
                  )}
                >
                  {value === 4 ? '4+' : value}
                </button>
              ))}
            </div>
            {days === 4 && (
              <ScInput
                label={t('How many days?')}
                inputMode="numeric"
                value={moreDays}
                onChange={(event) => setMoreDays(event.target.value)}
                className="font-numeric"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[15px] text-text-primary">{t('Need to see the car first')}</span>
              <span className="text-[12px] text-text-secondary">{t('The customer sees this before booking.')}</span>
            </span>
            <ScSwitch checked={needsInspection} onChange={setNeedsInspection} label={t('Need to see the car first')} />
          </div>

          <ScTextarea
            label={t('Note for the customer (optional)')}
            value={note}
            maxLength={R.garageNoteMax}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('Can match the paint and polish the rest of the bumper.')}
          />

          <p className="text-[12px] text-text-secondary">
            {t('This is an estimate. You set the final bill at the garage. Anything above it goes to the customer as extra work for their OK.')}
          </p>
          {error && (
            <p role="alert" className="text-[13px] text-error">
              {error}
            </p>
          )}
          <ScButton
            variant="main"
            size="lg"
            onClick={() => void send()}
            disabled={Boolean(problem) || answer.isPending}
            disabledReason={problem ?? undefined}
          >
            {answer.isPending ? t('Sending…') : t('Send quote')}
          </ScButton>
        </div>
      )}
    </AppShell>
  )
}
