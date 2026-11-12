'use client'

import { useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { IconBrandWhatsapp } from '@tabler/icons-react'
import { useMakeBill } from '@repo/core/api/hooks/use-garage-book'
import { shortDate } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useT } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { BillPaper } from '@/components/book/bill-paper'
import { BackHeader, BookScreen, Footnote, LoadFailed, OwnerOnly, raised, redButton } from '@/components/book/parts'

/**
 * A job's bill (BL1, the owner's): made the first time it is opened, the
 * same bill (and number) every time after, with its paid state brought up
 * to date. Send on WhatsApp opens the garage's own WhatsApp with the bill's
 * link (own customers with a mobile only); a Detlio customer's bill is
 * shared as a link, since their phone never reaches the garage. Print
 * prints the paper alone.
 */
export default function BillPage() {
  const t = useT()
  const isOwner = useIsVendorAdmin()
  const params = useParams<{ ref: string }>()
  const ref = safeDecode(params.ref ?? '')
  const make = useMakeBill()
  const asked = useRef<string | null>(null)
  const { mutate } = make

  useEffect(() => {
    if (!isOwner || !ref || asked.current === ref) return
    asked.current = ref
    mutate(ref)
  }, [isOwner, ref, mutate])

  const bill = make.data

  const share = async () => {
    if (!bill) return
    try {
      if (navigator.share) {
        await navigator.share({ title: `Bill ${bill.numberText}`, text: bill.message, url: bill.shareUrl })
        return
      }
      await navigator.clipboard.writeText(bill.shareUrl)
      toast.success(t('Link copied'))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error(t("Couldn't share it. Try again."))
    }
  }

  return (
    <BookScreen>
      <div className="gb-noprint">
        <BackHeader
          title={t('Bill')}
          back="/book/jobs"
          sub={bill ? `${bill.snapshot.customer.firstName} · ${shortDate(`${bill.snapshot.date}T06:30:00Z`)}` : undefined}
        />
      </div>
      {!isOwner ? (
        <OwnerOnly />
      ) : make.isError ? (
        <LoadFailed what={t('the bill')} onRetry={() => mutate(ref)} />
      ) : !bill ? (
        <SkeletonList count={1} itemClassName="h-96" />
      ) : (
        <>
          <BillPaper bill={bill.snapshot} numberText={bill.numberText} pay={bill.pay} madeWith={bill.madeWith} />
          <div className="gb-noprint flex flex-col gap-3">
            {bill.whatsappUrl ? (
              <a href={bill.whatsappUrl} target="_blank" rel="noopener noreferrer" className={cn(redButton, 'flex h-[52px] items-center justify-center gap-2 rounded-control text-t3 font-semibold')}>
                <IconBrandWhatsapp size={19} aria-hidden />
                {t('Send on WhatsApp')}
              </a>
            ) : (
              <button type="button" onClick={share} className={cn(redButton, 'flex h-[52px] items-center justify-center gap-2 rounded-control text-t3 font-semibold')}>
                {t('Share the bill')}
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={share} className={cn(raised, 'min-h-12 rounded-control px-2 py-1 text-t3 leading-tight font-semibold text-text-primary')}>
                {bill.whatsappUrl ? t('Share link') : t('Copy link')}
              </button>
              <button type="button" onClick={() => window.print()} className={cn(raised, 'min-h-12 rounded-control px-2 py-1 text-t3 leading-tight font-semibold text-text-primary')}>
                {t('Print')}
              </button>
            </div>
            <Footnote>
              {bill.snapshot.paid
                ? t('Paid, so the bill says so. Bill numbers are your garage’s own, from 0001.')
                : bill.pay
                  ? t('Not paid yet, so the bill carries your own UPI QR and number. Once paid it says so instead. Bill numbers are your garage’s own, from 0001.')
                  : t('Not paid yet. Add your payment details and unpaid bills carry your own UPI QR and number. Bill numbers are your garage’s own, from 0001.')}
              {bill.snapshot.source === 'detlio' ? ` ${t('A Detlio customer’s number stays private, so their bill goes as a link, not on WhatsApp.')}` : ''}
            </Footnote>
          </div>
        </>
      )}
    </BookScreen>
  )
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
