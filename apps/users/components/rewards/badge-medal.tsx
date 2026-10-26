import {
  IconBrush,
  IconCar,
  IconCloudRain,
  IconCompass,
  IconDroplet,
  IconFlame,
  IconHeartHandshake,
  IconHome,
  IconLock,
  IconMessageStar,
  IconMoonStars,
  IconShieldCheck,
  IconSparkles,
  IconSunrise,
  IconTrophy,
  IconTruckDelivery,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'
import type { BadgeKey } from '@repo/core/achievements'
import { cn } from '@repo/core/utils'

/**
 * Each badge's mark: an icon and its colour, never red (red is the screen's
 * one action). The Washes Clubs and Streaks carry their number on the disc.
 */
const MARKS: Record<BadgeKey | 'challenge', { icon: Icon; tint: string; figure?: string }> = {
  first_shine: { icon: IconSparkles, tint: '#DCE1EC' },
  washes_5: { icon: IconDroplet, tint: '#7DB7FF', figure: '5' },
  washes_25: { icon: IconDroplet, tint: '#5EA2F0', figure: '25' },
  washes_50: { icon: IconDroplet, tint: '#93C5FD', figure: '50' },
  washes_100: { icon: IconDroplet, tint: '#E5E7EB', figure: '100' },
  streak_3: { icon: IconFlame, tint: '#F5A524', figure: '3' },
  streak_6: { icon: IconFlame, tint: '#FBBF24', figure: '6' },
  streak_12: { icon: IconFlame, tint: '#FCD34D', figure: '12' },
  monsoon_shine: { icon: IconCloudRain, tint: '#2DD4BF' },
  early_bird: { icon: IconSunrise, tint: '#FBBF24' },
  night_owl: { icon: IconMoonStars, tint: '#A5B4FC' },
  explorer: { icon: IconCompass, tint: '#4ADE80' },
  loyal_regular: { icon: IconHeartHandshake, tint: '#F9A8D4' },
  pickup_pro: { icon: IconTruckDelivery, tint: '#38BDF8' },
  doorstep_devotee: { icon: IconHome, tint: '#C4B5FD' },
  reviewer: { icon: IconMessageStar, tint: '#FDE68A' },
  ambassador: { icon: IconUsers, tint: '#5EEAD4' },
  detailing_devotee: { icon: IconBrush, tint: '#DDD6FE' },
  coating_club: { icon: IconShieldCheck, tint: '#BAE6FD' },
  garage_legend: { icon: IconCar, tint: '#F5D27A' },
  challenge: { icon: IconTrophy, tint: '#FDE68A' },
}

/**
 * A badge as a medal. Earned: in its colour, with a soft rim; locked: grey,
 * dimmed, with a small lock. Decorative: the label beside it carries the
 * meaning, so the medal itself is hidden from screen readers.
 */
export function BadgeMedal({ badgeKey, earned, size = 56, className }: { badgeKey: BadgeKey | 'challenge'; earned: boolean; size?: number; className?: string }) {
  const mark = MARKS[badgeKey]
  const Glyph = mark.icon
  const iconSize = Math.round(size * (mark.figure ? 0.36 : 0.44))
  return (
    <span
      aria-hidden
      className={cn('badge-medal relative grid shrink-0 place-items-center rounded-full', earned ? 'badge-medal--earned' : 'badge-medal--locked', className)}
      style={{ width: size, height: size, ['--badge-tint' as string]: mark.tint }}
    >
      <span className="flex flex-col items-center leading-none">
        <Glyph size={iconSize} stroke={1.6} />
        {mark.figure && (
          <span className="mt-0.5 font-numeric font-semibold" style={{ fontSize: Math.max(9, Math.round(size * 0.2)) }}>
            {mark.figure}
          </span>
        )}
      </span>
      {!earned && (
        <span className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full border border-stroke bg-brand-black text-text-muted">
          <IconLock size={10} stroke={2} />
        </span>
      )}
    </span>
  )
}
