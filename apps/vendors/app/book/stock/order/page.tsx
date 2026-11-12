'use client'

import { useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { IconBrandWhatsapp, IconTruck } from '@tabler/icons-react'
import type { Supplier, SupplyOrder, SupplySuggestions } from '@repo/core/api/garage-book'
import { useAddSupplier, useReceiveSupplyOrder, useSendSupplyOrder, useSuppliers, useSupplyOrders, useSupplySuggestions } from '@repo/core/api/hooks/use-garage-book'
import { rupees, shortDate, stockAmountText, type StockUnit } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useT } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BackHeader, BookScreen, Field, Footnote, IconWell, LightChip, LoadFailed, OwnerOnly, Overline, Stepper, errorText, raised, redButton } from '@/components/book/parts'

type Line = { itemId: string; name: string; unit: StockUnit; packSize: number | null; packPricePaise: number | null; packs: number }

/**
 * Order supplies (K3, the owner's): what is running low, filled in by
 * supplier with packs to reach a good level and the garage's own prices,
 * sent as a plain WhatsApp to the supplier. When it arrives, Received adds
 * the stock and puts the bill into Expenses, once.
 */
export default function OrderPage() {
  const t = useT()
  const isOwner = useIsVendorAdmin()
  const suggest = useSupplySuggestions(isOwner)
  const suppliers = useSuppliers(isOwner)
  const orders = useSupplyOrders(isOwner)

  return (
    <BookScreen nav={false} className="pb-28">
      <BackHeader title={t('Order supplies')} back="/book/stock" />
      {!isOwner ? (
        <OwnerOnly />
      ) : !suggest.data || !suppliers.data ? (
        suggest.isError || suppliers.isError ? (
          <LoadFailed
            what={t('what to order')}
            onRetry={() => {
              void suggest.refetch()
              void suppliers.refetch()
            }}
          />
        ) : (
          <SkeletonList count={3} itemClassName="h-16" />
        )
      ) : (
        <OrderBody suggestions={suggest.data} suppliers={suppliers.data} />
      )}
      {isOwner && orders.data && <OnTheWay orders={orders.data.filter((order) => order.status === 'sent')} />}
    </BookScreen>
  )
}

