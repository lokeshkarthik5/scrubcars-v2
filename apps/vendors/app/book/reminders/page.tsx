'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import type { ReminderEntry } from '@repo/core/api/garage-book'
import { useBookReminders, useSaveReminderMessage, useSendReminder } from '@repo/core/api/hooks/use-garage-book'
import { carName, fillReminder, GARAGE_BOOK_LIMITS, messageRefusal, reminderReason, rupees } from '@repo/core/garage-book'
import { msg, useT, useTn } from '@repo/core/i18n'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { RedLight } from '@repo/ui/finish/red-light'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BackHeader, BookScreen, Footnote, LoadFailed, Overline, Seg, Tag, raised } from '@/components/book/parts'
import { openReminder } from '@/components/book/reminders'

type View = 'today' | 'week' | 'rules'

/**
 * Reminders (S4): the message, which the garage can edit (no links); today's
 * due list with WhatsApp for its own customers (wa.me, then marked sent) and
 * Via Detlio for Detlio customers (a free app notification); "Sent ✓" with
 * the red light once done. This week shows who comes due next.
 *
 * 0074, moment 5 (the reminder that pays back): what customers who came
 * back after a reminder brought in this month, the owner's proof the book
 * makes money. The job itself says so in a toast as it is saved.
 */
export default function RemindersPage() {
  const t = useT()
  const [view, setView] = useState<View>('today')
  const reminders = useBookReminders()
  const send = useSendReminder()
  // Filled into the message the customer gets, which stays English.
  const garage = useAuthStore((s) => s.vendor?.businessName) ?? 'your garage'
  const data = reminders.data
  const list = data ? (view === 'week' ? data.week : data.due) : []
  const example = data?.due[0] ?? data?.week[0]

  return (
    <BookScreen>
      <BackHeader title={t('Reminders')} back="/book/customers" />
      <Seg<View>
        label={msg('Show reminders')}
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: msg('Today'), count: data?.due.filter((r) => !r.sentAt).length },
          { value: 'week', label: msg('This week'), count: data?.week.length },
          { value: 'rules', label: msg('Rules') },
        ]}
      />
      {!data ? (
        reminders.isError ? <LoadFailed what={t('reminders')} onRetry={() => void reminders.refetch()} /> : <SkeletonList count={4} itemClassName="h-16" />
      ) : view === 'rules' ? (
        <Rules message={data.message} interval={data.defaultIntervalDays} />
      ) : (
        <>
          <PaidBack earnedPaise={data.earnedThisMonthPaise} cameBack={data.cameBack} />
          <button type="button" onClick={() => setView('rules')} className="fx-edge rounded-surface px-4 py-3.5 text-left">
            <Overline>{t('The message · you can edit it')}</Overline>
            <p className="mt-1.5 text-[14px] leading-[21px] text-text-primary">
              {fillReminder(data.message, {
                name: example?.name ?? 'Suresh',
                car: carName(example?.car) || null,
                garage,
                phone: null,
              })}
            </p>
          </button>
          {list.length === 0 ? (
            <p className="fx-edge rounded-control px-4 py-4 text-t4 text-[#A8A8B2]">
              {view === 'week' ? t('No one comes due this week.') : t('No one is due today.')}
            </p>
          ) : (
            <div>
              {list.map((entry) => (
                <ReminderRow key={entry.customerId} entry={entry} busy={send.isPending && send.variables === entry.customerId} onSend={() => openReminder(send, entry.customerId, entry.name)} />
              ))}
            </div>
          )}
          <Footnote>
            {t(
              'WhatsApp opens on your phone with the message ready, and you press Send. Free. Detlio customers get your reminder as a Detlio app notification, also free.'
            )}
          </Footnote>
        </>
      )}
    </BookScreen>
  )
}

