'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { IconPencil } from '@tabler/icons-react'
import type { StockItem, StockItemDetail } from '@repo/core/api/garage-book'
import { useCountStock, useSetStockUsage, useStockItem } from '@repo/core/api/hooks/use-garage-book'
import { rupees, shortDate, stockAmountText, stockDeltaText, stockMoveWord } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useT, useTn } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BackHeader, BookScreen, Field, LoadFailed, Overline, Stepper, errorText, raised, redButton } from '@/components/book/parts'
import { StockGauge } from '@/components/book/stock-gauge'
import { StockItemSheet } from '@/components/book/stock-sheet'

/**
 * One stock item (K2): its dial and what is left in jobs, Count it (any
 * seat: the shelf is the truth), Order again (the owner's), what each
 * service uses per job (the owner sets it; staff read it), and its history.
 */
export default function StockItemPage() {
  const t = useT()
  const router = useRouter()
  const isOwner = useIsVendorAdmin()
  const { id } = useParams<{ id: string }>()
  const detail = useStockItem(id ?? null)
  const [editing, setEditing] = useState(false)
  const data = detail.data
  const item = data?.item

  const sub = item
    ? [item.packSize ? t('{amount} pack', { amount: stockAmountText(item.packSize, item.unit) }) : null, item.supplier?.name ?? null, rupees(item.packPricePaise ?? undefined)]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <BookScreen>
      <BackHeader
        title={item?.name ?? t('Stock')}
        back="/book/stock"
        sub={sub || undefined}
        right={
          isOwner && item ? (
            <button type="button" onClick={() => setEditing(true)} aria-label={t('Change {name}', { name: item.name })} className={cn(raised, 'grid size-11 shrink-0 place-items-center rounded-small text-text-primary')}>
              <IconPencil size={18} aria-hidden />
            </button>
          ) : undefined
        }
      />
      {!data || !item ? (
        detail.isError ? <LoadFailed what={t('this item')} onRetry={() => void detail.refetch()} /> : <SkeletonList count={3} itemClassName="h-28" />
      ) : (
        <>
          <Dial item={item} isOwner={isOwner} />
          <Usage key={JSON.stringify(data.usage)} detail={data} isOwner={isOwner} />
          <History detail={data} />
        </>
      )}
      {editing && item && <StockItemSheet item={item} onClose={() => setEditing(false)} onRemoved={() => router.replace('/book/stock')} />}
    </BookScreen>
  )
}

function Dial({ item, isOwner }: { item: StockItem; isOwner: boolean }) {
  const t = useT()
  const tn = useTn()
  const [counting, setCounting] = useState(false)
  const lead = item.jobsLeft !== null ? tn(item.jobsLeft, 'About {count} job left', 'About {count} jobs left') : item.low ? t('Running low') : t('{amount} left', { amount: stockAmountText(item.level, item.unit) })
  const used = item.usedThisMonth > 0 ? tn(item.jobsThisMonth, 'used {amount} on {count} job this month', 'used {amount} on {count} jobs this month', { amount: stockAmountText(item.usedThisMonth, item.unit) }) : t('none used this month')
  return (
    <div className="fx-edge flex flex-col items-center gap-2 rounded-surface p-4 text-center">
      <StockGauge share={item.share} low={item.low} width={160} />
      <p className={cn('text-t2 font-semibold', item.low ? 'text-[#F5A524]' : 'text-text-primary')}>{lead}</p>
      <p className="text-[12px] text-[#A8A8B2]">{`${stockAmountText(item.level, item.unit)} · ${used}`}</p>
      <div className={cn('mt-2 grid w-full gap-2', isOwner ? 'grid-cols-2' : 'grid-cols-1')}>
        <button type="button" onClick={() => setCounting(true)} className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary')}>
          {t('Count it')}
        </button>
        {isOwner && (
          <Link href="/book/stock/order" className={cn(item.low ? redButton : raised, 'grid h-12 place-items-center rounded-control text-t3 font-semibold', !item.low && 'text-text-primary')}>
            {t('Order again')}
          </Link>
        )}
      </div>
      {counting && <CountSheet item={item} onClose={() => setCounting(false)} />}
    </div>
  )
}

