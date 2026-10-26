// PLACEHOLDER-W4: W4's real component replaces this file at merge.
import type { AdminVendor } from '@repo/core/api/admin'
import type { MissingKey } from '@repo/core/onboarding-marks'

export function MissingChips(props: {
  vendors: AdminVendor[]
  value: MissingKey | null
  onChange: (k: MissingKey | null) => void
}) {
  void props
  return null
}
