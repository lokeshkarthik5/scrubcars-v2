import {
  offerConditions,
  offerTitle,
  type CouponOffer,
} from '@repo/core/coupons'
import { ScCard } from '@repo/ui/sc/card'

/**
 * What a customer will read for this batch, as the form is filled in: the
 * same words the server generates from the columns (packages/core/src/
 * coupons.ts is the server's twin). The campaign's name and location never
 * show to customers.
 */
export function CouponPreview({
  offer,
  validTo,
}: {
  offer: CouponOffer
  validTo: string
}) {
  return (
    <ScCard className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        Customers read
      </p>
      <p className="text-[15px] font-semibold text-text-primary">
        {offerTitle(offer)}
      </p>
      <ul className="flex flex-col gap-0.5 text-[12px] text-text-secondary">
        {offerConditions(offer).map((line) => (
          <li key={line}>{line}</li>
        ))}
        {validTo && <li>Valid till {validTo}.</li>}
      </ul>
    </ScCard>
  )
}
