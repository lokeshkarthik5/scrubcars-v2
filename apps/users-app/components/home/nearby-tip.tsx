import type { CarTip, HomeData } from '@repo/core/api/home';
import { istDateKey } from '@repo/core/home-display';
import { formatDistance } from '@repo/core/map';
import { IconBulb, IconChevronRight, IconMapPin, IconX } from '@repo/native-ui/icons';
import { Disc, HubCard, PressRow } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { AreaPicker } from '@/components/area/area-picker';
import { devicePrefs } from '@/lib/device-prefs';

/** The faint line map behind the words. */
function LineMap({ width }: { width: number }) {
  const { scheme } = useTheme();
  const ink = scheme === 'light' ? '10,10,11' : '255,255,255';
  const pin = scheme === 'light' ? '#0B0B0D' : '#F5F5F6';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={108} viewBox={`0 0 358 108`} preserveAspectRatio="none">
        <G stroke={`rgba(${ink},0.10)`} strokeWidth={1} fill="none">
          {[
            'M120 0 L170 108',
            'M200 0 C 215 30, 205 64, 230 108',
            'M262 0 L250 108',
            'M300 0 C 290 42, 320 64, 312 108',
            'M340 0 L358 74',
            'M150 0 L140 108',
            'M100 22 C 180 30, 260 14, 358 26',
            'M110 64 C 200 72, 270 56, 358 68',
            'M130 94 L358 100',
            'M226 26 L284 62',
            'M180 70 L214 26',
          ].map((d) => (
            <Path key={d} d={d} />
          ))}
        </G>
        <Path d="M90 47 C 170 53, 250 37, 358 47" stroke={`rgba(${ink},0.16)`} strokeWidth={1.5} fill="none" />
        <Path d="M236 0 C 244 40, 236 76, 246 108" stroke={`rgba(${ink},0.13)`} strokeWidth={1.5} fill="none" />
        <Circle cx={232} cy={56} r={34} stroke={`rgba(${ink},0.14)`} strokeDasharray="2 4" fill="none" />
        <Circle cx={252} cy={30} r={4.5} fill={pin} />
        <Circle cx={206} cy={80} r={4} fill={pin} opacity={0.75} />
        <Circle cx={282} cy={78} r={4} fill={pin} opacity={0.6} />
        <Circle cx={232} cy={56} r={10} fill="rgba(161,161,170,0.14)" stroke="rgba(161,161,170,0.55)" />
        <Circle cx={232} cy={56} r={4} fill="#A1A1AA" />
      </Svg>
    </View>
  );
}

function Shell({ onPress, label, children, icon }: { onPress: () => void; label: string; children: ReactNode; icon: ReactNode }) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  return (
    <PressRow accessibilityLabel={label} onPress={onPress}>
      <HubCard style={styles.shell}>
        <LineMap width={width - 32} />
        <View style={styles.words}>{children}</View>
        <Disc strong>{icon}</Disc>
      </HubCard>
    </PressRow>
  );
}

/** NearbyCard: how many garages within 50 km, or the area sheet when none's been chosen. */
export function NearbyCard({ nearby, located }: { nearby: HomeData['nearby']; located: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const [asking, setAsking] = useState(false);
  const eyebrow = (
    <T size={13} color={colors.dim}>
      Nearby garages
    </T>
  );

  if (!nearby) {
    if (located) return null;
    return (
      <>
        <Shell label="Pick your area to see the nearest" onPress={() => setAsking(true)} icon={<IconMapPin size={20} stroke={1.5} />}>
          {eyebrow}
          <T size={17} tracking={-0.012} style={styles.big}>
            Pick your area to see the nearest
          </T>
        </Shell>
        <AreaPicker open={asking} onClose={() => setAsking(false)} />
      </>
    );
  }

  if (nearby.count === 0) {
    return (
      <Shell
        label="No garages nearby. See all garages"
        onPress={() => router.navigate('/garages' as Href)}
        icon={<IconChevronRight size={20} stroke={1.5} />}
      >
        {eyebrow}
        <T size={17} tracking={-0.012} style={styles.big}>
          No garages within <T num size={17}>{nearby.radiusKm}</T> km yet
        </T>
        <T size={13} color={colors.dim}>
          See all garages
        </T>
      </Shell>
    );
  }

  return (
    <Shell
      label={`${nearby.count} ${nearby.count === 1 ? 'garage' : 'garages'} nearby`}
      onPress={() => router.navigate('/map' as Href)}
      icon={<IconChevronRight size={20} stroke={1.5} />}
    >
      {eyebrow}
      <T size={22} lh={26} tracking={-0.022} style={styles.big}>
        <T num size={22} lh={26}>{nearby.count}</T> {nearby.count === 1 ? 'garage' : 'garages'}
      </T>
      <T size={13} color={colors.dim}>
        Within <T num size={13} color={colors.dim}>{nearby.radiusKm}</T> km
        {nearby.closestKm !== null ? (
          <>
            {' · nearest '}
            <Figures text={formatDistance(nearby.closestKm)} size={13} color={colors.dim} />
          </>
        ) : null}
      </T>
    </Shell>
  );
}

const SEASON_LABELS: Record<CarTip['season'], string | null> = {
  all_year: null,
  summer: 'Summer',
  pre_monsoon: 'Before the rains',
  monsoon: 'Monsoon',
};

const TIP_HIDDEN_KEY = 'detlio.tipHiddenOn';

/** TipCard: one a day, on an IST day. × hides it until tomorrow, on this phone only. */
export function TipCard({ tip, now }: { tip: CarTip; now: Date }) {
  const colors = useColors();
  const styles = useStyles();
  const [hidden, setHidden] = useState(() => devicePrefs.getItem(TIP_HIDDEN_KEY) === istDateKey(now));
  if (hidden) return null;
  const season = SEASON_LABELS[tip.season];
  return (
    <HubCard accessibilityLabel="Car care tip" style={styles.tip}>
      <View style={styles.tipHead}>
        <View style={styles.tipLabel}>
          <IconBulb size={15} stroke={1.5} color={colors.textMuted} />
          <T size={13} color={colors.dim}>
            Car care tip{season ? ` · ${season}` : ''}
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide tip until tomorrow"
          onPress={() => {
            devicePrefs.setItem(TIP_HIDDEN_KEY, istDateKey(now));
            setHidden(true);
          }}
          style={styles.tipX}
        >
          <IconX size={20} stroke={1.5} color={colors.dim} />
        </Pressable>
      </View>
      <T size={17} weight={500} tracking={-0.012} style={styles.tipTitle}>
        {tip.category}
      </T>
      <T size={15} lh={21} color={colors.textSoft} style={styles.tipText}>
        {tip.text}
      </T>
    </HubCard>
  );
}

const useStyles = createStyles(() => ({
  shell: { height: 108, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden', paddingRight: 14, paddingLeft: 20 },
  words: { flexShrink: 1, minWidth: 0, paddingRight: 8 },
  big: { marginTop: 5, marginBottom: 4 },
  tip: { padding: 20 },
  tipHead: { height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tipLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipX: { width: 44, height: 44, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { marginTop: 12 },
  tipText: { marginTop: 4 },
}));
