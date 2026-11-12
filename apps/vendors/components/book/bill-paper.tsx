import type { BillSnapshot, ShownPay } from '@repo/core/api/garage-book'
import { plateText, rupees, shortDate, spacedPhone } from '@repo/core/garage-book'
import { QrCode } from './qr-code'

/**
 * The bill itself (BL1), on paper: the garage, the customer's first name
 * and car, the lines and total, and, while it is unpaid, the garage's own
 * UPI QR and number; paid, "Paid by UPI ✓". "Made with Detlio for Garages"
 * always sits at its foot. It is what the customer gets (detlio.com/b/…,
 * apps/users' copy of this paper), so it stays in English, like every
 * message the customer is sent.
 */
export function BillPaper({ bill, numberText, pay, madeWith }: { bill: BillSnapshot; numberText: string; pay: ShownPay | null; madeWith: string }) {
  const plate = plateText(bill.customer.plate)
  const car = [plate, bill.customer.car].filter(Boolean).join(' · ')
  const upi = !bill.paid && pay ? upiLink(pay, bill.totalPaise, numberText) : null
  return (
    <article aria-label={`Bill ${numberText}`} className="gb-bill rounded-surface bg-gradient-to-b from-[#fbfbfc] to-[#ececf0] p-4 text-[#141418] shadow-[0_20px_40px_-18px_rgb(0_0_0/0.9)] print:shadow-none">
      <header className="flex justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] leading-6 font-bold break-words">{bill.garage.name}</h2>
          {bill.garage.address && <p className="text-[11px] leading-4 text-[#55555f]">{bill.garage.address}</p>}
          {bill.garage.phone && <p className="text-[11px] leading-4 text-[#55555f]">{spacedPhone(bill.garage.phone)}</p>}
          {bill.garage.gstin && <p className="text-[11px] leading-4 text-[#55555f]">GSTIN {bill.garage.gstin}</p>}
        </div>
        <div className="shrink-0 text-right text-[11px] leading-4 text-[#55555f]">
          <p>
            Bill <b className="font-numeric text-[#141418]">{numberText}</b>
          </p>
          <p>{longDate(bill.date)}</p>
        </div>
      </header>
      <div className="mt-3 flex justify-between gap-3 border-t border-dashed border-[#b9b9c2] py-2.5 text-[14px]">
        <span className="min-w-0 truncate">{bill.customer.firstName}</span>
        {car && <span className="min-w-0 truncate text-[#55555f]">{car}</span>}
      </div>
      <ul className="border-t border-dashed border-[#b9b9c2] py-1.5 text-[14px]">
        {bill.lines.map((line, index) => (
          <li key={index} className="flex justify-between gap-3 py-1">
            <span className="min-w-0">
              {line.label}
              {line.qty > 1 && <span className="text-[#55555f]"> ×{line.qty}</span>}
            </span>
            <span className="shrink-0 font-numeric">{rupees(line.pricePaise * line.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-dashed border-[#b9b9c2] py-2.5">
        <span className="text-[17px] font-bold">Total</span>
        <span className="font-numeric text-[18px] font-bold">{rupees(bill.totalPaise)}</span>
      </div>
      {bill.paid ? (
        <p className="border-t border-dashed border-[#b9b9c2] py-2.5 text-[14px] font-semibold text-[#15803d]">{paidWords(bill.method)}</p>
      ) : pay && (upi || pay.qrUrl || pay.phone) ? (
        <div className="flex items-center gap-3 border-t border-dashed border-[#b9b9c2] py-3">
          {upi ? (
            <span className="shrink-0 rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgb(0_0_0/0.08)]">
              <QrCode value={upi} size={76} label="UPI QR to pay this bill" />
            </span>
          ) : pay.qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to the garage's own QR picture
            <img src={pay.qrUrl} alt="UPI QR to pay this bill" width={84} height={84} className="size-[84px] shrink-0 rounded-[10px] bg-white object-contain" />
          ) : null}
          <div className="min-w-0 text-[12px] leading-[17px]">
            <p className="text-[14px] font-bold">Pay by UPI</p>
            {(upi || pay.qrUrl) && <p className="text-[#55555f]">Scan with GPay, PhonePe or Paytm</p>}
            {pay.phone && (
              <p>
                {pay.appsText ? `${pay.appsText.replaceAll('/', ' / ')}: ` : 'UPI: '}
                <b className="font-numeric">{spacedPhone(pay.phone)}</b>
              </p>
            )}
            {pay.upiId && <p className="break-all text-[11px] text-[#55555f]">{pay.upiId}</p>}
          </div>
        </div>
      ) : (
        <p className="border-t border-dashed border-[#b9b9c2] py-2.5 text-[14px] font-semibold">Not paid yet</p>
      )}
      <footer className="border-t border-dashed border-[#b9b9c2] pt-2.5 text-center">
        <p className="text-[13px]">{bill.nextWashDue ? `Thank you! Next wash due ${shortDate(`${bill.nextWashDue}T06:30:00Z`)}.` : 'Thank you!'}</p>
        <p className="mt-1 text-[11px] text-[#6b6b75]">{madeWith}</p>
      </footer>
    </article>
  )
}

/** "12 Nov 2026". */
function longDate(dateKey: string): string {
  const year = dateKey.slice(0, 4)
  return `${shortDate(`${dateKey.slice(0, 10)}T06:30:00Z`)} ${year}`
}

function paidWords(method: BillSnapshot['method']): string {
  if (method === 'upi') return 'Paid by UPI ✓'
  if (method === 'cash') return 'Paid in cash ✓'
  if (method === 'online') return 'Paid online ✓'
  return 'Paid ✓'
}

/**
 * The UPI payment link the bill's QR carries: the garage's own UPI id (read
 * from its QR picture), the amount and the bill number, so the customer's
 * app opens with everything filled in. Null without a UPI id.
 */
export function upiLink(pay: Pick<ShownPay, 'upiId' | 'upiName'>, totalPaise: number, numberText: string): string | null {
  if (!pay.upiId) return null
  const params = new URLSearchParams({ pa: pay.upiId, ...(pay.upiName ? { pn: pay.upiName } : {}), am: (totalPaise / 100).toFixed(2), cu: 'INR', tn: `Bill ${numberText}` })
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`
}
