'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { IconDownload, IconShare } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { BrandMark } from '@repo/ui/sc/brand-mark'
import { ScButton } from '@repo/ui/sc/button'
import { TopBar } from '@repo/ui/sc/top-bar'
import { ApiError } from '@repo/core/api/client'
import { getBookingReceipt } from '@repo/core/api/bookings'
import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types'
import {
  RECEIPT_NOT_TAX_INVOICE,
  formatReceiptAmount,
  receiptFileTitle,
} from '@repo/core/receipts'
import type { BookingReceipt } from '@repo/core/types'
import { fill, useT } from '@repo/core/i18n'

/**
 * Printing is how the receipt becomes a PDF: every phone and desktop browser
 * offers "Save as PDF" in its print screen, so there is no PDF to generate
 * and nothing to keep in step with this page.
 *
 * Mounted only on this route, so the A4 page and the white paper apply to
 * the receipt and to nothing else the app prints. Everything is black on
 * paper: grey text and the brand dot fade on a cheap printer, and a receipt
 * that is hard to read is no use as a record.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; }
  .receipt-doc, .receipt-doc * { color: #000 !important; border-color: #d4d4d4 !important; }
}
`

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; receipt: BookingReceipt }
  /** No payment through yet, or the booking was moved: the server says which. */
  | { kind: 'unavailable'; message: string }
  /**
   * Paid, but its receipt number could not be issued yet (the server has
   * told ops). Worth trying again, so the page offers to.
   */
  | { kind: 'pending'; message: string }
  | { kind: 'error' }

/**
 * How long a print screen has to show up before we say it won't. Long
 * enough for a slow phone; a browser that opens one fires beforeprint
 * straight away.
 */
const PRINT_OPEN_WAIT_MS = 1000

