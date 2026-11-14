'use client'

import { useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { IconCamera, IconCheck, IconPhone } from '@tabler/icons-react'
import { getPayQrUpload, type PaymentDetails, type PaymentDetailsPatch } from '@repo/core/api/garage-book'
import { usePaymentDetails, useSavePaymentDetails } from '@repo/core/api/hooks/use-garage-book'
import { PAY_APPS, payAppsText, payLine, spacedPhone, type PayApp } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useT } from '@repo/core/i18n'
import { decodeImage, encodeImage, fitWithin } from '@repo/core/image-upload'
import { cn } from '@repo/core/utils'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BackHeader, BookScreen, Footnote, LightChip, LoadFailed, OwnerOnly, Overline, Switch, errorText, raised } from '@/components/book/parts'

/**
 * Payment details (PY1, the owner's): the garage's own UPI QR (a screenshot
 * or photo of its GPay, PhonePe or Paytm QR), read on the server so the
 * owner can check "We read it: x@okaxis · Name"; the phone customers pay
 * on and its apps; and where it shows (unpaid bills, money-owed reminders,
 * the booking page). Money goes straight to the garage: Detlio never
 * touches it.
 */
export default function PaymentsPage() {
  const t = useT()
  const isOwner = useIsVendorAdmin()
  const details = usePaymentDetails(isOwner)
  const data = details.data

  return (
    <BookScreen>
      <BackHeader title={t('Payment details')} back="/book/business" sub={t('How customers pay you')} />
      {!isOwner ? (
        <OwnerOnly />
      ) : !data ? (
        details.isError ? <LoadFailed what={t('your payment details')} onRetry={() => void details.refetch()} /> : <SkeletonList count={3} itemClassName="h-24" />
      ) : (
        <PaymentsBody key={data.updatedAt ?? 'new'} details={data} />
      )}
    </BookScreen>
  )
}

/** The QR picture as a PNG, its location and camera data dropped: drawn again in the browser first (AGENTS.md). */
async function asPng(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('not an image')
  const decoded = await decodeImage(file)
  try {
    const blob = await encodeImage(decoded, fitWithin(decoded.width, decoded.height, 1600), 'image/png')
    if (!blob || blob.type !== 'image/png') throw new Error('not encoded')
    return blob
  } finally {
    decoded.close()
  }
}

