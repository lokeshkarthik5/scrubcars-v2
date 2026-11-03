import type { WrappedCardKey } from '@repo/core/wrapped';

/** Each card's colours and each level's metal (apps/users/lib/wrapped-image.ts). Never red. */
export const WRAPPED_THEMES: Record<WrappedCardKey, { from: string; to: string; glow: string }> = {
  washes: { from: '#1B2233', to: '#0A0A0B', glow: 'rgba(125, 183, 255, 0.35)' },
  saved: { from: '#13261F', to: '#0A0A0B', glow: 'rgba(74, 222, 128, 0.30)' },
  garage: { from: '#2A1F14', to: '#0A0A0B', glow: 'rgba(251, 191, 36, 0.30)' },
  month: { from: '#1E1830', to: '#0A0A0B', glow: 'rgba(165, 180, 252, 0.34)' },
  level: { from: '#22232A', to: '#0A0A0B', glow: 'rgba(220, 225, 236, 0.32)' },
  shine: { from: '#102628', to: '#0A0A0B', glow: 'rgba(45, 212, 191, 0.32)' },
  closing: { from: '#1C1C22', to: '#0A0A0B', glow: 'rgba(236, 240, 250, 0.26)' },
};

export function levelMetal(level: string): { base: string; light: string; dark: string; glow: string; ink: string } {
  switch (level) {
    case 'gold':
      return { base: '#E3B652', light: '#FBE7A6', dark: '#8F641F', glow: 'rgba(227, 182, 82, 0.45)', ink: '#3A2606' };
    case 'platinum':
      return { base: '#C4D2E2', light: '#F4F8FC', dark: '#7D8CA0', glow: 'rgba(196, 215, 235, 0.45)', ink: '#1C2633' };
    case 'diamond':
      return { base: '#9CCBF5', light: '#EAF6FF', dark: '#4E7FAE', glow: 'rgba(165, 210, 255, 0.5)', ink: '#0E2236' };
    case 'icon':
      return { base: '#E9D29A', light: '#FFF6DC', dark: '#9A7B3A', glow: 'rgba(240, 220, 170, 0.5)', ink: '#33260A' };
    default:
      return { base: '#C9CDD6', light: '#F4F5F8', dark: '#7D828E', glow: 'rgba(220, 225, 236, 0.4)', ink: '#16171C' };
  }
}

/** A leading figure drawn huge with its unit under it; anything else stays whole. */
export function splitBig(big: string): { figure: string; unit: string } | null {
  const match = /^(₹?\d[\d,]*)(?:\s+(.+))?$/.exec(big.trim());
  return match ? { figure: match[1], unit: match[2] ?? '' } : null;
}
