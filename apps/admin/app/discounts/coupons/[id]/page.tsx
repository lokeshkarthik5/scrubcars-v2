'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconDownload, IconPrinter } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { listCouponCodes, type AdminCouponBatch } from '@repo/core/api/coupons'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  useCouponBatch,
  useCouponRedemptions,
} from '@repo/core/api/hooks/use-admin-coupons'
import { downloadCsv } from '@repo/core/csv'
import { CATEGORY_LABELS } from '@repo/core/categories'
import { Meta } from '@/components/meta'
import {
  VoidBatchDialog,
  VoidCodeDialog,
} from '@/components/coupons/void-dialogs'
import { formatRupees, todayIst } from '@/lib/bookings'
import {
  CHANNEL_LABELS,
  STAGE_BADGES,
  STAGE_LABELS,
  STATE_LABELS,
  batchStage,
  codesCsv,
  fileSlug,
  printedLabel,
  rate,
  redemptionsCsv,
  scannedFigure,
} from '@/lib/coupons'

function Figures({ batch }: { batch: AdminCouponBatch }) {
  const f = batch.figures
  const unique = batch.kind === 'unique'
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile
        label="Printed"
        value={printedLabel(batch)}
        hint={f.voidedCodes > 0 ? `${f.voidedCodes} void` : undefined}
      />
      <StatTile
        label="Scanned"
        value={scannedFigure(batch).toLocaleString('en-IN')}
        hint={
          unique
            ? `${rate(f.scannedCodes, batch.codeCount)} of codes opened · ${f.scans} opens`
            : 'Times the QR was opened'
        }
      />
      <StatTile
        label="Added to accounts"
        value={f.redeemed.toLocaleString('en-IN')}
        hint={
          unique
            ? `${rate(f.redeemed, batch.codeCount)} of codes${f.cancelled ? ` · ${f.cancelled} cancelled` : ''}`
            : f.cancelled
              ? `${f.cancelled} cancelled`
              : undefined
        }
      />
      <StatTile
        label="Used at checkout"
        value={f.usedAtCheckout.toLocaleString('en-IN')}
        hint={`${rate(f.usedAtCheckout, f.redeemed)} of those added`}
      />
      <StatTile
        label="Bookings"
        value={f.bookings.toLocaleString('en-IN')}
        hint="Paid and kept, Test left out"
      />
      <StatTile
        label="Revenue"
        value={formatRupees(f.revenue)}
        hint="What those customers paid"
      />
      <StatTile
        label="New customers"
        value={f.newCustomers.toLocaleString('en-IN')}
        hint="Their first booking on Detlio"
        tone={f.newCustomers > 0 ? 'success' : 'default'}
      />
      <StatTile
        label="Cost so far"
        value={formatRupees(f.cost)}
        hint={
          f.stampsGiven > 0
            ? `+ ${f.stampsGiven} bonus stamps`
            : 'Detlio pays; garages get full price'
        }
      />
    </div>
  )
}

/**
 * One batch: its figures, the offer as customers read it, the print sheet
 * and the codes CSV (both re-derived on the server, never stored), every
 * redemption with how it was added and the booking it was used on, and
 * void (the batch, or one code).
 */