function PaymentsBody({ details }: { details: PaymentDetails }) {
  const t = useT()
  const save = useSavePaymentDetails()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [phone, setPhone] = useState(details.phone ? spacedPhone(details.phone) : '')
  const digits = phone.replace(/\D/g, '')
  const phoneDirty = digits !== (details.phone ?? '')
  const phoneOk = digits.length === 10

  const patch = (change: PaymentDetailsPatch, done?: string) =>
    save.mutate(change, {
      onSuccess: () => {
        if (done) toast.success(done)
      },
      onError: (error) => toast.error(errorText(error, t("Couldn't save. Try again."))),
    })

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const png = await asPng(file)
      const { uploadUrl, key } = await getPayQrUpload('image/png')
      const put = await fetch(uploadUrl, { method: 'PUT', body: png, headers: { 'Content-Type': 'image/png' } })
      if (!put.ok) throw new Error(t('Upload failed. Try again.'))
      const saved = await save.mutateAsync({ qrKey: key })
      if (saved.qrRead === 'read') toast.success(t('QR saved'))
    } catch (error) {
      toast.error(error instanceof Error && error.message !== 'not an image' && error.message !== 'not encoded' ? error.message : t("That picture couldn't be read. Try a screenshot of your QR."))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const toggleApp = (app: PayApp) => {
    const apps = details.apps.includes(app) ? details.apps.filter((a) => a !== app) : [...details.apps, app]
    patch({ apps: PAY_APPS.filter((a) => apps.includes(a)) })
  }

  const example = payLine({ phone: details.phone, apps: details.apps.length ? details.apps : ['gpay'] }) ?? 'Pay on GPay 98400 00000'

  return (
    <>
      <div className="fx-edge flex items-center gap-3.5 rounded-surface p-3.5">
        <span className="grid size-[120px] shrink-0 place-items-center overflow-hidden rounded-[14px] bg-white">
          {details.qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to the garage's own QR picture
            <img src={details.qrUrl} alt={t('Your UPI QR')} className="size-full object-contain" />
          ) : (
            <span className="px-3 text-center text-[12px] font-semibold text-[#55555f]">{t('No QR yet')}</span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Overline>{t('Your UPI QR')}</Overline>
          {details.qrRead === 'read' && details.upiId ? (
            <>
              <p className="text-[14px] text-text-primary">
                {t('We read it:')} <b className="block font-semibold break-all">{details.upiId}</b>
              </p>
              {details.upiName && (
                <p className="flex items-center gap-1 text-[13px] text-[#4ADE80]">
                  <IconCheck size={14} aria-hidden />
                  <span className="truncate">{details.upiName}</span>
                </p>
              )}
            </>
          ) : details.qrRead === 'unreadable' ? (
            <p role="alert" className="text-[13px] leading-[18px] text-[#F5A524]">
              {t('We couldn’t read this QR. Check it is your UPI QR, or upload a clearer screenshot.')}
            </p>
          ) : (
            <p className="text-[13px] text-[#A8A8B2]">{t('Add your QR so unpaid bills carry it.')}</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={t('Choose your UPI QR picture')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className={cn(raised, 'mt-1 flex h-11 w-fit items-center gap-1.5 rounded-pill px-3.5 text-t4 font-semibold text-text-primary')}
          >
            <IconCamera size={17} aria-hidden />
            {uploading ? t('Reading…') : details.qrUrl ? t('Change QR') : t('Upload QR')}
          </button>
        </div>
      </div>
      <Footnote>{t('Upload a screenshot or photo of your GPay, PhonePe or Paytm QR. Check the name we read is yours.')}</Footnote>

      <div className="flex flex-col gap-2">
        <label htmlFor="pay-phone" className="text-t4 font-semibold text-[#D4D4DA]">
          {t('Phone for payments')}
        </label>
        <div className="fx-recessed flex h-12 items-center gap-2.5 rounded-control pr-1.5 pl-3.5">
          <IconPhone size={17} className="shrink-0 text-[#8E8E98]" aria-hidden />
          <input
            id="pay-phone"
            inputMode="tel"
            value={phone}
            placeholder="98400 00000"
            onChange={(event) => setPhone(event.target.value.replace(/[^\d ]/g, '').slice(0, 12))}
            className="min-w-0 flex-1 bg-transparent font-numeric text-t3 text-text-primary outline-none placeholder:text-[#8A8A94]"
          />
          {phoneDirty && (
            <button
              type="button"
              disabled={!phoneOk || save.isPending}
              onClick={() => patch({ phone: digits }, t('Saved'))}
              className={cn(raised, 'h-9 shrink-0 rounded-small px-3 text-t4 font-semibold text-text-primary disabled:text-[#8E8E98]')}
            >
              {t('Save')}
            </button>
          )}
        </div>
        {details.phoneIsGarage && !phoneDirty && <p className="text-[12px] text-[#A8A8B2]">{t('Your garage’s phone. Change it if customers pay on another.')}</p>}
        {phoneDirty && !phoneOk && digits.length > 0 && <p className="text-[12px] font-semibold text-[#FF8A95]">{t('A mobile number has 10 digits.')}</p>}
      </div>

      <div role="group" aria-label={t('Apps it takes')} className="flex flex-wrap gap-2">
        {PAY_APPS.map((app) => (
          <LightChip key={app} label={payAppsText([app])} on={details.apps.includes(app)} onClick={() => toggleApp(app)} />
        ))}
      </div>

      <div>
        <Overline>{t('Show it on')}</Overline>
        <ShowRow title={t('Bills')} sub={t('Unpaid bills carry the QR and number')} checked={details.showOnBills} onChange={(showOnBills) => patch({ showOnBills })} />
        <ShowRow title={t('Money owed reminders')} sub={t('“{line}” in the WhatsApp', { line: example })} checked={details.showOnReminders} onChange={(showOnReminders) => patch({ showOnReminders })} />
        <ShowRow title={t('Your booking page')} sub={t('Under “Pay at the garage”')} checked={details.showOnBookingPage} onChange={(showOnBookingPage) => patch({ showOnBookingPage })} />
      </div>
      <Footnote>{t('Money goes straight to your bank. Detlio never touches it and takes nothing.')}</Footnote>
    </>
  )
}

function ShowRow({ title, sub, checked, onChange }: { title: string; sub: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-[#1d1d23] py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-t3 font-semibold text-text-primary">{title}</span>
        <span className="block text-[12px] text-[#A8A8B2]">{sub}</span>
      </span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}
