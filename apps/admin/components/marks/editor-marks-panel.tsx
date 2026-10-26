// PLACEHOLDER-W4: W4's real panel replaces this file at merge.
import type { MissingKey } from '@repo/core/onboarding-marks'

/**
 * The garage editor's "To collect" and marks panel (W4), in the status
 * column. Renders nothing until W4's file lands; the editor already passes
 * what it needs.
 */
export function GarageMarksPanel(props: {
  vendorId: string
  missing?: MissingKey[]
  readOnly?: boolean
}): React.JSX.Element | null {
  void props
  return null
}
