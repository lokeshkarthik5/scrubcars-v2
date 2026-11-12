'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import type { BookExpense, BookExpenses } from '@repo/core/api/garage-book'
import { useAddExpense, useBookExpenses, useBookTeam, useRemoveExpense, useUpdateExpense } from '@repo/core/api/hooks/use-garage-book'
import {
  EXPENSE_CATEGORIES,
  GARAGE_BOOK_2_LIMITS,
  expenseCategoryWord,
  istDateKey,
  monthName,
  recentMonths,
  rupees,
  shortDate,
  type ExpenseCategory,
  type ExpenseMethod,
} from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { msg, useT } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BackHeader, BookScreen, Field, LightChip, LoadFailed, OwnerOnly, Overline, Seg, Switch, errorText, raised, redButton } from '@/components/book/parts'

const METHODS = [
  { value: 'cash', label: msg('Cash') },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: msg('Bank') },
] as const

/**
 * Expenses (E1, the owner's): what the garage spent this month, by kind,
 * and what is left: profit = takings (Stats' whole garage: your own and
 * Detlio) − spent. Salaries and rent can repeat every month; a supply order
 * marked Received lands here by itself. A record only: no money moves.
 */
export default function ExpensesPage() {
  const t = useT()
  const isOwner = useIsVendorAdmin()
  const now = new Date()
  const months = recentMonths(now, 12)
  const [month, setMonth] = useState(months[0]!)
  const expenses = useBookExpenses(month === months[0] ? undefined : month, isOwner)
  const [editing, setEditing] = useState<BookExpense | 'new' | null>(null)
  const data = expenses.data

  return (
    <BookScreen>
      <BackHeader
        title={t('Expenses')}
        back="/book/business"
        right={
          isOwner ? (
            <label className={cn(raised, 'relative flex h-11 shrink-0 items-center gap-1.5 rounded-small pr-3 pl-3.5 text-t4 font-semibold text-text-primary')}>
              <span className="sr-only">{t('Month')}</span>
              <select value={month} onChange={(event) => setMonth(event.target.value)} className="appearance-none bg-transparent pr-4 outline-none">
                {months.map((key) => (
                  <option key={key} value={key} className="bg-[#17171b]">
                    {monthName(key, now)}
                  </option>
                ))}
              </select>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="pointer-events-none absolute right-3">
                <path d="M6 9l6 6l6 -6" />
              </svg>
            </label>
          ) : undefined
        }
      />
      {!isOwner ? (
        <OwnerOnly />
      ) : !data ? (
        expenses.isError ? <LoadFailed what={t('expenses')} onRetry={() => void expenses.refetch()} /> : <SkeletonList count={4} itemClassName="h-16" />
      ) : (
        <>
          <Summary data={data} thisMonth={month === months[0]} onAdd={() => setEditing('new')} />
          <Totals totals={data.totals} />
          {data.expenses.length === 0 ? (
            <p className="fx-edge rounded-control px-4 py-4 text-t4 text-[#A8A8B2]">{t('Nothing written down for this month yet.')}</p>
          ) : (
            <div>
              {data.expenses.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} onOpen={() => setEditing(expense)} />
              ))}
            </div>
          )}
        </>
      )}
      {editing && (
        <ExpenseSheet key={editing === 'new' ? 'new' : editing.id} expense={editing === 'new' ? null : editing} month={month} onClose={() => setEditing(null)} />
      )}
    </BookScreen>
  )
}

