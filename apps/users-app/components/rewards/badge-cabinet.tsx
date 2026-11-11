import { badgeProgressLine, bonusStampsLine } from '@repo/core/achievements';
import type { CabinetBadge, RewardExtras } from '@repo/core/api/reward-extras';
import { useT } from '@repo/core/i18n';
import { rewardDate } from '@repo/core/rewards';
import { IconChevronLeft, IconChevronRight } from '@repo/native-ui/icons';
import { ScSheet } from '@repo/native-ui/sheet';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { featuredBadges } from '@/lib/featured-badges';

import { BadgeMedal } from './badge-medal';

type Selected = { kind: 'badge'; badge: CabinetBadge } | { kind: 'challenge'; label: string; at: string };
type SheetView = { kind: 'all' } | { kind: 'one'; selected: Selected; fromAll: boolean };

function BadgeButton({ label, badgeKey, earned, progress, onOpen, size, compact = false }: { label: string; badgeKey: CabinetBadge['key'] | 'challenge'; earned: boolean; progress?: CabinetBadge['progress']; onOpen: () => void; size: number; compact?: boolean }) {
  const t = useT();
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={earned ? t('{label}: earned', { label: t(label) }) : t('{label}: locked, {progress}', { label: t(label), progress: progress ? badgeProgressLine(progress) : '' })} onPress={onOpen} style={{ width: '100%', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
      <BadgeMedal badgeKey={badgeKey} earned={earned} size={size} />
      <T size={compact ? 10 : 11} lh={compact ? 12 : 14} numberOfLines={2} align="center" color={earned ? colors.textPrimary : colors.textMuted}>
        {t(label)}
      </T>
    </Pressable>
  );
}

/** BadgeCabinet (apps/users/components/rewards/badge-cabinet.tsx). */
export function BadgeCabinet({ extras }: { extras: RewardExtras }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [view, setView] = useState<SheetView | null>(null);
  const total = extras.badges.length + extras.challengeBadges.length;
  const featured = useMemo(() => featuredBadges(extras, 6), [extras]);
  const open = (selected: Selected, fromAll: boolean) => setView({ kind: 'one', selected, fromAll });
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <T size={14} weight={600} lh={20}>
          {`${t('Badges')} `}
          <T num size={12} lh={20} color={colors.textSecondary}>{`· ${t('{count} of {total}', { count: extras.earnedCount, total })}`}</T>
        </T>
        <Pressable accessibilityRole="button" onPress={() => setView({ kind: 'all' })} style={styles.more}>
          <FigureLine size={12} weight={500} text={t('See all {total}', { total })} />
          <IconChevronRight size={14} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {featured.map((item) => (
          <View key={item.kind === 'badge' ? item.badge.key : item.id} style={styles.six}>
            {item.kind === 'badge' ? (
              <BadgeButton label={item.badge.label} badgeKey={item.badge.key} earned={!!item.badge.earned} progress={item.badge.progress} onOpen={() => open({ kind: 'badge', badge: item.badge }, false)} size={44} compact />
            ) : (
              <BadgeButton label={item.label} badgeKey="challenge" earned onOpen={() => open({ kind: 'challenge', label: item.label, at: item.at }, false)} size={44} compact />
            )}
          </View>
        ))}
      </View>

      <ScSheet horizontalPadding={16} open={view !== null} onClose={() => setView(null)} accessibilityLabel={view?.kind === 'all' ? t('All badges') : t('Badge')}>
        {view?.kind === 'all' ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.all}>
            <View style={styles.head}>
              <T size={17} weight={600} lh={24}>
                {t('All badges')}
              </T>
              <T num size={12} lh={16} color={colors.textSecondary}>{t('{count} of {total} earned', { count: extras.earnedCount, total })}</T>
            </View>
            <View style={styles.grid}>
              {extras.badges.map((badge) => (
                <View key={badge.key} style={styles.four}>
                  <BadgeButton label={badge.label} badgeKey={badge.key} earned={!!badge.earned} progress={badge.progress} onOpen={() => open({ kind: 'badge', badge }, true)} size={52} />
                </View>
              ))}
              {extras.challengeBadges.map((badge) => (
                <View key={badge.id} style={styles.four}>
                  <BadgeButton label={badge.label} badgeKey="challenge" earned onOpen={() => open({ kind: 'challenge', label: badge.label, at: badge.at }, true)} size={52} />
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}
        {view?.kind === 'one' ? (
          <View style={styles.one}>
            {view.fromAll ? (
              <Pressable accessibilityRole="button" onPress={() => setView({ kind: 'all' })} style={styles.backRow}>
                <IconChevronLeft size={14} color={colors.textSecondary} />
                <T size={12} weight={500} color={colors.textSecondary}>
                  {t('All badges')}
                </T>
              </Pressable>
            ) : null}
            {view.selected.kind === 'badge' ? (
              <BadgeDetail badge={view.selected.badge} />
            ) : (
              <>
                <BadgeMedal badgeKey="challenge" earned size={88} />
                <T size={18} weight={600} lh={24} align="center">
                  {view.selected.label}
                </T>
                <T size={13} lh={18} align="center" color={colors.textSecondary}>
                  {t('Won in a Detlio challenge.')}
                </T>
                <FigureLine size={12} color={colors.textMuted} text={t('Earned {day}', { day: rewardDate(view.selected.at) })} />
              </>
            )}
          </View>
        ) : null}
      </ScSheet>
    </View>
  );
}

function BadgeDetail({ badge }: { badge: CabinetBadge }) {
  const t = useT();
  const colors = useColors();
  const bonus = bonusStampsLine(badge.bonusStamps);
  return (
    <>
      <BadgeMedal badgeKey={badge.key} earned={!!badge.earned} size={88} />
      <T size={18} weight={600} lh={24} align="center">
        {badge.label}
      </T>
      <T size={13} lh={18} align="center" color={colors.textSecondary}>
        {badge.howTo}
      </T>
      {badge.earned ? (
        <FigureLine size={12} color={colors.textMuted} text={t('Earned {day}', { day: rewardDate(badge.earned.at) })} />
      ) : (
        <View style={{ width: 240, gap: 6 }}>
          <View style={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.fillSoft }}>
            <View style={{ height: '100%', borderRadius: 2, backgroundColor: colors.meterOn, width: `${Math.max(4, Math.round((badge.progress.current / badge.progress.goal) * 100))}%` }} />
          </View>
          <T num size={12} lh={16} align="center" color={colors.textSecondary}>
            {badgeProgressLine(badge.progress)}
          </T>
        </View>
      )}
      {bonus ? <FigureLine size={12} color={colors.textSecondary} text={badge.earned ? t('{bonus} on your Shine Card.', { bonus }) : t('{bonus} on your Shine Card when you earn it.', { bonus })} /> : null}
    </>
  );
}

const useStyles = createStyles((c) => ({
  section: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  more: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 6, paddingVertical: 12 },
  six: { width: '16.66%', paddingHorizontal: 2 },
  scroll: { maxHeight: 560 },
  all: { gap: 12, paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  four: { width: '25%', paddingHorizontal: 2 },
  one: { alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 8 },
  backRow: { minHeight: 36, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2 },
}));
