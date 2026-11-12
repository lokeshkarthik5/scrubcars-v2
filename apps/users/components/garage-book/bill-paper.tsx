import type { PublicBill } from '@repo/core/api/garage-book'
import { plateText, rupees, shortDate, spacedPhone } from '@repo/core/garage-book'
import { QrCode } from '@/components/certificate/qr-code'
import { upiLink } from '@/lib/garage-book-public'

/**
 * A garage's bill on paper (BL1), as the garage portal previews it
 * (apps/vendors components/book/bill-paper.tsx draws the same): the garage,
 * the customer's first name and car (never a phone), the lines and total,
 * and while it is unpaid the garage's own UPI QR and number; paid, "Paid by
 * UPI ✓". "Made with Detlio for Garages" always sits at its foot.
 */
export function BillPaper({ bill }: { bill: PublicBill }) {
  const plate = plateText(bill.customer.plate)
  const car = [plate, bill.customer.car].filter(Boolean).join(' · ')
  const pay = bill.pay
  const upi = !bill.paid && pay ? upiLink(pay, bill.totalPaise, bill.numberText) : null
  return (
    <article aria-label={`Bill ${bill.numberText}`} className="rounded-[20px] bg-gradient-to-b from-[#fbfbfc] to-[#ececf0] p-4 text-[#141418] shadow-[0_20px_40px_-18px_rgb(0_0_0/0.9)] print:rounded-none print:bg-none print:p-0 print:shadow-none">
      <header className="flex justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[17px] leading-6 font-bold break-words">{bill.garage.name}</h1>
          {bill.garage.address && <p className="text-[11px] leading-4 text-[#55555f]">{bill.garage.address}</p>}
          {bill.garage.phone && <p className="text-[11px] leading-4 text-[#55555f]">{spacedPhone(bill.garage.phone)}</p>}
          {bill.garage.gstin && <p className="text-[11px] leading-4 text-[#55555f]">GSTIN {bill.garage.gstin}</p>}
        </div>
        <div className="shrink-0 text-right text-[11px] leading-4 text-[#55555f]">
          <p>
            Bill <b className="font-numeric text-[#141418]">{bill.numberText}</b>
          </p>
          <p>{`${shortDate(`${bill.date}T06:30:00Z`)} ${bill.date.slice(0, 4)}`}</p>
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
              <QrCode value={upi} size={84} label="UPI QR to pay this bill" />
            </span>
          ) : pay.qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to the garage's own QR picture
            <img src={pay.qrUrl} alt="UPI QR to pay this bill" width={92} height={92} referrerPolicy="no-referrer" className="size-[92px] shrink-0 rounded-[10px] bg-white object-contain" />
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
        <p className="mt-1 text-[11px] text-[#6b6b75]">{bill.madeWith}</p>
      </footer>
    </article>
  )
}

function paidWords(method: PublicBill['method']): string {
  if (method === 'upi') return 'Paid by UPI ✓'
  if (method === 'cash') return 'Paid in cash ✓'
  if (method === 'online') return 'Paid online ✓'
  return 'Paid ✓'
}
