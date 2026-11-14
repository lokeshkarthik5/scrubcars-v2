'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import type { StockItem } from '@repo/core/api/garage-book'
import { useAddStockItem, useAddSupplier, useRemoveStockItem, useSuppliers, useUpdateStockItem } from '@repo/core/api/hooks/use-garage-book'
import { GARAGE_BOOK_LIMITS, STOCK_UNITS, type StockUnit } from '@repo/core/garage-book'
import { msg, useT } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'
import { Field, LightChip, Seg, errorText, raised } from './parts'

const UNITS = STOCK_UNITS.map((unit) => ({ value: unit, label: unit === 'l' ? 'L' : unit }))

const number = (text: string) => (text.trim() === '' ? null : Number(text))

/**
 * Add or change a stock item (the owner's): what it is, its unit, how much
 * is here and when it counts as low, the pack it comes in and its price,
 * and who supplies it (a new supplier can be written in here).
 */
export function StockItemSheet({ item, onClose, onRemoved }: { item: StockItem | null; onClose: () => void; onRemoved?: () => void }) {
  const t = useT()
  const add = useAddStockItem()
  const update = useUpdateStockItem()
  const remove = useRemoveStockItem()
  const suppliers = useSuppliers()
  const addSupplier = useAddSupplier()
  const [name, setName] = useState(item?.name ?? '')
  const [unit, setUnit] = useState<StockUnit>(item?.unit ?? 'l')
  const [level, setLevel] = useState(item ? String(item.level) : '')
  const [lowAt, setLowAt] = useState(item ? String(item.lowAt) : '')
  const [packSize, setPackSize] = useState(item?.packSize ? String(item.packSize) : '')
  const [packPrice, setPackPrice] = useState(item?.packPricePaise ? String(item.packPricePaise / 100) : '')
  const [supplierId, setSupplierId] = useState<string | null>(item?.supplier?.id ?? null)
  const [newSupplier, setNewSupplier] = useState<{ name: string; phone: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const busy = add.isPending || update.isPending || remove.isPending || addSupplier.isPending
  const numbersOk = [level, lowAt, packSize, packPrice].every((text) => text.trim() === '' || (Number.isFinite(Number(text)) && Number(text) >= 0))
  const ok = name.trim().length > 0 && numbersOk
  const failed = (error: unknown) => toast.error(errorText(error, t("Couldn't save. Try again.")))

  const save = async () => {
    let supplier = supplierId
    try {
      if (newSupplier && newSupplier.name.trim()) {
        const digits = newSupplier.phone.replace(/\D/g, '')
        const made = await addSupplier.mutateAsync({ name: newSupplier.name.trim(), ...(digits ? { phone: digits } : {}) })
        supplier = made.id
      }
    } catch (error) {
      failed(error)
      return
    }
    const fields = {
      name: name.trim(),
      unit,
      lowAt: number(lowAt) ?? 0,
      packSize: number(packSize),
      packPricePaise: number(packPrice) === null ? null : Math.round(Number(packPrice) * 100),
      supplierId: supplier,
    }
    if (item) {
      update.mutate({ id: item.id, patch: fields }, { onSuccess: onClose, onError: failed })
    } else {
      add.mutate(
        { ...fields, level: number(level) ?? 0 },
        {
          onSuccess: () => {
            toast.success(t('{name} added', { name: fields.name }))
            onClose()
          },
          onError: failed,
        }
      )
    }
  }

  return (
    <ScSheet open onClose={onClose} aria-label={item ? item.name : t('Add stock')} className="px-4">
      <div className="flex flex-col gap-3.5 pb-2">
        <h2 className="text-t2 font-semibold text-text-primary">{item ? item.name : t('Add stock')}</h2>
        <Field id="stock-name" label={t('What it is')} value={name} onChange={setName} maxLength={GARAGE_BOOK_LIMITS.nameMax} placeholder={t('Foam shampoo')} />
        <div className="flex flex-col gap-2">
          <span className="text-t4 font-semibold text-[#D4D4DA]">{t('Counted in')}</span>
          <Seg<StockUnit> label={msg('Counted in')} value={unit} onChange={setUnit} options={UNITS} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {!item && <Field id="stock-level" label={t('How much is here')} value={level} onChange={(next) => setLevel(next.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="5000" />}
          <Field id="stock-low" label={t('Low at')} value={lowAt} onChange={(next) => setLowAt(next.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="1000" />
          <Field id="stock-pack" label={t('One pack holds')} value={packSize} onChange={(next) => setPackSize(next.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="5000" />
          <Field id="stock-price" label={t('Pack price (₹)')} value={packPrice} onChange={(next) => setPackPrice(next.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="1150" />
        </div>
        <div role="group" aria-label={t('Supplier')} className="flex flex-col gap-2">
          <span className="text-t4 font-semibold text-[#D4D4DA]">{t('Supplier')}</span>
          <div className="grid grid-cols-2 gap-2">
            {(suppliers.data ?? []).map((supplier) => (
              <LightChip
                key={supplier.id}
                label={supplier.name}
                on={!newSupplier && supplierId === supplier.id}
                onClick={() => {
                  setNewSupplier(null)
                  setSupplierId(supplierId === supplier.id ? null : supplier.id)
                }}
              />
            ))}
            <LightChip label={t('+ New supplier')} on={newSupplier !== null} onClick={() => setNewSupplier(newSupplier ? null : { name: '', phone: '' })} />
          </div>
          {newSupplier && (
            <div className="grid grid-cols-2 gap-2">
              <Field id="supplier-name" label={t('Supplier name')} value={newSupplier.name} onChange={(next) => setNewSupplier({ ...newSupplier, name: next })} />
              <Field id="supplier-phone" label={t('WhatsApp')} value={newSupplier.phone} onChange={(next) => setNewSupplier({ ...newSupplier, phone: next.replace(/[^\d ]/g, '').slice(0, 12) })} inputMode="tel" />
            </div>
          )}
        </div>
        <button type="button" disabled={!ok || busy} onClick={() => void save()} className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary disabled:text-[#8E8E98]')}>
          {busy ? t('Saving…') : item ? t('Save') : t('Add')}
        </button>
        {item && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              confirmRemove
                ? remove.mutate(item.id, {
                    onSuccess: () => {
                      onClose()
                      onRemoved?.()
                    },
                    onError: failed,
                  })
                : setConfirmRemove(true)
            }
            className="min-h-11 text-t4 font-medium text-[#FF8A95]"
          >
            {confirmRemove ? t('Tap again to remove {name}', { name: item.name }) : t('Remove from stock')}
          </button>
        )}
      </div>
    </ScSheet>
  )
}
