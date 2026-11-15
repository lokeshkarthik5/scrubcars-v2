import type { RepairBox } from '@repo/core/api/repair-quotes'
import { cn } from '@repo/core/utils'

/**
 * A picture of the damage with Detlio's box drawn on it ("What garages will
 * see"): the box in the red of the finish, and the damage in a few words
 * under it. The box is shares of the picture (0–1), so it holds at any size.
 */
export function BoxedPhoto({
  src,
  alt,
  box,
  label,
  className,
}: {
  src: string
  alt: string
  box: RepairBox | null
  label?: string | null
  className?: string
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-[14px] bg-surface-elevated', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" />
      {box && (
        <>
          <span
            aria-hidden="true"
            className="absolute rounded-[8px] border-2 border-[#ff2d4a] shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_0_14px_rgba(255,45,74,0.55)]"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
          />
          {label && (
            <span
              className="absolute max-w-[60%] truncate rounded-[6px] bg-black/75 px-1.5 py-0.5 text-t5 font-semibold text-white"
              style={{
                left: `${Math.min(box.x * 100, 60)}%`,
                top: `${Math.min((box.y + box.h) * 100 + 2, 88)}%`,
              }}
            >
              {label}
            </span>
          )}
        </>
      )}
    </div>
  )
}
