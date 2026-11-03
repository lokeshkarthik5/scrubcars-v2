import type { CabinetBadge, RewardExtras } from '@repo/core/api/reward-extras'

/** A badge as the Rewards page's short row shows it. */
export type FeaturedBadge =
  | { kind: 'badge'; badge: CabinetBadge }
  | { kind: 'challenge'; id: string; label: string; at: string }

/**
 * The badges worth showing first (0054): the newest earned, challenge
 * badges included, then, if there are fewer than `count`, the locked ones
 * closest to being earned. The full cabinet is one tap away.
 */
export function featuredBadges(extras: Pick<RewardExtras, 'badges' | 'challengeBadges'>, count = 6): FeaturedBadge[] {
  const earned: Array<{ at: string; item: FeaturedBadge }> = [
    ...extras.badges.filter((b) => b.earned).map((b) => ({ at: b.earned!.at, item: { kind: 'badge', badge: b } as FeaturedBadge })),
    ...extras.challengeBadges.map((b) => ({ at: b.at, item: { kind: 'challenge', id: b.id, label: b.label, at: b.at } as FeaturedBadge })),
  ]
  earned.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  const shown = earned.slice(0, count).map((e) => e.item)
  if (shown.length >= count) return shown
  const share = (b: CabinetBadge) => b.progress.current / Math.max(1, b.progress.goal)
  const nearest = extras.badges
    .filter((b) => !b.earned)
    .map((b, i) => ({ b, i }))
    // Closest first; the cabinet's own order breaks ties.
    .sort((x, y) => share(y.b) - share(x.b) || x.i - y.i)
    .slice(0, count - shown.length)
    .map(({ b }) => ({ kind: 'badge', badge: b }) as FeaturedBadge)
  return [...shown, ...nearest]
}
