'use client'

import { PayoutAccountSection } from '@/components/payout-account-section'
import { VendorTeamSection } from '../team-section'

/**
 * Team & payout (`?tab=team`): who can sign in to the garage's app, and
 * where Detlio pays it. Both save on their own, never with Save changes.
 * MISSING_TABS sends "Payout details" here.
 */
export function TeamPayoutTab({
  vendorId,
  onSaved,
}: {
  vendorId: string
  /** A payout save landed: the checklist may have changed. */
  onSaved?: () => void
}) {
  return (
    <div className="grid items-start gap-4 @3xl:grid-cols-2">
      <VendorTeamSection vendorId={vendorId} />
      <PayoutAccountSection vendorId={vendorId} onSaved={onSaved} />
    </div>
  )
}
