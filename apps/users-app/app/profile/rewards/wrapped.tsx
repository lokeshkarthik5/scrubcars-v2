import { BADGE_CATALOG } from '@repo/core/achievements';
import { ApiError } from '@repo/core/api/client';
import { useWrapped, useWrappedEvent } from '@repo/core/api/hooks/use-reward-extras';
import { rewardsEnabled, useRewardsConfig, useRewardsSummary } from '@repo/core/api/hooks/use-rewards';
import { WRAPPED_SHARE_LINE, wrappedCards, type WrappedCard, type WrappedStats } from '@repo/core/wrapped';
import { Label, ScButton } from '@repo/native-ui/button';
import { ScSwitch } from '@repo/native-ui/chip';
import { IconChevronLeft, IconChevronRight, IconShare, IconSparkles, IconStarFilled, IconX } from '@repo/native-ui/icons';
import { BrandMark, EmptyState, ErrorState, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, ThemeScope, useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { SharePill } from '@/components/premium-card/premium-card';
import { BadgeMedal } from '@/components/rewards/badge-medal';
import { WrappedVisual } from '@/components/rewards/wrapped-visual';
import { sharePicture } from '@/components/share-host';
import { useAuth } from '@/lib/auth';
import { useReducedMotion } from '@/lib/motion';
import { stopOf } from '@/lib/svg-colour';
import { levelMetal, splitBig, WRAPPED_THEMES } from '@/lib/wrapped-look';

/** apps/users/app/profile/rewards/wrapped/page.tsx: the year as story cards. Dark in both themes, as a story is. */
export default function WrappedScreen() {
  return (
    <ThemeScope scheme="dark">
      <Inner />
    </ThemeScope>
  );
}

function Inner() {
  const colors = useColors();
  const styles = useStyles();
  const params = useLocalSearchParams<{ year?: string }>();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const config = useRewardsConfig();
  const on = rewardsEnabled(config.data);
  const linkedYear = Number(params.year) || null;
  const summary = useRewardsSummary(on && !!user && linkedYear === null);
  const year = linkedYear ?? summary.data?.extras?.wrappedYear ?? null;
  const findingYear = linkedYear === null && on && !!user && summary.isPending;
  const wrapped = useWrapped(year, on && !!user);

  useEffect(() => {
    if (!user) router.replace(`/login?next=${encodeURIComponent(`/profile/rewards/wrapped?year=${year ?? ''}`)}` as Href);
  }, [user, year]);

  const close = (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile/rewards' as Href))} style={styles.close}>
      <IconX size={20} />
    </Pressable>
  );
  const frame = (children: React.ReactNode) => <View style={[styles.frame, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>{children}</View>;

  if (config.isPending || findingYear || (on && year !== null && wrapped.isPending)) {
    return frame(
      <>
        <View style={styles.end}>{close}</View>
        <Skeleton height={520} radius={24} />
      </>
    );
  }
  if (!on || wrapped.isError || !wrapped.data || !year) {
    return frame(
      <>
        <View style={styles.end}>{close}</View>
        {wrapped.isError && !(wrapped.error instanceof ApiError && wrapped.error.code === 'WRAPPED_NOT_AVAILABLE') ? (
          <ErrorState message="Couldn't load your Wrapped. Check your connection." onRetry={() => void wrapped.refetch()} />
        ) : (
          <View style={styles.center}>
            <EmptyState icon={<IconSparkles size={32} stroke={1.5} color={colors.textSecondary} />} title="Your Detlio Wrapped isn't here yet" subtitle="It opens on 1 December, with every wash of your year." />
            <ScButton variant="outline" fullWidth={false} onPress={() => router.replace('/profile/rewards' as Href)}>
              Back to rewards
            </ScButton>
          </View>
        )}
      </>
    );
  }
  return frame(<Story stats={wrapped.data} year={year} close={close} />);
}

function Story({ stats, year, close }: { stats: WrappedStats; year: number; close: React.ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [showName, setShowName] = useState(true);
  const [index, setIndex] = useState(0);
  const [sharing, setSharing] = useState(false);
  const event = useWrappedEvent();
  const opened = useRef(false);
  const cards = useMemo(() => wrappedCards(stats, { showName }), [stats, showName]);
  const card = cards[Math.min(index, cards.length - 1)];
  const count = useRef(cards.length);
  count.current = cards.length;

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    event.mutate({ year, kind: 'opened' });
  }, [event, year]);

  const go = (step: number) => setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + step)));
  const width = Math.max(220, Math.min(screenW - 32, 360, ((screenH - insets.top - insets.bottom - 220) * 9) / 16));

  const step = useRef((by: number) => setIndex((i) => Math.max(0, Math.min(count.current - 1, i + by))));
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (e, g) => {
        if (Math.abs(g.dx) > 40 && Math.abs(g.dx) > Math.abs(g.dy)) step.current(g.dx < 0 ? 1 : -1);
        else step.current(e.nativeEvent.locationX < width / 3 ? -1 : 1);
      },
    })
  ).current;

  const share = async () => {
    setSharing(true);
    const ok = await sharePicture(
      <ThemeScope scheme="dark">
        <View style={{ width: 360, height: 640, overflow: 'hidden' }}>
          <Backdrop cardKey={card.key} />
          <CardView card={card} year={year} stats={stats} width={360} picture />
        </View>
      </ThemeScope>,
      { width: 1080, height: 1920 },
      'Detlio Wrapped'
    );
    if (ok) event.mutate({ year, kind: 'shared' });
    setSharing(false);
  };

  return (
    <>
      <View style={styles.bar}>
        <View style={styles.segments}>
          {cards.map((c, i) => (
            <View key={c.key} style={styles.segment}>
              <View style={[styles.segmentFill, { width: i <= index ? '100%' : '0%' }]} />
            </View>
          ))}
        </View>
        {close}
      </View>
      <View accessibilityLabel={`Detlio Wrapped ${year}, card ${index + 1} of ${cards.length}`} {...responder.panHandlers} pointerEvents="box-only" style={[styles.story, { width, aspectRatio: 9 / 16 }]}>
        <Backdrop cardKey={card.key} />
        <CardView key={`${card.key}-${showName}`} card={card} year={year} stats={stats} width={width} />
      </View>
      <View style={[styles.controls, { maxWidth: 360 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous card" disabled={index === 0} onPress={() => go(-1)} style={[styles.round, index === 0 && styles.dim]}>
          <IconChevronLeft size={20} />
        </Pressable>
        <View style={styles.grow}>
          <ScButton variant="main" height={44} disabled={sharing} onPress={() => void share()}>
            <IconShare size={18} color={colors.white} />
            <Label color={colors.white}>{sharing ? 'Making the image…' : 'Share this card'}</Label>
          </ScButton>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Next card" disabled={index === cards.length - 1} onPress={() => go(1)} style={[styles.round, index === cards.length - 1 && styles.dim]}>
          <IconChevronRight size={20} />
        </Pressable>
      </View>
      {stats.firstName ? (
        <View style={[styles.between, { maxWidth: 360 }]}>
          <T size={12} lh={16} color={colors.textSecondary}>
            Show my first name
          </T>
          <ScSwitch checked={showName} onChange={setShowName} label="Show my first name on the cards" />
        </View>
      ) : null}
      <T size={11} lh={15} align="center" color={colors.textMuted} style={{ maxWidth: 360, marginTop: 8 }}>
        Images are made on your phone. They show your first name (if you leave it on), garage names and your numbers, nothing else.
      </T>
    </>
  );
}

function Backdrop({ cardKey }: { cardKey: WrappedCard['key'] }) {
  const t = WRAPPED_THEMES[cardKey];
  return (
    <>
      <LinearGradient start={{ x: 0.2, y: 0 }} end={{ x: 0.5, y: 0.8 }} colors={[t.from, t.to]} style={StyleSheet.absoluteFill} />
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="wr-glow" cx="80%" cy="18%" rx="90%" ry="55%">
            <Stop offset="0" {...stopOf(t.glow)} />
            <Stop offset="0.7" stopColor={stopOf(t.glow).stopColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#wr-glow)" />
      </Svg>
    </>
  );
}

const badgeKeysFor = (names: string[]) => names.map((name) => ({ name, key: BADGE_CATALOG.find((b) => b.label === name)?.key ?? ('challenge' as const) }));

function CardView({ card, year, stats, width, picture = false }: { card: WrappedCard; year: number; stats: WrappedStats; width: number; picture?: boolean }) {
  const still = useReducedMotion();
  const split = splitBig(card.big);
  const metal = levelMetal(stats.level.key);
  const k = width / 360;
  return (
    <Animated.View entering={still || picture ? undefined : FadeInDown.duration(420)} accessibilityLiveRegion="polite" style={[StyleSheet.absoluteFill, { padding: 24 * k }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BrandMark height={20 * k} />
        <T num size={11 * k} lh={14 * k} weight={600} tracking={0.12} color="rgba(255,255,255,0.75)">{`WRAPPED ${year}`}</T>
      </View>
      <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.5 }} colors={[metal.light, metal.base, metal.dark]} locations={[0, 0.55, 1]} style={{ marginTop: 16 * k, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10 * k, paddingVertical: 4 * k }}>
        <IconStarFilled size={11 * k} color={metal.ink} />
        <T size={10 * k} lh={13 * k} weight={700} uppercase tracking={0.12} color={metal.ink}>{`${stats.level.label} level`}</T>
      </LinearGradient>
      <View style={{ marginTop: 24 * k }}>
        <View style={{ width: 24 * k, height: 3 * k, borderRadius: 2, backgroundColor: '#E4002B', marginBottom: 10 * k }} />
        <T size={14 * k} lh={19 * k} color="rgba(255,255,255,0.75)">
          {card.eyebrow}
        </T>
        {split ? (
          <>
            <T num size={84 * k} lh={84 * k} weight={700} tracking={-0.03} color="#FFFFFF" style={{ marginTop: 4 * k }}>
              {split.figure}
            </T>
            {split.unit ? (
              <T size={24 * k} lh={30 * k} weight={600} color="#FFFFFF">
                {split.unit}
              </T>
            ) : null}
          </>
        ) : (
          <T num size={(card.big.length > 14 ? 34 : 48) * k} lh={(card.big.length > 14 ? 36 : 50) * k} weight={700} tracking={-0.02} color="#FFFFFF" style={{ marginTop: 4 * k }}>
            {card.big}
          </T>
        )}
        <T size={14 * k} lh={19 * k} color="rgba(255,255,255,0.85)" style={{ marginTop: 8 * k }}>
          {card.caption}
        </T>
        {card.key === 'level' && card.extra.length > 0 ? (
          <View accessibilityLabel="Badges earned" style={{ flexDirection: 'row', gap: 12 * k, marginTop: 12 * k }}>
            {badgeKeysFor(card.extra).map((b) => (
              <View key={b.name} style={{ width: 64 * k, alignItems: 'center', gap: 4 }}>
                <BadgeMedal badgeKey={b.key} earned size={40 * k} />
                <T size={10 * k} lh={12 * k} align="center" color="rgba(255,255,255,0.8)">
                  {b.name}
                </T>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <WrappedVisual cardKey={card.key} monthIndex={stats.busiestMonth ? stats.busiestMonth.month - 1 : null} level={stats.level} width={width - 48 * k} />
      </View>
      {picture ? (
        <View style={{ alignItems: 'center' }}>
          <SharePill height={40} font={15} marginTop={8} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E4002B' }} />
          <T size={14 * k} weight={600} lh={19 * k} color="#FFFFFF">
            {WRAPPED_SHARE_LINE}
          </T>
        </View>
      )}
    </Animated.View>
  );
}

const useStyles = createStyles((c) => ({
  frame: { flex: 1, alignItems: 'center', backgroundColor: '#0A0A0B', paddingHorizontal: 16 },
  end: { alignSelf: 'stretch', alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bar: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8 },
  segments: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)' },
  segmentFill: { height: '100%', borderRadius: 2, backgroundColor: '#FFFFFF' },
  story: { marginTop: 12, overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  controls: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  grow: { flex: 1 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
  dim: { opacity: 0.3 },
  between: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 },
}));