function Summary({ data, thisMonth, onAdd }: { data: BookExpenses; thisMonth: boolean; onAdd: () => void }) {
  const t = useT()
  // The bar: what was taken, the part spent in red at its end.
  const spentShare = data.takenPaise > 0 ? Math.min(1, data.spentPaise / data.takenPaise) : data.spentPaise > 0 ? 1 : 0
  return (
    <div className="fx-edge flex flex-col gap-3 rounded-surface p-4">
      <div className="flex items-end justify-between gap-3">
        <span className="min-w-0">
          <Overline>{thisMonth ? t('Spent this month') : t('Spent')}</Overline>
          <span className="block font-numeric text-[32px] font-semibold leading-10 text-text-primary">{rupees(data.spentPaise)}</span>
        </span>
        <span className="shrink-0 text-right">
          <Overline>{t('Profit')}</Overline>
          <span className={cn('block font-numeric text-[20px] font-semibold', data.profitPaise < 0 ? 'text-[#FF8A95]' : 'text-text-primary')}>{rupees(data.profitPaise)}</span>
        </span>
      </div>
      <div className="fx-recessed flex h-2 overflow-hidden rounded-[4px]" aria-hidden>
        <span className="gb-fill block h-full" style={{ width: `${Math.round((1 - spentShare) * 100)}%`, background: 'linear-gradient(180deg,#f2f2f5,#a5a5ae)' }} />
        <span className="gb-fill block h-full" style={{ width: `${Math.round(spentShare * 100)}%`, background: '#ff2d4a', boxShadow: '0 0 8px rgb(255 45 74 / .8)', '--gb-i': 1 } as React.CSSProperties} />
      </div>
      <p className="text-[12px] text-[#A8A8B2]">{t('Taken {taken} − spent {spent}', { taken: rupees(data.takenPaise) ?? '', spent: rupees(data.spentPaise) ?? '' })}</p>
      <button type="button" onClick={onAdd} className={cn(redButton, 'flex h-12 items-center justify-center gap-2 rounded-control text-t3 font-semibold')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        {t('Add expense')}
      </button>
    </div>
  )
}

function Totals({ totals }: { totals: BookExpenses['totals'] }) {
  const t = useT()
  const shown = EXPENSE_CATEGORIES.filter((category) => (totals[category] ?? 0) > 0)
  if (shown.length === 0) return null
  return (
    // Scrolls sideways when the kinds outgrow the width, as the mockup's row does.
    <ul aria-label={t('Spent by kind')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {shown.map((category) => (
        <li key={category} className={cn(raised, 'flex h-9 shrink-0 items-center gap-1.5 rounded-pill px-3.5 text-[13px] text-text-primary')}>
          <span className="font-medium">{expenseCategoryWord(category)}</span>
          <span className="font-numeric font-semibold">{rupees(totals[category])}</span>
        </li>
      ))}
    </ul>
  )
}

function methodWord(t: ReturnType<typeof useT>, method: ExpenseMethod | null): string | null {
  if (method === 'cash') return t('Cash')
  if (method === 'upi') return 'UPI'
  if (method === 'bank') return t('Bank')
  return null
}

function ExpenseRow({ expense, onOpen }: { expense: BookExpense; onOpen: () => void }) {
  const t = useT()
  const kind = expenseCategoryWord(expense.category)
  const title = expense.member ? `${kind} · ${expense.member.name}` : expense.note || kind
  const sub = [
    expense.member ? expense.note : null,
    expense.fromOrder?.supplier ?? null,
    methodWord(t, expense.method),
    expense.fromOrder ? t('from an order') : null,
    expense.member && expense.category === 'advance' ? t('in Team too') : null,
  ].filter(Boolean)
  return (
    <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 border-b border-[#1d1d23] py-2.5 text-left">
      <span className="w-12 shrink-0 text-[13px] text-[#A8A8B2]">{shortDate(`${expense.spentOn}T06:30:00Z`)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-t3 font-semibold text-text-primary">{title}</span>
          {expense.everyMonth && <span className="gb-tag-o">{t('Every month')}</span>}
        </span>
        {sub.length > 0 && <span className="mt-0.5 block truncate text-[12px] text-[#A8A8B2]">{sub.join(' · ')}</span>}
      </span>
      <span className="shrink-0 font-numeric text-[16px] font-semibold text-text-primary">{rupees(expense.amountPaise)}</span>
    </button>
  )
}

function ExpenseSheet({ expense, month, onClose }: { expense: BookExpense | null; month: string; onClose: () => void }) {
  const t = useT()
  const add = useAddExpense()
  const update = useUpdateExpense()
  const remove = useRemoveExpense()
  const team = useBookTeam(undefined)
  const today = istDateKey(new Date())
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'supplies')
  const [amount, setAmount] = useState(expense ? String(expense.amountPaise / 100) : '')
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? (today.startsWith(month) ? today : `${month}-01`))
  const [note, setNote] = useState(expense?.note ?? '')
  const [method, setMethod] = useState<ExpenseMethod>(expense?.method ?? 'cash')
  const [memberId, setMemberId] = useState<string | null>(expense?.member?.id ?? null)
  const [everyMonth, setEveryMonth] = useState(expense?.everyMonth ?? false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const paise = Math.round(Number(amount) * 100)
  const ok = Number.isFinite(paise) && paise >= 100 && paise <= GARAGE_BOOK_2_LIMITS.expenseMaxRupees * 100 && /^\d{4}-\d{2}-\d{2}$/.test(spentOn)
  const forPerson = category === 'salary' || category === 'advance'
  const busy = add.isPending || update.isPending || remove.isPending
  const failed = (error: unknown) => toast.error(errorText(error, t("Couldn't save. Try again.")))
  const members = team.data?.members ?? []

  const save = () => {
    const input = {
      category,
      amountPaise: paise,
      spentOn,
      method,
      everyMonth,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(forPerson && memberId ? { memberId } : {}),
    }
    if (expense) {
      update.mutate(
        { id: expense.id, patch: { ...input, note: note.trim() || null, memberId: forPerson ? memberId : null } },
        { onSuccess: onClose, onError: failed }
      )
    } else {
      add.mutate(input, {
        onSuccess: () => {
          toast.success(t('{amount} added to expenses', { amount: rupees(paise) ?? '' }))
          onClose()
        },
        onError: failed,
      })
    }
  }

  return (
    <ScSheet open onClose={onClose} aria-label={expense ? t('Change expense') : t('Add expense')} className="px-4">
      <div className="flex flex-col gap-4 pb-2">
        <h2 className="text-t2 font-semibold text-text-primary">{expense ? t('Change expense') : t('Add expense')}</h2>
        <div role="group" aria-label={t('What for')} className="grid grid-cols-3 gap-2">
          {EXPENSE_CATEGORIES.map((value) => (
            <LightChip key={value} label={expenseCategoryWord(value)} on={category === value} onClick={() => setCategory(value)} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field id="expense-amount" label={t('How much (₹)')} value={amount} onChange={(next) => setAmount(next.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="2000" />
          <Field id="expense-date" label={t('On')} type="date" value={spentOn} onChange={setSpentOn} />
        </div>
        {forPerson && members.length > 0 && (
          <div role="group" aria-label={t('For who')} className="flex flex-col gap-2">
            <span className="text-t4 font-semibold text-[#D4D4DA]">{t('For who')}</span>
            <div className="grid grid-cols-3 gap-2">
              {members.map((member) => (
                <LightChip key={member.id} label={member.name.split(/\s+/)[0] ?? member.name} on={memberId === member.id} onClick={() => setMemberId(memberId === member.id ? null : member.id)} />
              ))}
            </div>
          </div>
        )}
        <Field id="expense-note" label={t('Note (if you like)')} value={note} onChange={setNote} maxLength={GARAGE_BOOK_2_LIMITS.expenseNoteMax} placeholder={t('Shop rent')} />
        <Seg<ExpenseMethod> label={msg('Paid by')} value={method} onChange={setMethod} options={METHODS} />
        <div className="fx-edge flex items-center gap-3 rounded-control px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-t3 font-semibold text-text-primary">{t('Every month')}</span>
            <span className="block text-[12px] text-[#A8A8B2]">{t('Written down again each month by itself')}</span>
          </span>
          <Switch checked={everyMonth} onChange={setEveryMonth} label={t('Every month')} />
        </div>
        <button type="button" disabled={!ok || busy} onClick={save} className={cn(redButton, 'h-12 rounded-control text-t3 font-semibold')}>
          {busy ? t('Saving…') : expense ? t('Save') : t('Add expense')}
        </button>
        {expense && (
          <button
            type="button"
            disabled={busy}
            onClick={() => (confirmRemove ? remove.mutate(expense.id, { onSuccess: onClose, onError: failed }) : setConfirmRemove(true))}
            className="min-h-11 text-t4 font-medium text-[#FF8A95]"
          >
            {confirmRemove ? t('Tap again to delete it') : t('Delete this expense')}
          </button>
        )}
      </div>
    </ScSheet>
  )
}
