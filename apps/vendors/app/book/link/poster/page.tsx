'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useBookLink } from '@repo/core/api/hooks/use-garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useT } from '@repo/core/i18n'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { QrCode } from '@/components/book/qr-code'
import { raised, redButton } from '@/components/book/parts'
import { useGarageBookOn } from '@/lib/garage-book'

/**
 * The booking link's poster: an A4 page to print and put up at the counter,
 * the garage's name, a big QR and the link. White paper, black ink, nothing
 * else prints. The words are for the garage's customers, so English.
 */
export default function PosterPage() {
  const t = useT()
  const router = useRouter()
  const { on, known } = useGarageBookOn()
  const isOwner = useIsVendorAdmin()
  const link = useBookLink(on && isOwner)
  const garage = useAuthStore((s) => s.vendor?.businessName) ?? ''
  useEffect(() => {
    if (known && !on) router.replace('/home')
  }, [known, on, router])
  if (!on) return null
  const data = link.data

  return (
    <main className="min-h-dvh bg-white text-[#0a0a0b]">
      <div className="gb-noprint mx-auto flex max-w-[428px] items-center justify-between gap-3 px-4 pt-4">
        <Link href="/book/link" className={cn(raised, 'grid h-11 place-items-center rounded-small px-4 text-t4 font-semibold text-text-primary')}>
          {t('Back')}
        </Link>
        <button type="button" disabled={!data} onClick={() => window.print()} className={cn(redButton, 'h-11 rounded-small px-5 text-t4 font-semibold')}>
          {t('Print poster')}
        </button>
      </div>
      {data ? (
        <section className="mx-auto flex max-w-[640px] flex-col items-center gap-6 px-6 py-10 text-center">
          <p className="text-[13px] font-bold tracking-[0.14em] uppercase text-[#55555f]">Book your car wash</p>
          <h1 className="text-[34px] leading-[40px] font-bold tracking-[-0.02em] break-words">{garage}</h1>
          <QrCode value={data.url} size={300} label="QR code to book" className="h-auto w-full max-w-[300px]" />
          <p className="text-[20px] font-semibold">Scan with your phone camera</p>
          <p className="font-numeric text-[18px] break-all">{data.url.replace(/^https?:\/\//, '')}</p>
          <p className="text-[14px] text-[#55555f]">Pick a time, pay at the garage. No app needed.</p>
        </section>
      ) : (
        <p className="px-6 py-10 text-center text-t4 text-[#55555f]">{link.isError ? t("Couldn't load your booking link.") : t('Getting your poster…')}</p>
      )}
    </main>
  )
}
