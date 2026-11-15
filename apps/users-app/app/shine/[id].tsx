import { shineOn, useShineConfig, useShineScan, useShineSuggestions } from '@repo/core/api/hooks/use-shine-score';
import type { ShineSuggestion } from '@repo/core/api/shine-score';
import { formatClock, formatDay } from '@repo/core/format';
import { useT } from '@repo/core/i18n';
import { formatRupees } from '@repo/core/job-records';
import { SHINE_AREA_LABELS, SHINE_AREAS, SHINE_FOOTNOTE } from '@repo/core/shine-score';
import { formatDuration } from '@repo/core/utils';
import { ScButton, Label } from '@repo/native-ui/button';
import { IconClock, IconShare, IconStarFilled } from '@repo/native-ui/icons';
import { HubCard, LoadError, ScCard, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NextFreeRow } from '@/components/garage/next-free-row';
import { WashGauge } from '@/components/moments/wash-gauge';
import { PageHeader } from '@/components/page-header';
import { shareShineScore } from '@/components/shine/shine-share';
import { coarse, isCitywide, useLocationStore } from '@/lib/location';

function SuggestionCard({ suggestion: s }: { suggestion: ShineSuggestion }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const price = formatRupees(Number(s.service.fromPrice));
  return (
    <HubCard radius={22} style={styles.suggestion}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${s.service.name}, ${s.vendorName}`}
        onPress={() => router.push(`/book/${s.vendorId}?service=${s.service.id}` as Href)}
        style={styles.suggestionHead}
      >
        <View style={styles.grow}>
          <T size={15} weight={600} numberOfLines={1}>
            {s.service.name}
          </T>
          <View style={styles.meta}>
            <T size={12} color={colors.textSecondary} numberOfLines={1} style={styles.shrink}>
              {s.vendorName}
            </T>
            {s.rating !== null ? (
              <>
                <T size={12} color={colors.textSecondary}>
                  ·
                </T>
                <IconStarFilled size={11} color="#F5B83D" />
                <T num size={12} color={colors.textSecondary}>
                  {s.rating.toFixed(1)}
                </T>
              </>
            ) : null}
            {s.distanceKm !== null ? (
              <T size={12} color={colors.textSecondary}>
                {`· ${t('{km} km', { km: s.distanceKm })}`}
              </T>
            ) : null}
          </View>
        </View>
        <View style={styles.priceCol}>
          <T num size={18} weight={600}>
            {s.service.perVehicle ? t('From {price}', { price }) : price}
          </T>
          {s.service.durationMins !== null ? (
            <View style={styles.meta}>
              <IconClock size={11} color={colors.textSecondary} />
              <T num size={12} color={colors.textSecondary}>
                {formatDuration(s.service.durationMins)}
              </T>
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.divider} />
      <NextFreeRow vendor={{ id: s.vendorId, name: s.vendorName }} mode="dropin" visible serviceIds={[s.service.id]} />
    </HubCard>
  );
}

/** The result (0075; the web's app/shine/[id]/page.tsx). */
export default function ShineResultScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId ?? '');
  const config = useShineConfig();
  const on = shineOn(config.data);
  const scan = useShineScan(id, on);
  const location = useLocationStore((s) => s.location);
  // Rounded before it leaves the phone, as Home's Nearby does; never stored.
  const origin = location && !isCitywide(location) ? coarse(location) : null;
  const suggestions = useShineSuggestions(scan.data?.need, origin);
  const s = scan.data;
  const share = () => {
    if (s) void shareShineScore({ score: s.overall });
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <View style={styles.grow}>
          <PageHeader title={t('Your Shine Score')} backTo="/home" />
        </View>
        {s ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Share')} onPress={share} style={styles.headerShare}>
            <IconShare size={20} stroke={1.5} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {scan.isLoading || config.isLoading ? (
          <View style={styles.column}>
            <Skeleton height={210} radius={22} />
            <Skeleton height={220} radius={22} />
          </View>
        ) : !s ? (
          <LoadError what={t('your score')} onRetry={() => void scan.refetch()} />
        ) : (
          <View style={styles.column}>
            <ScCard style={styles.card}>
              <T size={12} color={colors.textSecondary}>{`${t(formatDay(s.scoredAt))}, ${formatClock(s.scoredAt)}`}</T>
              <View style={styles.scoreRow}>
                <View style={styles.gauge}>
                  <WashGauge daysSinceWash={s.overall} intervalDays={100} over={false} reversed />
                </View>
                <View style={styles.scoreFigure} accessible accessibilityLabel={t('Score {score} out of 100', { score: s.overall })}>
                  <T num size={56} weight={500} lh={56} tracking={-0.045}>
                    {s.overall}
                  </T>
                  <T size={13} color={colors.dim}>
                    / 100
                  </T>
                </View>
              </View>
              <T size={15} lh={21} color={colors.textSecondary}>
                <T size={15} lh={21} weight={500}>
                  {t(s.summary)}
                </T>{' '}
                {t(s.suggestion)}
              </T>
            </ScCard>

            <ScCard style={styles.areas} accessibilityLabel={t('Score by area')}>
              {SHINE_AREAS.map((area, i) => {
                const value = s.scores[area];
                return (
                  <View key={area} style={[styles.areaRow, i > 0 && styles.areaBorder]}>
                    <T size={15} style={styles.grow}>
                      {t(SHINE_AREA_LABELS[area])}
                    </T>
                    <View style={styles.bar}>
                      <View style={[styles.barFill, { width: `${value}%`, backgroundColor: colors.textPrimary }]} />
                    </View>
                    <T num size={15} weight={600} style={styles.areaFigure}>
                      {value}
                    </T>
                  </View>
                );
              })}
            </ScCard>

            {s.findings.length > 0 ? (
              <ScCard style={styles.card}>
                <T size={15} weight={600} accessibilityRole="header">
                  {t('What we noticed')}
                </T>
                {s.findings.map((finding) => (
                  <View key={finding.text} style={styles.finding}>
                    <View style={styles.dot} />
                    <View>
                      <T size={15}>{finding.text}</T>
                      <T size={12} color={colors.textMuted}>
                        {t(SHINE_AREA_LABELS[finding.area])}
                      </T>
                    </View>
                  </View>
                ))}
              </ScCard>
            ) : null}

            {suggestions.data && suggestions.data.suggestions.length > 0 ? (
              <View style={styles.column}>
                <View>
                  <T size={18} weight={500} accessibilityRole="header">
                    {t('Suggested for you')}
                  </T>
                  <T size={12} color={colors.textSecondary}>
                    {t("Picked for what we noticed. Prices are the garages' own.")}
                  </T>
                </View>
                {suggestions.data.suggestions.map((suggestion) => (
                  <SuggestionCard key={suggestion.vendorId} suggestion={suggestion} />
                ))}
              </View>
            ) : null}

            <ScButton variant="outline" height={48} onPress={share}>
              <IconShare size={17} stroke={1.5} color={colors.textPrimary} />
              <Label>{t('Share my score')}</Label>
            </ScButton>
            <T size={12} lh={16} color={colors.textMuted} style={styles.centerText}>
              {t(SHINE_FOOTNOTE)}
            </T>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerShare: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  column: { gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  centerText: { textAlign: 'center', paddingHorizontal: 16 },
  card: { gap: 12, paddingHorizontal: 20 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  gauge: { transform: [{ scale: 1.25 }], marginLeft: 12, marginBottom: 6, marginRight: 12 },
  scoreFigure: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  areas: { paddingVertical: 4, paddingHorizontal: 20 },
  areaRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12 },
  areaBorder: { borderTopWidth: 1, borderTopColor: c.line },
  bar: { width: 56, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' },
  barFill: { height: '100%', borderRadius: 2 },
  areaFigure: { width: 32, textAlign: 'right' },
  finding: { flexDirection: 'row', gap: 10 },
  dot: { marginTop: 8, height: 6, width: 6, borderRadius: 3, backgroundColor: c.textPrimary },
  suggestion: { overflow: 'hidden' },
  suggestionHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  divider: { height: 1, backgroundColor: c.line },
}));
