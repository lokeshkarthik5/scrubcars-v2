'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import type { BookOwed } from '@repo/core/api/garage-book'
import { useBookOwed, useMarkPaid } from '@repo/core/api/hooks/use-garage-book'
import { whatsAppHref } from '@repo/core/contact-links'
import { owedMessage, owedSummary, rupees, shortDate } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { msg, useT } from '@repo/core/i18n'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BackHeader, BookScreen, LoadFailed, Overline, Seg, raised } from '@/components/book/parts'

/**
 * Money owed (S5, the owner's): the total, each customer with Ask on
 * WhatsApp (the garage's own WhatsApp, no link in the message) and Mark
 * paid, and what was paid back lately. A record only: customers pay the
 * garage in cash or UPI, and Detlio takes no money here.
 */
export default function OwedPage() {
  const t = useT()
  const isOwner = useIsVendorAdmin()
  const owed = useBookOwed(isOwner)
  // The name in the WhatsApp the customer gets, which stays English.
  const garage = useAuthStore((s) => s.vendor?.businessName) ?? 'your garage'
  const [paying, setPaying] = useState<BookOwed['customers'][number] | null>(null)
  const data = owed.data

  return (
    <BookScreen>
      <BackHeader title={t('Money owed')} back="/book/business" />
      {!isOwner ? (
        <p className="fx-edge rounded-control px-4 py-4 text-t4 text-[#A8A8B2]">{t("Only the garage's owner sees money.")}</p>
      ) : !data ? (
        owed.isError ? <LoadFailed what={t('money owed')} onRetry={() => void owed.refetch()} /> : <SkeletonList count={3} itemClassName="h-28" />
      ) : (
        <>
          <div className="fx-edge rounded-surface p-4">
            <Overline>{t('Owed to you')}</Overline>
            <p className="font-numeric text-[34px] font-semibold leading-[42px] text-text-primary">{rupees(data.totalPaise)}</p>
            <p className="text-[12px] text-[#A8A8B2]">{data.customers.length ? owedSummary(data.customers.length, data.oldestAt) : t('No one owes you anything.')}</p>
          </div>
          <div className="flex flex-col gap-2">
            {data.customers.map((row) => {
              const ask = whatsAppHref(row.phone, owedMessage({ name: row.name, garage, amountPaise: row.balancePaise }))
              return (
                <div key={row.customerId} className="fx-edge flex flex-col gap-2.5 rounded-control px-3.5 py-3">
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-t3 font-semibold text-text-primary">{row.name}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-[#A8A8B2]">
                        {[row.lastLabel, row.jobs > 1 ? t('{count} jobs', { count: row.jobs }) : null, row.oldestAt ? t('since {date}', { date: shortDate(row.oldestAt) }) : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 font-numeric text-[18px] font-semibold text-text-primary">{rupees(row.balancePaise)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ask ? (
                      <a href={ask} target="_blank" rel="noopener noreferrer" className={cn(raised, 'grid h-10 place-items-center rounded-small text-t4 font-semibold text-text-primary')}>
                        {t('Ask on WhatsApp')}
                      </a>
                    ) : (
                      <span className={cn(raised, 'grid h-10 place-items-center rounded-small text-t4 font-semibold text-[#8E8E98]')}>{t('No mobile')}</span>
                    )}
                    <button type="button" onClick={() => setPaying(row)} className={cn(raised, 'h-10 rounded-small text-t4 font-semibold text-text-primary')}>
                      {t('Mark paid')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {data.recent.length > 0 && (
            <div>
              <Overline>{t('Paid back recently')}</Overline>
              {data.recent.map((row, index) => (
                <div key={index} className="flex justify-between border-b border-[#1d1d23] py-2.5 text-[14px] text-text-primary">
                  <span>
                    {row.name} · {shortDate(row.at)}
                  </span>
                  <span className="font-numeric text-[#4ADE80]">{rupees(row.amountPaise)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <MarkPaidSheet row={paying} onClose={() => setPaying(null)} />
    </BookScreen>
  )
}

function MarkPaidSheet({ row, onClose }: { row: BookOwed['customers'][number] | null; onClose: () => void }) {
  const t = useT()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'upi' | 'cash'>('upi')
  const pay = useMarkPaid()
  if (!row) return null
  const rupeesTyped = amount === '' ? row.balancePaise / 100 : Number(amount)
  const paise = Math.round(rupeesTyped * 100)
  const ok = Number.isFinite(paise) && paise >= 100 && paise <= row.balancePaise
  return (
    <ScSheet open onClose={onClose} aria-label={t('{name} paid', { name: row.name })} className="px-4">
      <div className="flex flex-col gap-4 pb-2">
        <h2 className="text-t2 font-semibold text-text-primary">{t('{name} paid', { name: row.name })}</h2>
        <label className="flex flex-col gap-2">
          <span className="text-t4 font-semibold text-[#D4D4DA]">{t('How much (₹)')}</span>
          <input
            inputMode="numeric"
            value={amount}
            placeholder={String(row.balancePaise / 100)}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
            className="fx-recessed h-12 rounded-control px-3.5 font-numeric text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
          />
        </label>
        <Seg<'upi' | 'cash'>
          label={msg('Paid by')}
          value={method}
          onChange={setMethod}
          options={[
            { value: 'upi', label: 'UPI' },
            { value: 'cash', label: msg('Cash') },
          ]}
        />
        <button
          type="button"
          disabled={!ok || pay.isPending}
          onClick={() =>
            pay.mutate(
              { customerId: row.customerId, amountPaise: paise, method },
              {
                onSuccess: () => {
                  toast.success(t('{amount} marked paid', { amount: rupees(paise) ?? '' }))
                  setAmount('')
                  onClose()
                },
                onError: (error) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again.")),
              }
            )
          }
          className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary')}
        >
          {pay.isPending ? t('Saving…') : t('Mark {amount} paid', { amount: ok ? (rupees(paise) ?? '') : '' })}
        </button>
      </div>
    </ScSheet>
  )
}
