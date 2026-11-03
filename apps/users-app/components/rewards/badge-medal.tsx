import type { BadgeKey } from '@repo/core/achievements';
import { IconBrush, IconCar, IconCloudRain, IconCompass, IconDroplet, IconFlame, IconHeartHandshake, IconHome, IconLock, IconMessageStar, IconMoonStars, IconShieldCheck, IconSparkles, IconSunrise, IconTrophy, IconTruckDelivery, IconUsers } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { useColors, useTheme } from '@repo/native-ui/theme';
import { View } from 'react-native';

type Glyph = typeof IconCar;

/** Each badge's mark: an icon and its colour, never red. Clubs and streaks carry their number. */
const MARKS: Record<BadgeKey | 'challenge', { icon: Glyph; tint: string; figure?: string }> = {
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
};

/** BadgeMedal. Earned: in its colour with a soft rim, always on a dark disc. Locked: grey with a small lock. */
export function BadgeMedal({ badgeKey, earned, size = 56 }: { badgeKey: BadgeKey | 'challenge'; earned: boolean; size?: number }) {
  const colors = useColors();
  const { scheme } = useTheme();
  const mark = MARKS[badgeKey];
  const Glyph = mark.icon;
  const iconSize = Math.round(size * (mark.figure ? 0.36 : 0.44));
  const tone = earned ? mark.tint : colors.textMuted;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: earned ? '#1B1C21' : colors.fillSoft,
        borderWidth: 1.5,
        borderColor: earned ? `${mark.tint}66` : scheme === 'light' ? colors.stroke : '#2A2A2E',
        opacity: earned ? 1 : 0.75,
      }}
    >
      <Glyph size={iconSize} stroke={1.6} color={tone} />
      {mark.figure ? (
        <T num size={Math.max(9, Math.round(size * 0.2))} lh={Math.max(11, Math.round(size * 0.22))} weight={600} color={tone}>
          {mark.figure}
        </T>
      ) : null}
      {!earned ? (
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.canvas }}>
          <IconLock size={10} stroke={2} color={colors.textMuted} />
        </View>
      ) : null}
    </View>
  );
}
