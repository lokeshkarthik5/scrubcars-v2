import { ScBadge } from './badge'

/** The mark on a line that is an add-on (0068), so it isn't taken for a service. */
export function AddOnMark({ className }: { className?: string }) {
  return <ScBadge className={className}>Add-on</ScBadge>
}