function CountSheet({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const t = useT()
  const count = useCountStock()
  const [level, setLevel] = useState(String(item.level))
  const value = Number(level)
  const ok = level.trim() !== '' && Number.isFinite(value) && value >= 0
  return (
    <ScSheet open onClose={onClose} aria-label={t('Count {name}', { name: item.name })} className="px-4">
      <div className="flex flex-col gap-4 pb-2 text-left">
        <h2 className="text-t2 font-semibold text-text-primary">{t('Count {name}', { name: item.name })}</h2>
        <p className="text-t4 text-[#A8A8B2]">{t('How much is on the shelf now? It replaces what the book thinks is left.')}</p>
        <Field id="count-level" label={t('On the shelf ({unit})', { unit: item.unit === 'l' ? 'L' : item.unit })} value={level} onChange={(next) => setLevel(next.replace(/[^\d.]/g, ''))} inputMode="decimal" />
        <button
          type="button"
          disabled={!ok || count.isPending}
          onClick={() =>
            count.mutate(
              { id: item.id, level: value },
              {
                onSuccess: () => {
                  toast.success(t('Counted'))
                  onClose()
                },
                onError: (error) => toast.error(errorText(error, t("Couldn't save. Try again."))),
              }
            )
          }
          className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary disabled:text-[#8E8E98]')}
        >
          {count.isPending ? t('Saving…') : t('Save count')}
        </button>
      </div>
    </ScSheet>
  )
}

/** The step a stepper moves by: 50 ml, 50 g, 0.1 L or kg, 1 piece. */
function stepFor(unit: StockItem['unit']): number {
  if (unit === 'ml' || unit === 'g') return 50
  if (unit === 'pcs') return 1
  return 0.1
}

function Usage({ detail, isOwner }: { detail: StockItemDetail; isOwner: boolean }) {
  const t = useT()
  const save = useSetStockUsage()
  const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(detail.usage.map((row) => [row.serviceId, row.amount])))
  const rows = detail.usage.filter((row) => isOwner || row.amount > 0)
  const dirty = detail.usage.some((row) => (amounts[row.serviceId] ?? 0) !== row.amount)
  const unit = detail.item.unit === 'l' ? 'L' : detail.item.unit
  if (rows.length === 0) return null
  return (
    <div>
      <Overline>{t('Each job uses')}</Overline>
      {rows.map((row) => (
        <div key={row.serviceId} className="flex min-h-[60px] items-center gap-2 border-b border-[#1d1d23] py-2">
          <span className="min-w-0 flex-1 truncate text-t3 font-semibold text-text-primary">{row.name}</span>
          {isOwner ? (
            <Stepper
              value={amounts[row.serviceId] ?? 0}
              step={stepFor(detail.item.unit)}
              label={t('{service} uses', { service: row.name })}
              onChange={(next) => setAmounts((current) => ({ ...current, [row.serviceId]: next }))}
            />
          ) : (
            <span className="font-numeric text-[15px] font-semibold text-text-primary">{row.amount}</span>
          )}
          <span className="w-6 shrink-0 text-[12px] text-[#A8A8B2]">{unit}</span>
        </div>
      ))}
      {isOwner && dirty && (
        <button
          type="button"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { id: detail.item.id, rows: detail.usage.map((row) => ({ serviceId: row.serviceId, amount: amounts[row.serviceId] ?? 0 })) },
              {
                onSuccess: () => toast.success(t('Saved')),
                onError: (error) => toast.error(errorText(error, t("Couldn't save. Try again."))),
              }
            )
          }
          className={cn(raised, 'mt-3 h-12 w-full rounded-control text-t3 font-semibold text-text-primary')}
        >
          {save.isPending ? t('Saving…') : t('Save what each job uses')}
        </button>
      )}
    </div>
  )
}

function History({ detail }: { detail: StockItemDetail }) {
  const t = useT()
  if (detail.moves.length === 0) return null
  const unit = detail.item.unit
  return (
    <div>
      <Overline>{t('History')}</Overline>
      {detail.moves.map((move) => (
        <div key={move.id} className="flex min-h-12 items-center gap-3 border-b border-[#1d1d23] py-2.5">
          <span className="w-12 shrink-0 text-[13px] text-[#A8A8B2]">{shortDate(move.at)}</span>
          <span className="min-w-0 flex-1 truncate text-[14px] text-text-primary">
            {move.kind === 'counted' && move.by?.name ? t('Counted by {name}', { name: move.by.name }) : stockMoveWord(move.kind)}
          </span>
          <span className={cn('shrink-0 font-numeric text-[14px] font-semibold', move.kind === 'received' ? 'text-[#4ADE80]' : 'text-[#D4D4DA]')}>
            {move.kind === 'counted' ? stockAmountText(move.levelAfter, unit) : stockDeltaText(move.delta, unit)}
          </span>
        </div>
      ))}
    </div>
  )
}