/** Moment 5's card: shown once anyone has come back after a reminder this month. */
function PaidBack({ earnedPaise, cameBack }: { earnedPaise?: number; cameBack?: number }) {
  const t = useT()
  const tn = useTn()
  if (!cameBack) return null
  const amount = rupees(earnedPaise)
  return (
    <div className="gb-rise fx-edge rounded-surface px-4 py-3.5">
      <Overline>{t('This month')}</Overline>
      <p className="mt-1.5 text-t3 font-semibold text-text-primary">
        {tn(cameBack, '{count} customer came back after a reminder', '{count} customers came back after a reminder')}
      </p>
      {amount && (
        <p className="mt-3 flex flex-wrap items-center gap-2">
          <span className="fx-silver rounded-[6px] px-2 py-[3px] text-[10px] font-bold tracking-[0.08em] uppercase">{t('Reminders earned {amount}', { amount })}</span>
          <span className="text-[11px] text-[#A8A8B2]">{t('this month')}</span>
        </p>
      )}
    </div>
  )
}

function ReminderRow({ entry, busy, onSend }: { entry: ReminderEntry; busy: boolean; onSend: () => void }) {
  const t = useT()
  return (
    <div className="flex items-center gap-3 border-b border-[#1d1d23] py-3">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-t3 font-semibold text-text-primary">
          <span className="truncate">{entry.name}</span>
          {entry.source === 'detlio' && <Tag detlio />}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-[#A8A8B2]">{reminderReason(entry)}</span>
      </span>
      {entry.sentAt ? (
        <span className={cn(raised, 'flex h-10 w-24 shrink-0 flex-col items-center justify-center rounded-small text-t4 font-semibold text-text-primary')}>
          {t('Sent ✓')}
          <RedLight className="mt-[3px] w-7" />
        </span>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={!entry.canSend || busy}
          className={cn(raised, 'h-10 w-24 shrink-0 rounded-small text-t4 font-semibold text-text-primary disabled:text-[#8E8E98]')}
        >
          {!entry.canSend ? t('No mobile') : entry.channel === 'whatsapp' ? 'WhatsApp' : t('Via Detlio')}
        </button>
      )}
    </div>
  )
}

function Rules({ message, interval }: { message: string; interval: number }) {
  const t = useT()
  const [text, setText] = useState(message)
  const [days, setDays] = useState(String(interval))
  const save = useSaveReminderMessage()
  const refusal = messageRefusal(text)
  const daysNumber = Number(days)
  const daysOk = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 365
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="reminder-message" className="text-t4 font-semibold text-[#D4D4DA]">
        {t('The message')}
      </label>
      <textarea
        id="reminder-message"
        rows={5}
        maxLength={GARAGE_BOOK_LIMITS.messageMax}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="fx-recessed resize-none rounded-control px-3.5 py-3 text-[14px] leading-[21px] text-text-primary outline-none"
      />
      <Footnote>
        {t('{name} becomes their first name, {car} their car, {garage} your garage and {phone} your number. No links.', {
          name: '{name}',
          car: '{car}',
          garage: '{garage}',
          phone: '{phone}',
        })}
      </Footnote>
      {refusal && text.trim() !== '' && <p className="text-[12px] font-semibold text-[#FF8A95]">{refusal}</p>}
      <label htmlFor="reminder-days" className="text-t4 font-semibold text-[#D4D4DA]">
        {t('Remind to wash again after (days)')}
      </label>
      <input
        id="reminder-days"
        inputMode="numeric"
        value={days}
        onChange={(event) => setDays(event.target.value.replace(/\D/g, '').slice(0, 3))}
        className="fx-recessed h-12 w-28 rounded-control px-3.5 font-numeric text-t3 text-text-primary outline-none"
      />
      <button
        type="button"
        disabled={Boolean(refusal) || !daysOk || save.isPending}
        onClick={() =>
          save.mutate(
            { message: text.trim(), defaultIntervalDays: daysNumber },
            {
              onSuccess: () => toast.success(t('Saved')),
              onError: (error) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again.")),
            }
          )
        }
        className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary')}
      >
        {save.isPending ? t('Saving…') : t('Save')}
      </button>
    </div>
  )
}
