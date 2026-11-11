import { bonusStampsLine } from '@repo/core/achievements';
import { useMarkBadgesSeen } from '@repo/core/api/hooks/use-reward-extras';
import type { BadgeToCelebrate } from '@repo/core/api/reward-extras';
import { useT, useTn } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { ScSheet } from '@repo/native-ui/sheet';
import { FigureLine, T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/motion';

import { BadgeMedal } from './badge-medal';

const SHOWN_AT_ONCE = 3;

function PoppingMedal({ badge }: { badge: BadgeToCelebrate }) {
  const still = useReducedMotion();
  const scale = useSharedValue(still ? 1 : 0.5);
  useEffect(() => {
    if (still) return;
    scale.value = withSequence(withTiming(1.12, { duration: 380, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }), withTiming(1, { duration: 200 }));
  }, [still, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={style}>
        <BadgeMedal badgeKey={badge.key} earned size={104} />
      </Animated.View>
    </View>
  );
}

/** BadgeCelebration: a sheet per unseen badge, up to three, then all are marked seen. */
export function BadgeCelebration({ badges, focusId = null }: { badges: BadgeToCelebrate[]; focusId?: string | null }) {
  const tn = useTn();
  const t = useT();
  const colors = useColors();
  const seen = useMarkBadgesSeen();
  const [queue, setQueue] = useState<BadgeToCelebrate[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [waiting, setWaiting] = useState<string[]>([]);

  const ordered = useMemo(() => {
    const fresh = badges.filter((b) => !done.includes(b.id));
    const first = fresh.find((b) => b.id === focusId);
    return first ? [first, ...fresh.filter((b) => b !== first)] : fresh;
  }, [badges, focusId, done]);

  useEffect(() => {
    if (open || ordered.length === 0) return;
    const timer = setTimeout(() => {
      setQueue(ordered.slice(0, SHOWN_AT_ONCE));
      setWaiting(ordered.map((b) => b.id));
      setIndex(0);
      setOpen(true);
    }, 450);
    return () => clearTimeout(timer);
  }, [ordered, open]);

  const badge = queue[index] ?? null;
  const finish = () => {
    if (!open) return;
    setDone((current) => [...current, ...waiting]);
    setOpen(false);
    seen.mutate(waiting);
  };
  const next = () => (index < queue.length - 1 ? setIndex(index + 1) : finish());
  const more = queue.length - index - 1;
  const inCabinet = waiting.length - queue.length;
  const bonus = badge ? bonusStampsLine(badge.bonusStamps) : null;

  return (
    <ScSheet horizontalPadding={16} open={open && badge !== null} onClose={finish} accessibilityLabel={t('Badge earned')}>
      {badge ? (
        <View key={badge.id} style={{ alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 8 }}>
          <PoppingMedal badge={badge} />
          <T size={12} lh={16} uppercase tracking={0.12} color={colors.textSecondary}>
            {t('Badge earned')}
          </T>
          <T size={22} weight={600} lh={28} align="center" accessibilityLiveRegion="polite">
            {badge.label}
          </T>
          <T size={13} lh={18} align="center" color={colors.textSecondary}>
            {badge.howTo}
          </T>
          {more === 0 && inCabinet > 0 ? (
            <T size={12} lh={16} align="center" color={colors.textMuted}>
              {tn(inCabinet, 'And {count} more badge in your cabinet.', 'And {count} more badges in your cabinet.')}
            </T>
          ) : null}
          {bonus ? (
            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 4 }}>
              <FigureLine size={12} text={t('{bonus} added to your Shine Card', { bonus })} />
            </View>
          ) : null}
          <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <ScButton variant="outline" onPress={next}>
              {more > 0 ? t('Next badge ({count} more)', { count: more }) : t('Nice')}
            </ScButton>
          </View>
        </View>
      ) : null}
    </ScSheet>
  );
}
