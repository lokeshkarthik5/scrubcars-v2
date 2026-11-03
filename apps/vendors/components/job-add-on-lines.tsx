import { addOnLinesOf } from '@repo/core/add-ons'
import type { Booking } from '@repo/core/types'
import { AddOnMark } from '@repo/ui/sc/add-on-mark'

/** Each add-on on its own marked line, under the service (frame F). */
export function JobAddOnLines({
  items,
  className,
}: {
  items: Booking['items']
  className?: string
}) {
  return (
    <>
      {addOnLinesOf(items).map((item) => (
        <p
          key={item.id}
          className={`flex items-center gap-1.5 ${className ?? ''}`}
        >
          {item.name}
          <AddOnMark />
        </p>
      ))}
    </>
  )
}