export default function CouponBatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const batch = useCouponBatch(id)
  const redemptions = useCouponRedemptions(id)
  const [voiding, setVoiding] = useState<'batch' | 'code' | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthError(batch.error)) router.replace('/login')
  }, [batch.error, router])

  if (batch.isPending) return <SkeletonList count={3} itemClassName="h-32" />
  if (batch.isError || !batch.data) {
    return (
      <ErrorState
        message={errorMessage(batch.error, "Couldn't load this batch.")}
        onRetry={() => void batch.refetch()}
      />
    )
  }

  const b = batch.data.batch
  const stage = batchStage(b, todayIst())
  const channels = batch.data.channels

  const downloadCodes = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      const { codes } = await listCouponCodes(b.id)
      downloadCsv(codesCsv(b, codes), `${fileSlug(b.name)}-codes.csv`)
    } catch (error) {
      setDownloadError(errorMessage(error, "Couldn't get the codes."))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <PageHeader
        showBack
        backHref="/discounts/coupons"
        title={b.name}
        subtitle={`${b.location} · made by ${b.createdBy}`}
        actions={
          <div className="flex items-center gap-1.5">
            <ScBadge variant={STAGE_BADGES[stage]}>
              {STAGE_LABELS[stage]}
            </ScBadge>
            <ScBadge variant="muted">
              {b.kind === 'unique' ? 'Unique codes' : 'Shared code'}
            </ScBadge>
          </div>
        }
      />

      <Figures batch={b} />

      <ScCard className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-text-primary">
          The offer
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
          <Meta label="Customers read" className="col-span-2" size="md">
            {b.title}
          </Meta>
          <Meta label="Valid" size="md">
            <span className="font-numeric">
              {b.validFromDate} to {b.validToDate}
            </span>
          </Meta>
          <Meta label="Garage" size="md">
            {b.vendor?.name ?? 'Any'}
          </Meta>
          <Meta label="Service type" size="md">
            {b.serviceCategory ? CATEGORY_LABELS[b.serviceCategory] : 'Any'}
          </Meta>
          <Meta label="Minimum" size="md">
            {b.minOrder ? formatRupees(b.minOrder) : 'None'}
          </Meta>
          <Meta label="Who" size="md">
            {b.newCustomersOnly ? 'New customers only' : 'Anyone'}
          </Meta>
          <Meta label="How added" size="md">
            {(Object.keys(CHANNEL_LABELS) as Array<keyof typeof CHANNEL_LABELS>)
              .map((c) => `${CHANNEL_LABELS[c]} ${channels[c] ?? 0}`)
              .join(' · ')}
          </Meta>
        </div>
        <ul className="flex flex-col gap-0.5 text-[12px] text-text-secondary">
          {b.conditions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {b.voided && (
          <p className="text-[12px] text-error">
            Void{b.voided.by ? ` by ${b.voided.by}` : ''}
            {b.voided.reason ? `: ${b.voided.reason}` : ''}
          </p>
        )}
      </ScCard>

      <ScCard className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Print</h2>
        {b.canReprint ? (
          <>
            <p className="text-[12px] text-text-secondary">
              An A4 sheet of 10 coupons a page with cut lines, each with its QR,
              its code, the offer and the last day. Print it, or save it as a
              PDF from the print window. The CSV has every code and its link,
              for a print shop.
            </p>
            <div className="flex flex-wrap gap-2">
              <ScButtonLink
                href={`/discounts/coupons/${b.id}/print`}
                variant="secondary"
                fullWidth={false}
                className="min-h-11 gap-1.5 px-4"
              >
                <IconPrinter size={16} aria-hidden="true" /> Print sheet
              </ScButtonLink>
              <ScButton
                variant="secondary"
                fullWidth={false}
                onClick={() => void downloadCodes()}
                disabled={downloading}
                className="min-h-11 gap-1.5 px-4"
              >
                <IconDownload size={16} aria-hidden="true" />{' '}
                {downloading ? 'Getting codes…' : 'Codes CSV'}
              </ScButton>
            </div>
            {downloadError && (
              <p role="alert" className="text-[12px] text-error">
                {downloadError}
              </p>
            )}
          </>
        ) : (
          <p className="text-[12px] text-error">
            The coupon secret changed after this batch was made, so its codes
            can&apos;t be printed again (and the printed ones no longer work).
            Void it and make a new batch.
          </p>
        )}
      </ScCard>

      <section aria-labelledby="redemptions" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="redemptions"
            className="text-[15px] font-semibold text-text-primary"
          >
            Added by customers
          </h2>
          {(redemptions.data?.redemptions.length ?? 0) > 0 && (
            <ScButton
              variant="secondary"
              fullWidth={false}
              className="min-h-11 gap-1.5 px-3 text-[12px]"
              onClick={() =>
                downloadCsv(
                  redemptionsCsv(b, redemptions.data!.redemptions),
                  `${fileSlug(b.name)}-redemptions.csv`
                )
              }
            >
              <IconDownload size={14} aria-hidden="true" /> CSV
            </ScButton>
          )}
        </div>
        {redemptions.isPending ? (
          <SkeletonList count={2} itemClassName="h-16" />
        ) : redemptions.isError ? (
          <ErrorState
            message={errorMessage(
              redemptions.error,
              "Couldn't load who added them."
            )}
            onRetry={() => void redemptions.refetch()}
          />
        ) : redemptions.data.redemptions.length === 0 ? (
          <p className="text-[12px] text-text-secondary">
            Nobody has added one yet.
          </p>
        ) : (
          <ScCard className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead className="text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Added</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">How</th>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-4 py-2 text-right font-medium">Booking</th>
                </tr>
              </thead>
              <tbody className="text-text-secondary">
                {redemptions.data.redemptions.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2 font-numeric">
                      {r.addedAt.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 text-text-primary">
                      {r.customer ? (
                        <>
                          {r.customer.name ?? 'A customer'}{' '}
                          <span className="font-numeric text-text-muted">
                            {r.customer.phone}
                          </span>
                        </>
                      ) : (
                        'Deleted account'
                      )}
                    </td>
                    <td className="px-3 py-2">{CHANNEL_LABELS[r.channel]}</td>
                    <td className="px-3 py-2 font-numeric">…{r.codeSuffix}</td>
                    <td className="px-3 py-2">{STATE_LABELS[r.state]}</td>
                    <td className="px-4 py-2 text-right font-numeric">
                      {r.booking
                        ? `${formatRupees(r.booking.amount)} (−${formatRupees(r.booking.discount)})`
                        : r.stamps
                          ? `${r.stamps} stamps`
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScCard>
        )}
      </section>

      {!b.voided && (
        <ScCard className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Stop it
          </h2>
          <p className="text-[12px] text-text-secondary">
            Void one code (a lost card, a code posted online) or the whole
            batch. A coupon already used on a booking stays used.
          </p>
          <div className="flex flex-wrap gap-2">
            <ScButton
              variant="secondary"
              fullWidth={false}
              onClick={() => setVoiding('code')}
              className="min-h-11 px-4"
            >
              Void a code
            </ScButton>
            <ScButton
              variant="secondary"
              fullWidth={false}
              onClick={() => setVoiding('batch')}
              className="min-h-11 px-4"
            >
              Void batch
            </ScButton>
          </div>
        </ScCard>
      )}

      {voiding === 'batch' && (
        <VoidBatchDialog batch={b} onClose={() => setVoiding(null)} />
      )}
      {voiding === 'code' && (
        <VoidCodeDialog batch={b} onClose={() => setVoiding(null)} />
      )}
    </>
  )
}
