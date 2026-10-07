import { cn } from '@repo/core/utils'

type StatTone = 'default' | 'success' | 'warning'

const tones: Record<StatTone, string> = {
  default: 'text-text-primary',
  success: 'text-success',
  // Amber, as every caution is: a number someone should act on.
  warning: 'text-warning',
}

interface StatTileProps {
  label: string
  /** The figure. Set in the brand's numeric face; a node for stars or a dash. */
  value: React.ReactNode
  /** One line under the figure: a rate, a breakdown, where it came from. */
  hint?: React.ReactNode
  tone?: StatTone
  /**
   * 'card' stands on its own in a grid of tiles, on the card surface.
   * 'plain' sits inside a card that already draws the edge.
   */
  variant?: 'card' | 'plain'
  className?: string
}

/**
 * One number and what it counts — today's jobs, earnings this week, the
 * pilot's checkouts. The garage's home, its earnings and the admin's pilot
 * card each had their own version, at three sizes and with the figure in
 * Inter in two of them; this is the one look, with the figure in Space
 * Grotesk as the brand keeps figures.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  variant = 'card',
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        'min-w-0',
        variant === 'card' && 'rounded-[14px] border border-border bg-surface px-3.5 py-3',
        className
      )}
    >
      <p className="text-[11px] font-medium text-text-secondary">{label}</p>
      <div
        className={cn(
          'mt-0.5 font-numeric text-[22px] font-bold leading-7 tracking-tight',
          tones[tone]
        )}
      >
        {value}
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-text-secondary">{hint}</p>}
    </div>
  )
}
