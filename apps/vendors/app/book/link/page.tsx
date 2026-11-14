'use client'

import Link from 'next/link'
import { toast } from 'react-toastify'
import { IconBrandWhatsapp, IconCopy, IconPrinter } from '@tabler/icons-react'
import type { BookLink } from '@repo/core/api/garage-book'
import { useBookLink, useUpdateBookLink } from '@repo/core/api/hooks/use-garage-book'
import { monthName, rupees } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useT } from '@repo/core/i18n'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { QrCode } from '@/components/book/qr-code'
import { BackHeader, BookScreen, Footnote, LoadFailed, OwnerOnly, Overline, Switch, Tile, errorText, raised, redButton } from '@/components/book/parts'

/**
 * Booking link (L1, the owner's): the garage's own page on detlio.com/g/…
 * with its QR, Copy, a Poster to print for the counter, and Share on
 * WhatsApp; bookings from it this month (no commission: they are the
 * garage's own customers); and which services customers can book there.
 * Someone who has booked this garage through Detlio before is sent to
 * book in Detlio (decision 5).
 */
export default function LinkPage() {
  const t = useT()
  const isOwner = useIsVendorAdmin()
  const link = useBookLink(isOwner)
  const data = link.data

  return (
    <BookScreen>
      <BackHeader title={t('Booking link')} back="/book/business" />
      {!isOwner ? (
        <OwnerOnly />
      ) : !data ? (
        link.isError ? <LoadFailed what={t('your booking link')} onRetry={() => void link.refetch()} /> : <SkeletonList count={3} itemClassName="h-28" />
      ) : (
        <LinkBody link={data} />
      )}
    </BookScreen>
  )
}

function LinkBody({ link }: { link: BookLink }) {
  const t = useT()
  const update = useUpdateBookLink()
  // In the message the customer gets, which stays English.
  const garage = useAuthStore((s) => s.vendor?.businessName) ?? 'our garage'
  const now = new Date()
  const shown = link.url.replace(/^https?:\/\//, '')
  const share = `https://wa.me/?text=${encodeURIComponent(`Book your car wash at ${garage}: ${link.url}`)}`
  const services = link.services.filter((service) => !service.isAddon)
  const failed = (error: unknown) => toast.error(errorText(error, t("Couldn't save. Try again.")))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success(t('Link copied'))
    } catch {
      toast.error(t("Couldn't copy. Press and hold the link to copy it."))
    }
  }

  return (
    <>
      <div className="fx-edge flex items-center gap-3.5 rounded-surface p-3.5">
        <span className="shrink-0 overflow-hidden rounded-[14px] bg-white p-1">
          <QrCode value={link.url} size={120} label={t('QR code for your booking page')} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Overline>{t('Your page')}</Overline>
          <p className="text-[14px] font-semibold break-all text-text-primary select-all">{shown}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className={cn(raised, 'flex h-11 items-center gap-1.5 rounded-pill px-3 text-t4 font-semibold text-text-primary')}>
              <IconCopy size={16} aria-hidden />
              {t('Copy')}
            </button>
            <Link href="/book/link/poster" className={cn(raised, 'flex h-11 items-center gap-1.5 rounded-pill px-3 text-t4 font-semibold text-text-primary')}>
              <IconPrinter size={16} aria-hidden />
              {t('Poster')}
            </Link>
          </div>
        </div>
      </div>

      <a href={share} target="_blank" rel="noopener noreferrer" className={cn(redButton, 'flex h-12 items-center justify-center gap-2 rounded-control text-t3 font-semibold')}>
        <IconBrandWhatsapp size={19} aria-hidden />
        {t('Share on WhatsApp')}
      </a>

      <div className="grid grid-cols-2 gap-2">
        <Tile label={t('From your link')} value={link.bookingsThisMonth} sub={t('bookings in {month}', { month: monthName(now.toISOString().slice(0, 7), now).slice(0, 3) })} />
        <Tile label={t('Commission')} value={rupees(link.commissionPaise)} sub={t('your own customers')} />
      </div>

      <div className="fx-edge flex items-center gap-3 rounded-control px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-t3 font-semibold text-text-primary">{t('Take bookings on your page')}</span>
          <span className="block text-[12px] text-[#A8A8B2]">{link.active ? t('Customers can book now') : t('Off: the page says you are not taking bookings')}</span>
        </span>
        <Switch checked={link.active} label={t('Take bookings on your page')} onChange={(active) => update.mutate({ active }, { onError: failed })} />
      </div>

      <div>
        <Overline>{t('What customers can book')}</Overline>
        {services.length === 0 ? (
          <p className="py-3 text-t4 text-[#A8A8B2]">{t('Add services on Services & prices first.')}</p>
        ) : (
          services.map((service) => (
            <div key={service.id} className="flex min-h-14 items-center gap-3 border-b border-[#1d1d23] py-2">
              <span className="min-w-0 flex-1 truncate text-t3 font-semibold text-text-primary">{service.name}</span>
              <span className="shrink-0 font-numeric text-[14px] text-[#A8A8B2]">{rupees(service.pricePaise)}</span>
              <Switch
                checked={service.shown}
                label={t('Show {service} on your page', { service: service.name })}
                onChange={(shown) => update.mutate({ services: [{ serviceId: service.id, shown }] }, { onError: failed })}
              />
            </div>
          ))
        )}
      </div>
      <Footnote>{t('Someone who has booked you through Detlio before books as a Detlio booking, as today.')}</Footnote>
    </>
  )
}
