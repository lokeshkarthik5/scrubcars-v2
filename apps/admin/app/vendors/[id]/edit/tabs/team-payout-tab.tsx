'use client'

import { PayoutAccountSection } from '@/components/payout-account-section'
import { VendorTeamSection } from '../team-section'

/**
 * Team & payout (`?tab=team`): who can sign in to the garage's app, and
 * where Detlio pays it. Both save on their own, never with Save changes.
 * MISSING_TABS sends "Payout details" here.
 */
export function TeamPayoutTab({ vendorId }: { vendorId: string }) {
  return (
    <div className="grid items-start gap-4 @4xl:grid-cols-2">
      <VendorTeamSection vendorId={vendorId} />
      <PayoutAccountSection vendorId={vendorId} />
    </div>
  )
}