function OrderBody({ suggestions, suppliers }: { suggestions: SupplySuggestions; suppliers: Supplier[] }) {
  const t = useT()
  const send = useSendSupplyOrder()
  const firstWithSupplier = suggestions.groups.find((group) => group.supplier)?.supplier?.id ?? suppliers[0]?.id ?? null
  const [supplierId, setSupplierId] = useState<string | null>(firstWithSupplier)
  const [picking, setPicking] = useState(false)
  const [packs, setPacks] = useState<Record<string, number>>({})
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null

  // This supplier's low items, and the low items no supplier has yet, which any supplier can bring.
  const lines: Line[] = useMemo(() => {
    const mine = suggestions.groups.find((group) => group.supplier?.id === supplierId)?.lines ?? []
    const loose = suggestions.groups.find((group) => !group.supplier)?.lines ?? []
    return [...mine, ...loose].map((line) => ({ ...line, packs: packs[line.itemId] ?? line.packs }))
  }, [suggestions, supplierId, packs])
  const ordered = lines.filter((line) => line.packs > 0)
  const total = ordered.reduce((sum, line) => sum + line.packs * (line.packPricePaise ?? 0), 0)

  const sendOrder = () => {
    if (!supplier) return
    send.mutate(
      { supplierId: supplier.id, lines: ordered.map((line) => ({ itemId: line.itemId, packs: line.packs, ...(line.packPricePaise !== null ? { packPricePaise: line.packPricePaise } : {}) })) },
      {
        onSuccess: (answer) => {
          setPacks({})
          if (answer.whatsappUrl) window.open(answer.whatsappUrl, '_blank', 'noopener,noreferrer')
          toast.success(answer.whatsappUrl ? t('Order written down. Press Send in WhatsApp.') : t('Order written down. {name} has no WhatsApp number, so tell them yourself.', { name: supplier.name }))
        },
        onError: (error) => toast.error(errorText(error, t("Couldn't send the order. Try again."))),
      }
    )
  }

  return (
    <>
      {supplier ? (
        <div className="fx-edge flex items-center gap-3 rounded-surface px-3.5 py-3">
          <IconWell>
            <IconTruck size={18} aria-hidden />
          </IconWell>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-t3 font-semibold text-text-primary">{supplier.name}</span>
            <span className="block text-[12px] text-[#A8A8B2]">
              {[t('Your supplier'), supplier.phone ? 'WhatsApp' : t('no WhatsApp number'), supplier.lastOrderAt ? t('last order {date}', { date: shortDate(supplier.lastOrderAt) }) : null].filter(Boolean).join(' · ')}
            </span>
          </span>
          <button type="button" onClick={() => setPicking(true)} className={cn(raised, 'h-11 shrink-0 rounded-small px-3 text-t4 font-semibold text-text-primary')}>
            {t('Change')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setPicking(true)} className="fx-edge fx-press flex items-center gap-3 rounded-surface px-3.5 py-3 text-left">
          <IconWell>
            <IconTruck size={18} aria-hidden />
          </IconWell>
          <span className="min-w-0 flex-1">
            <span className="block text-t3 font-semibold text-text-primary">{t('Add your supplier')}</span>
            <span className="block text-[12px] text-[#A8A8B2]">{t('Their name and WhatsApp number')}</span>
          </span>
        </button>
      )}

      {lines.length === 0 ? (
        <p className="fx-edge rounded-control px-4 py-4 text-t4 text-[#A8A8B2]">{t('Nothing is running low. Your stock is fine.')}</p>
      ) : (
        <div>
          <Overline>{t('Running low, filled in for you')}</Overline>
          {lines.map((line) => (
            <div key={line.itemId} className="flex min-h-[60px] items-center gap-2.5 border-b border-[#1d1d23] py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-t3 font-semibold text-text-primary">{line.name}</span>
                <span className="block truncate text-[12px] text-[#A8A8B2]">
                  {[line.packSize ? stockAmountText(line.packSize, line.unit) : null, line.packPricePaise !== null ? t('{amount} each', { amount: rupees(line.packPricePaise) ?? '' }) : t('No price yet')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Stepper value={line.packs} min={0} max={999} label={t('Packs of {name}', { name: line.name })} onChange={(next) => setPacks((current) => ({ ...current, [line.itemId]: Math.round(next) }))} />
              <span className="w-[64px] shrink-0 text-right font-numeric text-[15px] font-semibold text-text-primary">{line.packPricePaise !== null ? rupees(line.packs * line.packPricePaise) : '–'}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between pt-4">
            <Overline>{t('Total')}</Overline>
            <span className="font-numeric text-[24px] font-semibold text-text-primary">{rupees(total)}</span>
          </div>
        </div>
      )}
      <Footnote>{t('Your supplier, your prices. When it arrives, tap Received: the stock goes up and the bill goes into Expenses.')}</Footnote>

      {lines.length > 0 && (
        <div className="fx-glass fixed bottom-0 left-1/2 z-50 w-full max-w-[428px] -translate-x-1/2 rounded-none border-x-0 border-b-0 px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={!supplier || ordered.length === 0 || send.isPending}
            onClick={sendOrder}
            className={cn(redButton, 'flex h-[52px] w-full items-center justify-center gap-2 rounded-control text-t3 font-semibold')}
          >
            <IconBrandWhatsapp size={19} aria-hidden />
            {send.isPending ? t('Sending…') : t('Send order on WhatsApp')}
          </button>
        </div>
      )}

      {picking && (
        <SupplierSheet
          suppliers={suppliers}
          chosen={supplierId}
          onPick={(id) => {
            setSupplierId(id)
            setPacks({})
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}

function SupplierSheet({ suppliers, chosen, onPick, onClose }: { suppliers: Supplier[]; chosen: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const t = useT()
  const add = useAddSupplier()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const digits = phone.replace(/\D/g, '')
  return (
    <ScSheet open onClose={onClose} aria-label={t('Supplier')} className="px-4">
      <div className="flex flex-col gap-3.5 pb-2">
        <h2 className="text-t2 font-semibold text-text-primary">{t('Supplier')}</h2>
        {suppliers.length > 0 && (
          <div role="group" aria-label={t('Your suppliers')} className="grid grid-cols-2 gap-2">
            {suppliers.map((supplier) => (
              <LightChip key={supplier.id} label={supplier.name} on={supplier.id === chosen} onClick={() => onPick(supplier.id)} />
            ))}
          </div>
        )}
        <Overline>{t('New supplier')}</Overline>
        <Field id="new-supplier-name" label={t('Name')} value={name} onChange={setName} placeholder={t('Sri Balaji Supplies')} />
        <Field id="new-supplier-phone" label={t('WhatsApp')} value={phone} onChange={(next) => setPhone(next.replace(/[^\d ]/g, '').slice(0, 12))} inputMode="tel" placeholder="98400 12345" />
        <button
          type="button"
          disabled={!name.trim() || (digits.length > 0 && digits.length !== 10) || add.isPending}
          onClick={() =>
            add.mutate(
              { name: name.trim(), ...(digits ? { phone: digits } : {}) },
              { onSuccess: (made) => onPick(made.id), onError: (error) => toast.error(errorText(error, t("Couldn't save. Try again."))) }
            )
          }
          className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary disabled:text-[#8E8E98]')}
        >
          {add.isPending ? t('Saving…') : t('Add supplier')}
        </button>
      </div>
    </ScSheet>
  )
}

/** Orders sent and not yet arrived, each with Received. */
function OnTheWay({ orders }: { orders: SupplyOrder[] }) {
  const t = useT()
  const receive = useReceiveSupplyOrder()
  if (orders.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <Overline>{t('On the way')}</Overline>
      {orders.map((order) => (
        <div key={order.id} className="fx-edge flex items-center gap-3 rounded-control px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-t3 font-semibold text-text-primary">{order.supplier.name}</span>
            <span className="block truncate text-[12px] text-[#A8A8B2]">
              {[order.lines.map((line) => `${line.name} ×${line.packs}`).join(', '), rupees(order.totalPaise), t('sent {date}', { date: shortDate(order.sentAt) })].filter(Boolean).join(' · ')}
            </span>
          </span>
          <button
            type="button"
            disabled={receive.isPending}
            onClick={() =>
              receive.mutate(order.id, {
                onSuccess: (answer) =>
                  toast.success(answer.added ? t('Stock added and {amount} put in Expenses', { amount: rupees(order.totalPaise) ?? '' }) : t('Already marked received')),
                onError: (error) => toast.error(errorText(error, t("Couldn't save. Try again."))),
              })
            }
            className={cn(raised, 'h-11 shrink-0 rounded-small px-3.5 text-t4 font-semibold text-text-primary')}
          >
            {t('Received')}
          </button>
        </div>
      ))}
    </div>
  )
}
