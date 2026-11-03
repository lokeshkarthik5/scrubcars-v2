import { coverMetaParts, coverToneFor, garageInitials, type CoverTone } from '@repo/core/garage-cover';
import type { Vendor } from '@repo/core/types';
import { T } from '@repo/native-ui/text';
import { useTheme } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

/**
 * GarageCover (packages/ui/src/features/garage-cover.tsx): a garage with no photos gets a
 * designed cover, its initials large in outline on one of five colours picked from its id.
 * In the light theme the cover pales (the owner's frame G); the monogram tile stays dark.
 */
const GLOW: Record<'dark' | 'light', Record<CoverTone, { from: string; to: string; glow: string; opacity: number }>> = {
  dark: {
    red: { from: '#1D1012', to: '#0E0A0B', glow: '#E11D2E', opacity: 0.42 },
    blue: { from: '#0F1520', to: '#0A0C10', glow: '#3B82F6', opacity: 0.38 },
    green: { from: '#0E1714', to: '#0A0D0C', glow: '#10B981', opacity: 0.32 },
    bronze: { from: '#19140D', to: '#0D0B09', glow: '#D9973E', opacity: 0.36 },
    plum: { from: '#16101A', to: '#0C0A0E', glow: '#A855F7', opacity: 0.32 },
  },
  light: {
    red: { from: '#FBEFF0', to: '#F4E4E6', glow: '#E11D2E', opacity: 0.18 },
    blue: { from: '#EEF3FB', to: '#E3EBF6', glow: '#3B82F6', opacity: 0.2 },
    green: { from: '#ECF6F2', to: '#E0EFE9', glow: '#10B981', opacity: 0.18 },
    bronze: { from: '#F8F2E8', to: '#F0E7D8', glow: '#D9973E', opacity: 0.2 },
    plum: { from: '#F4EEF8', to: '#EAE2F1', glow: '#A855F7', opacity: 0.18 },
  },
};

const MONOGRAM: Record<CoverTone, [string, string]> = {
  red: ['#5A1A20', '#2A0E11'],
  blue: ['#1D3456', '#0F1A2C'],
  green: ['#174434', '#0C2119'],
  bronze: ['#5A4120', '#2A1F10'],
  plum: ['#3A2A48', '#181220'],
};

const MONO_SIZE = { compact: 96, card: 124, hero: 176 };

type CoverVendor = Pick<
  Vendor,
  'id' | 'name' | 'area' | 'lat' | 'lng' | 'outsideServiceCity' | 'dropinEnabled' | 'doorstepEnabled'
> &
  Partial<Pick<Vendor, 'pickupEnabled'>>;

export function GarageCover({
  vendor,
  size = 'card',
  showMeta = true,
  metaTop = 12,
}: {
  vendor: CoverVendor;
  size?: keyof typeof MONO_SIZE;
  showMeta?: boolean;
  metaTop?: number;
}) {
  const { scheme } = useTheme();
  const tone = coverToneFor(vendor.id);
  const look = GLOW[scheme][tone];
  const initials = garageInitials(vendor.name);
  const meta = showMeta ? coverMetaParts(vendor) : [];
  const ink = scheme === 'light' ? '10,10,11' : '255,255,255';
  const font = MONO_SIZE[size];
  const id = `${tone}-${scheme}`;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[look.from, look.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`g-${id}`} cx="85%" cy="110%" rx="90%" ry="120%">
            <Stop offset="0" stopColor={look.glow} stopOpacity={look.opacity} />
            <Stop offset="0.6" stopColor={look.glow} stopOpacity={0} />
          </RadialGradient>
          <Pattern id={`l-${id}`} width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(25)">
            <Line x1={0} y1={0} x2={0} y2={9} stroke={`rgb(${ink})`} strokeOpacity={scheme === 'light' ? 0.05 : 0.035} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#g-${id})`} />
        <Rect width="100%" height="100%" fill={`url(#l-${id})`} />
        {initials ? (
          <SvgText
            x="100%"
            y="100%"
            dx={-6}
            dy={font * 0.1}
            textAnchor="end"
            fontFamily="SpaceGrotesk_700Bold"
            fontSize={font}
            letterSpacing={-font * 0.06}
            fill="none"
            stroke={`rgb(${ink})`}
            strokeOpacity={0.16}
            strokeWidth={1.2}
          >
            {initials}
          </SvgText>
        ) : null}
      </Svg>
      {meta.length > 0 ? (
        <View style={[styles.meta, { top: metaTop }]}>
          {meta.map((part, i) => (
            <View key={`${i}-${part}`} style={styles.metaPart}>
              {i > 0 ? (
                <View style={[styles.metaDot, { backgroundColor: scheme === 'light' ? 'rgba(10,10,11,0.45)' : 'rgba(255,255,255,0.45)' }]} />
              ) : null}
              <T
                size={10.5}
                lh={14}
                tracking={0.08}
                uppercase
                numberOfLines={1}
                color={scheme === 'light' ? 'rgba(10,10,11,0.6)' : 'rgba(255,255,255,0.6)'}
              >
                {part}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The monogram tile where a logo would be. Dark with white letters in both themes. */
export function GarageMonogram({
  vendor,
  size,
  radius,
  fontSize,
  style,
}: {
  vendor: Pick<Vendor, 'id' | 'name'>;
  size: number;
  radius: number;
  fontSize: number;
  style?: ViewStyle;
}) {
  const [from, to] = MONOGRAM[coverToneFor(vendor.id)];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }, styles.monogramEdge, style]}
    >
      <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.monogram}>
        <T num size={fontSize} weight={700} lh={fontSize + 4} tracking={-0.02} color="#FFFFFF">
          {garageInitials(vendor.name)}
        </T>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { position: 'absolute', left: 12, right: 72, flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' },
  metaPart: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  metaDot: { width: 4, height: 4, borderRadius: 2 },
  monogramEdge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  monogram: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
