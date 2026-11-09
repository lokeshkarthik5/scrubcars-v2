import { useT } from '@repo/core/i18n';
import { TIER_KEPT_LINE, TIER_LABELS, TIER_NOTES, tierMedalName, tierStandards, type Tier } from '@repo/core/tiers';
import { IconCircleCheck, IconMapPin } from '@repo/native-ui/icons';
import { ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import { outsideCityTag, type OutsideServiceCity } from '@repo/core/service-city';
import { useId, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * The metals (packages/ui/src/features/tier-medal.tsx). Their dark-theme text is too pale on
 * white, so the words darken in light; the medal itself is the same picture.
 */
const METALS: Record<Tier, { light: string; dark: string; ribbon: string; text: string; lightText: string; chip: string }> = {
  bronze: { light: '#E0A672', dark: '#8A5528', ribbon: '#6B4424', text: '#E3AE7E', lightText: '#7A4A22', chip: 'rgba(224,166,114,0.12)' },
  silver: { light: '#EEF1F4', dark: '#8B939C', ribbon: '#5B636C', text: '#D7DCE1', lightText: '#4A4F56', chip: 'rgba(120,128,138,0.12)' },
  gold: { light: '#F6DB8A', dark: '#B0802A', ribbon: '#7D5A1C', text: '#F0D07A', lightText: '#6F5310', chip: 'rgba(240,208,122,0.14)' },
};

export function TierMedalIcon({ tier, size = 16 }: { tier: Tier; size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const metal = METALS[tier];
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Defs>
        <LinearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={metal.light} />
          <Stop offset="1" stopColor={metal.dark} />
        </LinearGradient>
      </Defs>
      <Path d="M4.2 0.8h2.6l1.6 4.2-2.3 1.1z" fill={metal.ribbon} />
      <Path d="M11.8 0.8H9.2L7.6 5l2.3 1.1z" fill={metal.ribbon} opacity={0.85} />
      <Circle cx="8" cy="10.2" r="5.2" fill={`url(#m${id})`} />
      <Circle cx="8" cy="10.2" r="3.4" fill="none" stroke="#000" strokeOpacity={0.22} strokeWidth={0.9} />
    </Svg>
  );
}

/** On a garage card: the medal alone, right after the name. */
export function TierMark({ tier }: { tier: Tier }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={tierMedalName(tier)}>
      <TierMedalIcon tier={tier} size={16} />
    </View>
  );
}

/** On the garage page: the medal with its words, and "What this means". */
export function TierSeal({ tier }: { tier: Tier }) {
  const t = useT();
  const colors = useColors();
  const { scheme } = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const metal = METALS[tier];
  const name = tierMedalName(tier);
  return (
    <View style={styles.seal}>
      <View style={styles.sealRow}>
        <View style={[styles.sealChip, { backgroundColor: metal.chip }]}>
          <TierMedalIcon tier={tier} size={15} />
          <T size={12} weight={600} lh={16} color={scheme === 'light' ? metal.lightText : metal.text}>
            {name}
          </T>
        </View>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setOpen(true)}>
          <T size={12} weight={500} color={colors.textSecondary} style={styles.underline}>
            {t('What this means')}
          </T>
        </Pressable>
      </View>
      <T size={11} color={colors.textMuted}>
        {t(TIER_NOTES[tier])}
      </T>
      <ScSheet open={open} onClose={() => setOpen(false)} accessibilityLabel={t('{name}: what this means', { name })} horizontalPadding={16}>
        <View style={styles.sheetHead}>
          <TierMedalIcon tier={tier} size={24} />
          <T size={17} weight={600}>
            {name}
          </T>
        </View>
        <T size={13} color={colors.textSecondary} style={styles.sheetLine}>
          {t('Detlio shows this medal on a garage that:')}
        </T>
        {tierStandards(tier).map((group) => (
          <View key={group.tier} style={styles.group}>
            {tier !== 'bronze' ? (
              <View style={styles.groupHead}>
                <TierMedalIcon tier={group.tier} size={12} />
                <T size={11} weight={600} tracking={0.07} uppercase color={colors.textMuted}>
                  {t(TIER_LABELS[group.tier])}
                </T>
              </View>
            ) : null}
            {group.lines.map((line) => (
              <View key={line} style={styles.line}>
                <IconCircleCheck size={15} color={colors.success} />
                <T size={13} lh={18} color={colors.textPrimary} style={styles.lineText}>
                  {line}
                </T>
              </View>
            ))}
          </View>
        ))}
        <T size={12} color={colors.textMuted} style={styles.kept}>
          {TIER_KEPT_LINE}
        </T>
      </ScSheet>
    </View>
  );
}

/** "Outside Chennai": calm, a graphite chip with only the pin in amber. */
export function OutsideCityChip({ outside }: { outside: OutsideServiceCity }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.outside}>
      <IconMapPin size={12} color={colors.warning} />
      <T size={11} weight={500} lh={15} numberOfLines={1} color={colors.textSecondary} style={styles.lineText}>
        {outsideCityTag(outside)}
      </T>
    </View>
  );
}

export function OutsideCityLine({ text }: { text: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.line}>
      <IconMapPin size={14} color={colors.warning} />
      <T size={12} color={colors.textSecondary} style={styles.lineText}>
        <Figures text={text} size={12} color={colors.textSecondary} />
      </T>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  seal: { gap: 2 },
  sealRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
  sealChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  underline: { textDecorationLine: 'underline' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  sheetLine: { marginTop: 6 },
  group: { marginTop: 12, gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  lineText: { flexShrink: 1 },
  kept: { marginTop: 12 },
  outside: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
}));
