'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { useCreateBookCustomer } from '@repo/core/api/hooks/use-garage-book'
import { GARAGE_BOOK_LIMITS } from '@repo/core/garage-book'
import { useT } from '@repo/core/i18n'
import { BackHeader, BookScreen } from '@/components/book/parts'

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const field =
  'fx-recessed h-[52px] w-full min-w-0 rounded-control px-3.5 text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]'
const label = 'text-t4 font-semibold text-[#D4D4DA]'

/**
 * New customer (the Customers tab's "+ Add"; owner, 25 Nov 2026): a customer
 * of the garage's own with no job yet. Only the name is needed; phone, car and
 * a note are optional. A number already saved is refused by the server ("You
 * already have a customer with that number."). Saving opens their page, where
 * "New job" is one tap away. Laid out like New walk-in job: × to close, one
 * red Save.
 */
export default function NewCustomerPage() {
  const t = useT()
  const router = useRouter()
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [plate, setPlate] = useState('')
  const [car, setCar] = useState('')
  const [note, setNote] = useState('')
  const create = useCreateBookCustomer()
  const ready = name.trim().length > 0 && online && !create.isPending

  const save = () => {
    if (!ready) return
    // "Hyundai Creta" → make Hyundai, model Creta, as New walk-in job splits it.
    const [make, ...model] = car.trim().split(/\s+/)
    const hasCar = plate.trim() || car.trim()
    create.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
        cars: hasCar
          ? [{ plate: plate.trim() || undefined, make: make || undefined, model: model.join(' ') || undefined }]
          : undefined,
      },
      {
        onSuccess: (customer) => router.replace(`/book/customers/${encodeURIComponent(customer.id)}`),
        onError: (error) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again.")),
      }
    )
  }

  return (
    <BookScreen nav={false} className="gap-[18px] pb-32">
      <BackHeader title={t('New customer')} back="/book/customers" close />

      <form
        id="new-customer"
        className="flex flex-col gap-[18px]"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="customer-name" className={label}>
            {t('Name')}
          </label>
          <input
            id="customer-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={GARAGE_BOOK_LIMITS.nameMax}
            autoComplete="off"
            autoFocus
            className={field}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="customer-phone" className={label}>
            {t('Phone')} <span className="font-medium text-[#8A8A94]">· {t('optional')}</span>
          </label>
          <input
            id="customer-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={20}
            placeholder="98400 12345"
            autoComplete="off"
            aria-describedby="customer-phone-hint"
            className={`${field} font-numeric`}
          />
          <p id="customer-phone-hint" className="text-[12px] text-[#8A8A94]">
            {t('For reminders on WhatsApp. Only you see it.')}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${label} mb-2`}>
            {t('Car')} <span className="font-medium text-[#8A8A94]">· {t('optional')}</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              aria-label={t('Number plate')}
              value={plate}
              onChange={(event) => setPlate(event.target.value.toUpperCase())}
              maxLength={20}
              placeholder="TN 09 AB 4521"
              autoComplete="off"
              className={`${field} font-numeric font-semibold`}
            />
            <input
              aria-label={t('Car')}
              value={car}
              onChange={(event) => setCar(event.target.value)}
              maxLength={100}
              placeholder={t('Hyundai Creta')}
              autoComplete="off"
              className={field}
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="customer-note" className={label}>
            {t('Note')} <span className="font-medium text-[#8A8A94]">· {t('optional')}</span>
          </label>
          <textarea
            id="customer-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={GARAGE_BOOK_LIMITS.noteMax}
            rows={3}
            placeholder={t('Likes tyre shine. Pays on UPI.')}
            className="fx-recessed w-full resize-none rounded-control px-3.5 py-3 text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
          />
        </div>

        {!online && (
          <p className="text-t4 text-[#F5C46B]">{t('No signal. Save it when you are back online.')}</p>
        )}
      </form>

      <div className="fx-glass fixed bottom-0 left-1/2 z-50 flex w-full max-w-[428px] -translate-x-1/2 items-center rounded-none border-x-0 border-b-0 px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <button
          type="submit"
          form="new-customer"
          disabled={!ready}
          className="fx-red-button fx-press h-[52px] w-full rounded-control text-t3 font-semibold"
        >
          {create.isPending ? t('Saving…') : t('Save customer')}
        </button>
      </div>
    </BookScreen>
  )
}
