'use client'

import { use, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ScButton } from '@repo/ui/sc/button'
import { ScCheckbox } from '@repo/ui/sc/checkbox'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminCouponBatch, PrintedCode } from '@repo/core/api/coupons'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useCouponCodes } from '@repo/core/api/hooks/use-admin-coupons'
import { COUPON_SCAN_LINE } from '@repo/core/coupons'
import { QrCode } from '@/components/coupons/qr-code'
import { COUPONS_PER_PAGE, codesToPrint, printDate, sheetPages } from '@/lib/coupons'

/**
 * A4 at 8 mm margins: 2 coupons across, 5 down, each 97 × 56 mm with a
 * dashed cut line round it. Printing shows only the sheet (the panel, this
 * toolbar and the rest of the page are hidden), so "Save as PDF" in the
 * print window gives the print-ready PDF.
 */
const PRINT_CSS = `
@page { size: A4; margin: 8mm; }
@media print {
  body > *:not(#coupon-sheet-root) { display: none !important; }
  #coupon-sheet-root { position: static !important; overflow: visible !important; background: #fff !important; }
  #coupon-sheet-root .no-print { display: none !important; }
  #coupon-sheet-root .sheet-page { margin: 0 !important; padding: 0 !important; width: auto !important; box-shadow: none !important; }
}
`

const noSubscription = () => () => {}

const ink = '#0A0A0B'
const red = '#EF3240'

/** The Detlio wordmark in ink for paper (the panel's logo is white on clear, made for the dark screens). */
function Wordmark() {
  return (
    <span style={{ fontWeight: 800, fontSize: '15pt', letterSpacing: '-0.03em', color: ink, lineHeight: 1 }}>
      Detlio<span style={{ color: red }}>.</span>
    </span>
  )
}

function Coupon({ batch, code }: { batch: AdminCouponBatch; code: PrintedCode }) {
  // The first lines of small print; "one use" is on the page they open.
  const lines = batch.conditions.filter((line) => !line.startsWith('One use')).slice(0, 3)
  return (
    <div
      style={{
        width: '97mm',
        height: '56mm',
        boxSizing: 'border-box',
        border: '0.3mm dashed #9a9a9a',
        padding: '4mm',
        display: 'flex',
        gap: '3mm',
        color: ink,
        background: '#fff',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        breakInside: 'avoid',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.2mm' }}>
        <Wordmark />
        <div style={{ fontSize: '13pt', fontWeight: 700, lineHeight: 1.15 }}>{batch.title}</div>
        <div style={{ fontSize: '7pt', lineHeight: 1.3, color: '#333' }}>
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', fontSize: '11pt', fontWeight: 700, letterSpacing: '0.04em', fontFamily: 'var(--font-space-grotesk), ui-monospace, monospace' }}>
          {code.code}
        </div>
        <div style={{ fontSize: '7pt', color: '#333' }}>Valid till {printDate(batch.validToDate)}</div>
      </div>
      <div style={{ width: '30mm', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5mm' }}>
        <QrCode value={code.link} size="30mm" label={`QR for coupon ${code.code}`} />
        <div style={{ fontSize: '6pt', lineHeight: 1.25, textAlign: 'center', color: '#333' }}>{COUPON_SCAN_LINE}</div>
      </div>
    </div>
  )
}

/**
 * Discounts → Coupons → a batch → Print sheet. The codes are re-derived on
 * the server for this page and never kept in the browser's cache. Codes
 * already added are left out unless asked for (a reprint of what is still
 * to hand out); void codes never print.
 */
export default function PrintCouponsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const codes = useCouponCodes(id, true)
  const [includeAdded, setIncludeAdded] = useState(false)
  // The sheet goes straight under <body> (a portal), so printing can hide
  // everything else; only in the browser.
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  )

  if (codes.isPending) return <SkeletonList count={2} itemClassName="h-40" />
  if (codes.isError || !codes.data) {
    return <ErrorState message={errorMessage(codes.error, "Couldn't get this batch's codes.")} onRetry={() => void codes.refetch()} />
  }
  if (!inBrowser) return null

  const { batch } = codes.data
  const printable = codesToPrint(codes.data.codes, includeAdded)
  const pages = sheetPages(printable)

  return createPortal(
    <div id="coupon-sheet-root" style={{ position: 'fixed', inset: 0, zIndex: 60, overflow: 'auto', background: '#d9d9d9' }}>
      <style>{PRINT_CSS}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-brand-black px-4 py-3 text-text-primary">
        <Link href={`/discounts/coupons/${id}`} className="min-h-11 content-center text-[13px] text-text-secondary hover:text-text-primary">
          ← Back
        </Link>
        <p className="min-w-0 flex-1 truncate text-[13px]">
          {batch.name}: <span className="font-numeric">{printable.length}</span> coupons on{' '}
          <span className="font-numeric">{pages.length}</span> {pages.length === 1 ? 'page' : 'pages'} ({COUPONS_PER_PAGE} a page)
        </p>
        <ScCheckbox label="Include codes already added" checked={includeAdded} onChange={setIncludeAdded} />
        <ScButton fullWidth={false} onClick={() => window.print()} disabled={printable.length === 0} className="min-h-11 px-5">
          Print or save as PDF
        </ScButton>
      </div>
      {pages.length === 0 ? (
        <p className="no-print p-6 text-[13px] text-text-primary">Nothing to print: every code is void or already added.</p>
      ) : (
        pages.map((page, index) => (
          <div
            key={index}
            className="sheet-page"
            style={{
              width: '210mm',
              boxSizing: 'border-box',
              padding: '8mm',
              margin: '16px auto',
              background: '#fff',
              boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
              display: 'grid',
              gridTemplateColumns: '97mm 97mm',
              gridAutoRows: '56mm',
              breakAfter: index < pages.length - 1 ? 'page' : 'auto',
            }}
          >
            {page.map((code) => (
              <Coupon key={code.seq} batch={batch} code={code} />
            ))}
          </div>
        ))
      )}
    </div>,
    document.body
  )
}