export default function BookingReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useT()
  const { id } = use(params)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  // Bumped by "Try again" to load the receipt once more.
  const [attempt, setAttempt] = useState(0)
  // Set when Download PDF opened no print screen: see downloadPdf.
  const [printBlocked, setPrintBlocked] = useState(false)

  useEffect(() => {
    let live = true
    getBookingReceipt(id)
      .then((receipt) => live && setState({ kind: 'ready', receipt }))
      .catch((error: unknown) => {
        if (!live) return
        if (error instanceof ApiError && error.code === 'RECEIPT_NOT_AVAILABLE') {
          setState({ kind: 'unavailable', message: error.message })
        } else if (error instanceof ApiError && error.code === 'RECEIPT_NUMBER_PENDING') {
          setState({ kind: 'pending', message: error.message })
        } else {
          setState({ kind: 'error' })
        }
      })
    return () => {
      live = false
    }
  }, [id, attempt])

  // The browser names a saved PDF after the page title, so "Save as PDF"
  // suggests "Detlio receipt DTL-26-27-000123" rather than "Detlio". Only
  // the title swaps the number's slashes for hyphens (receiptFileTitle);
  // everywhere the customer reads it, the number is printed as issued.
  const receiptNumberForTitle = state.kind === 'ready' ? state.receipt.receiptNumber : null
  useEffect(() => {
    if (!receiptNumberForTitle) return
    const previous = document.title
    document.title = receiptFileTitle(receiptNumberForTitle)
    return () => {
      document.title = previous
    }
  }, [receiptNumberForTitle])

  // In-app browsers (Instagram, Facebook and other WebViews) ignore
  // window.print() without a word, so the page's main button would do
  // nothing. A browser that does open a print screen fires beforeprint (and
  // switches to print media) first; if neither happens, say why and what to
  // do instead.
  const downloadPdf = () => {
    setPrintBlocked(false)
    let opened = false
    const onPrint = () => {
      opened = true
    }
    const printMedia = window.matchMedia('print')
    window.addEventListener('beforeprint', onPrint)
    printMedia.addEventListener('change', onPrint)
    window.print()
    window.setTimeout(() => {
      window.removeEventListener('beforeprint', onPrint)
      printMedia.removeEventListener('change', onPrint)
      if (!opened) setPrintBlocked(true)
    }, PRINT_OPEN_WAIT_MS)
  }

  const share = async () => {
    if (state.kind !== 'ready') return
    const url = window.location.href
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Detlio receipt ${state.receipt.receiptNumber}`, url })
        return
      } catch (error) {
        // Closing the share sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('Link copied'))
    } catch {
      toast.info(t("Couldn't copy the link. Use Download PDF to keep a copy instead."))
    }
  }

  if (state.kind !== 'ready') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[428px] flex-col bg-brand-black px-4 py-4">
        <TopBar showBack backHref={`/bookings/${id}`} title={t('Receipt')} />
        {state.kind === 'loading' ? (
          <p role="status" className="pt-4 text-t4 text-text-secondary">
            {t('Loading your receipt…')}
          </p>
        ) : (
          <div className="flex flex-col gap-4 pt-4">
            <p className="text-t4 text-text-secondary">
              {state.kind === 'unavailable' || state.kind === 'pending'
                ? state.message
                : t('Could not load this receipt. It may have been removed or you may not have access.')}
            </p>
            {state.kind === 'pending' && (
              <ScButton
                variant="secondary"
                onClick={() => {
                  setState({ kind: 'loading' })
                  setAttempt((n) => n + 1)
                }}
                className="min-h-11"
              >
                {t('Try again')}
              </ScButton>
            )}
            <Link
              href={`/bookings/${id}`}
              className="flex min-h-11 items-center justify-center rounded-[10px] border border-border text-sm font-semibold text-text-primary"
            >
              {t('Back to booking')}
            </Link>
          </div>
        )}
      </main>
    )
  }

  const { receipt } = state

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[840px] flex-col bg-brand-black px-4 pb-10 print:max-w-none print:bg-white print:p-0">
      <style>{PRINT_CSS}</style>

      {/* Everything the customer uses to get the receipt out of the app.
          None of it belongs on the paper. */}
      <div className="print:hidden">
        <TopBar showBack backHref={`/bookings/${receipt.booking.id}`} title={t('Receipt')} center />
        <div className="flex gap-2">
          {/* The page's one main action: what most people opened it for. */}
          <ScButton
            onClick={downloadPdf}
            className="flex min-h-11 items-center justify-center gap-2"
          >
            <IconDownload size={18} aria-hidden />
            {t('Download PDF')}
          </ScButton>
          <ScButton
            variant="secondary"
            onClick={share}
            className="flex min-h-11 items-center justify-center gap-2"
          >
            <IconShare size={18} aria-hidden />
            {t('Share')}
          </ScButton>
        </div>
        {printBlocked && (
          <p
            role="alert"
            className="mt-3 rounded-[10px] border border-warning bg-warning-muted/20 px-3 py-2 text-t4 text-warning"
          >
            {t("Your browser can't print from here. Open this page in Chrome or Safari (⋮ › Open in browser) to save it as a PDF. You may need to sign in there.")}
          </p>
        )}
        {/* iPhones have no "Save as PDF" printer: Safari saves a PDF from
            the Share button on its print screen. So both phones get a line. */}
        <p className="mt-2 text-t5 text-text-muted">
          {fill(t("Download PDF opens your phone's print screen. On Android, choose {part} as the printer; on iPhone, tap {part2} at the top, then {part3}. A shared link only opens for you when signed in, so send the PDF to anyone else."), { part: <strong>{t('Save as PDF')}</strong>, part2: <strong>{t('Share')}</strong>, part3: <strong>{t('Save to Files')}</strong> })}
        </p>
      </div>

      <ReceiptDocument receipt={receipt} />
    </main>
  )
}

/*
 * The receipt on screen is in the finish (docs/ui-round-2026-11.md §1): a
 * dark card with the lit edge, overline section titles, figures in Space
 * Grotesk 600 and hairlines; still, with no motion. On paper it is the plain
 * white document it always was: every screen-only look below has a `print:`
 * twin putting back the paper's size, weight and spacing, and PRINT_CSS
 * turns every word black and every rule light grey.
 */

/** Overline: a section's small label (10/600 uppercase; the paper's 11). */
const OVERLINE =
  'text-over font-semibold uppercase text-[#8E8E98] print:text-t5 print:tracking-wide'

/** A hairline between sections. */
const RULE = 'border-t border-white/[0.07]'

/** A label and its value on one row; the value right-aligned. */
function Row({
  label,
  value,
  strong = false,
  numeric = true,
  tone,
}: {
  label: React.ReactNode
  value: React.ReactNode
  strong?: boolean
  /** The value is a figure, date or id (Space Grotesk), not words. */
  numeric?: boolean
  /** Money going back to the customer reads green, as elsewhere in the app. */
  tone?: 'refund'
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-1 ${strong ? 'text-t3 font-semibold print:font-bold' : 'text-t4'}`}
    >
      <span className={`min-w-0 break-words ${strong ? 'text-text-primary' : 'text-[#D8D8DE]'}`}>
        {label}
      </span>
      {/* Never narrower than its longest word: an amount stays on one line,
          while a long date can wrap on a narrow phone. */}
      <span
        className={`text-right ${numeric ? `font-numeric font-semibold ${strong ? 'print:font-bold' : 'print:font-normal'}` : ''} ${tone === 'refund' ? 'text-success' : 'text-text-primary'}`}
      >
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${RULE} pt-4 break-inside-avoid`}>
      <h2 className={`mb-2 ${OVERLINE}`}>{title}</h2>
      {children}
    </section>
  )
}

/** A dashed hairline inside a section, above a subtotal. */
function SubRule() {
  return <div className="mt-1 border-t border-dashed border-white/[0.1]" />
}

/** A detail under a line: a payment id, a date, how a refund went back. */
function Detail({ children }: { children: React.ReactNode }) {
  return <p className="text-t5 text-[#8E8E98]">{children}</p>
}

/**
 * The receipt itself. On screen, a card in the finish; printed (and saved as
 * a PDF), white paper with black type, whatever the screen shows.
 */
function ReceiptDocument({ receipt }: { receipt: BookingReceipt }) {
  const { issuer, booking, bookingPayment, finalBill } = receipt

  return (
    <article
      aria-label={`Payment receipt ${receipt.receiptNumber}`}
      className="receipt-doc fx-edge mt-4 flex flex-col gap-5 rounded-[22px] px-5 py-6 text-text-primary sm:px-10 sm:py-10 print:mt-0 print:rounded-none print:border-0 print:bg-white print:bg-none print:p-0 print:shadow-none"
    >
      {/* Stacked on a phone, where the address needs the full width; side by
          side from sm up, which includes the printed page. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {/* On screen, the real wordmark (white, with its red dot). Its
              artwork would vanish on white paper, so the paper has it in
              type: issuer.name is always "Detlio" (RECEIPT_ISSUER), so the
              two say the same. */}
          <span className="block print:hidden">
            <BrandMark height={26} />
          </span>
          <p className="hidden text-[26px] font-bold leading-none tracking-tight print:block">
            {issuer.name}
            <span className="text-brand-red" aria-hidden>
              .
            </span>
          </p>
          {/* The business behind the brand, so the customer knows who they
              paid; "Detlio" alone is a brand, not a business. */}
          {issuer.tradeName && (
            <p className="mt-3 text-t5 text-[#D8D8DE] print:mt-2">Operated by {issuer.tradeName}</p>
          )}
          {issuer.address && <p className="text-t5 text-[#8E8E98]">{issuer.address}</p>}
          <p className="mt-1 text-t5 text-[#8E8E98]">{issuer.website}</p>
        </div>
        <div className="sm:shrink-0 sm:text-right">
          <h1 className="text-t3 font-semibold">Payment receipt</h1>
          <p className="mt-1 font-numeric text-t4 font-semibold print:font-medium">
            {receipt.receiptNumber}
          </p>
          <p className="text-t5 text-[#8E8E98]">
            Issued <span className="font-numeric">{receipt.issuedOn}</span>
          </p>
        </div>
      </header>

      <div className={`grid gap-4 ${RULE} pt-4 sm:grid-cols-2`}>
        <div className="min-w-0">
          <h2 className={`mb-1 ${OVERLINE}`}>Customer</h2>
          <p className="text-t4 font-medium">{receipt.customer.name}</p>
          <p className="font-numeric text-t4">{receipt.customer.phone}</p>
        </div>
        <div className="min-w-0">
          <h2 className={`mb-1 ${OVERLINE}`}>Garage</h2>
          <p className="text-t4 font-medium">{receipt.garage.name}</p>
          <p className="text-t4 text-[#A8A8B2]">{receipt.garage.address}</p>
        </div>
      </div>

      <Section title="Booking">
        <Row label="Booking" value={`#${booking.reference}`} />
        {/* A moved booking's receipt is numbered by the first booking of
            its chain (receipt_numbers.root_booking_id), so the receipt names
            that booking too: it is the one the number was issued on, and the
            one ops' receipt-number search leads back to. */}
        {booking.originalReference && (
          <Row label="First booked as" value={`#${booking.originalReference}`} />
        )}
        <Row label="Service date" value={booking.scheduledAtLabel} />
        <Row label="Type" value={BOOKING_TYPE_LABELS[booking.bookingType]} numeric={false} />
        <Row label="Status" value={booking.statusLabel} numeric={false} />
      </Section>

      <Section title="Services">
        {receipt.items.map((item, index) => (
          <Row
            key={`${item.name}-${index}`}
            // Plain words, not a chip, so the mark survives the PDF (0068).
            label={item.isAddon ? `${item.name} · Add-on` : item.name}
            value={formatReceiptAmount(item.amount)}
          />
        ))}
        {/* An accepted request's travel fee (0062): its own line. */}
        {receipt.travelFee && <Row label="Travel fee" value={formatReceiptAmount(receipt.travelFee)} />}
        {receipt.discount && (
          <>
            <SubRule />
            <Row label="Subtotal" value={formatReceiptAmount(receipt.subtotal)} />
            <Row
              label={`${receipt.discount.label ?? 'Discount'}${receipt.discount.code ? ` (${receipt.discount.code})` : ''}`}
              value={formatReceiptAmount(receipt.discount.amount, true)}
            />
          </>
        )}
        <SubRule />
        <Row label="Paid at booking" value={formatReceiptAmount(bookingPayment.amount)} strong />
        <Detail>{bookingPayment.method}</Detail>
        {/* Gift a wash (0049): how the booking's payment was split. */}
        {bookingPayment.credit && (
          <>
            <Detail>
              Detlio credit <span className="font-numeric">{formatReceiptAmount(bookingPayment.credit.amount)}</span>
            </Detail>
            {Number(bookingPayment.credit.razorpayAmount) > 0 && (
              <Detail>
                Online (Razorpay){' '}
                <span className="font-numeric">{formatReceiptAmount(bookingPayment.credit.razorpayAmount)}</span>
              </Detail>
            )}
          </>
        )}
        {bookingPayment.paymentId && (
          <Detail>
            Payment ID <span className="font-numeric">{bookingPayment.paymentId}</span>
          </Detail>
        )}
        {bookingPayment.paidAtLabel && (
          <Detail>
            Paid <span className="font-numeric">{bookingPayment.paidAtLabel}</span>
          </Detail>
        )}
      </Section>

      {finalBill && (
        <Section title="Final bill">
          {finalBill.lines.map((line, index) => (
            <Row
              key={`${line.description}-${index}`}
              label={line.description}
              value={formatReceiptAmount(line.amount)}
            />
          ))}
          <SubRule />
          <Row label="Bill total" value={formatReceiptAmount(finalBill.total)} />
          {/* Worded and split as on the booking page's final-bill card: what
              was paid at booking matches the Services section above, and
              the discount kept is its own line. */}
          <Row
            label="Paid at booking"
            value={formatReceiptAmount(finalBill.creditedFromBooking, true)}
          />
          {finalBill.discount && (
            <Row
              label={`Discount${finalBill.discount.code ? ` (${finalBill.discount.code})` : ''}`}
              value={formatReceiptAmount(finalBill.discount.amount, true)}
            />
          )}
          <Row label="Balance paid" value={formatReceiptAmount(finalBill.balancePaid)} strong />
          <Detail>Online (Razorpay)</Detail>
          {finalBill.paymentId && (
            <Detail>
              Payment ID <span className="font-numeric">{finalBill.paymentId}</span>
            </Detail>
          )}
          {finalBill.paidAtLabel && (
            <Detail>
              Paid <span className="font-numeric">{finalBill.paidAtLabel}</span>
            </Detail>
          )}
        </Section>
      )}

      {/* Extra work approved and paid in the app (0041), a line each with
          its own payment. */}
      {(receipt.extraWork?.length ?? 0) > 0 && (
        <Section title="Extra work">
          {receipt.extraWork!.map((work, index) => (
            <div key={`${work.paymentId ?? 'work'}-${index}`} className="py-1">
              <Row label={work.description} value={formatReceiptAmount(work.amount)} strong />
              <Detail>Online (Razorpay)</Detail>
              {work.paymentId && (
                <Detail>
                  Payment ID <span className="font-numeric">{work.paymentId}</span>
                </Detail>
              )}
              {work.paidAtLabel && (
                <Detail>
                  Paid <span className="font-numeric">{work.paidAtLabel}</span>
                </Detail>
              )}
            </div>
          ))}
        </Section>
      )}

      {receipt.refunds.length > 0 && (
        <Section title="Refunds">
          {receipt.refunds.map((refund, index) => (
            <div key={`${refund.refundedAt ?? 'refund'}-${index}`} className="py-1">
              <Row
                label={
                  refund.against === 'final_bill'
                    ? 'Refund of final bill'
                    : refund.against === 'extra_work'
                      ? 'Refund of extra work'
                      : 'Refund'
                }
                value={formatReceiptAmount(refund.amount, true)}
                tone="refund"
              />
              <Detail>
                {refund.method}
                {refund.refundedAtLabel && (
                  <>
                    {' '}
                    on <span className="font-numeric">{refund.refundedAtLabel}</span>
                  </>
                )}
              </Detail>
              {refund.reference && (
                <Detail>
                  Refund ID <span className="font-numeric">{refund.reference}</span>
                </Detail>
              )}
            </div>
          ))}
        </Section>
      )}

      <Section title="Total">
        <Row label="Total paid" value={formatReceiptAmount(receipt.totalPaid)} />
        {receipt.refunds.length > 0 && (
          <Row
            label="Refunded"
            value={formatReceiptAmount(receipt.totalRefunded, true)}
            tone="refund"
          />
        )}
        {/* The figure the receipt is for: a size up on screen, with the
            page's one red light under it. On paper, the bold line it was. */}
        <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-white/[0.07] pt-3 print:mt-0 print:border-0 print:py-1">
          <span className="min-w-0 break-words text-t3 font-semibold print:font-bold">
            Net amount paid
          </span>
          <span className="flex flex-col items-end">
            <span className="text-right font-numeric text-t2 font-semibold print:text-t3 print:font-bold">
              {formatReceiptAmount(receipt.netPaid)}
            </span>
            <span aria-hidden className="fx-red-light mt-1.5 print:hidden" />
          </span>
        </div>
      </Section>

      <footer className={`${RULE} pt-4 text-t5 text-[#8E8E98]`}>
        <p className="font-medium text-text-primary">{RECEIPT_NOT_TAX_INVOICE}</p>
        <p className="mt-1">
          Questions about this receipt? Call Detlio support on{' '}
          <span className="whitespace-nowrap font-numeric">{issuer.supportPhone}</span>
          {issuer.supportEmail && <> or write to {issuer.supportEmail}</>}, quoting{' '}
          <span className="whitespace-nowrap font-numeric">{receipt.receiptNumber}</span>.
        </p>
      </footer>
    </article>
  )
}
