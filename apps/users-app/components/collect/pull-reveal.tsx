import type { GaragePull } from '@repo/core/api/garage';
import { cardNumber, RARITY_LOOKS } from '@repo/core/garage';
import { rewardRupees } from '@repo/core/rewards';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconArrowRight, IconCards } from '@repo/native-ui/icons';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Confetti, GOLD_SPARKS } from '@/components/confetti';
import { buzz, useReducedMotion } from '@/lib/motion';
import { stopOf } from '@/lib/svg-colour';

import { GarageCard, GarageCardBack, IllustrationLine } from './garage-card';
import { GarageShare } from './garage-share';

type Stage = 'back' | 'shaking' | 'turning' | 'front';

/** What the pull finished, in words: a row, the series, or a duplicate's stamp progress. */
export function pullNews(pull: GaragePull): string | null {
  if (pull.seriesCompleted) return 'Series complete! Every car is in your Garage, and the Garage Legend badge is yours.';
  if (pull.rowCompleted) {
    const r = pull.rowCompleted;
    return r.voucherAmount !== null ? `Row ${r.row} complete — ${rewardRupees(r.voucherAmount)} off your next booking.` : `Row ${r.row} complete — ${r.stamps === 1 ? 'a bonus stamp' : `${r.stamps} bonus stamps`} on your Shine Card.`;
  }
  if (pull.duplicate) return 'A duplicate. Every 3 duplicates make a bonus Shine Card stamp.';
  return null;
}

/** PullReveal (0057): face down, then a tap turns it over. Reduced motion: it simply appears, face up. */
export function PullReveal({ pull, onRevealed, firstName = null, compact = false }: { pull: GaragePull; onRevealed?: () => void; firstName?: string | null; compact?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const still = useReducedMotion();
  const [stage, setStage] = useState<Stage>(pull.seen ? 'front' : 'back');
  const [burst, setBurst] = useState(0);
  const told = useRef(false);
  const legendary = pull.car.rarity === 'legendary';
  const look = RARITY_LOOKS[pull.car.rarity];
  const turn = useSharedValue(pull.seen ? 1 : 0);
  const shake = useSharedValue(0);
  const glow = useSharedValue(0);

  const reveal = () => {
    if (stage !== 'back') return;
    buzz(legendary ? 'legendary' : 'light');
    if (still) {
      turn.value = 1;
      setStage('front');
      return;
    }
    const flip = (ms: number) => {
      setStage('turning');
      turn.value = withTiming(1, { duration: ms, easing: Easing.bezier(0.3, 0.7, 0.3, 1) });
      glow.value = withSequence(withTiming(1, { duration: ms / 2 }), withTiming(0.5, { duration: ms / 2 }));
      setTimeout(() => setStage('front'), ms);
    };
    if (legendary) {
      setStage('shaking');
      shake.value = withRepeat(withSequence(withTiming(-4, { duration: 40 }), withTiming(4, { duration: 40 })), 6, true);
      setTimeout(() => flip(1300), 520);
    } else {
      flip(900);
    }
  };

  useEffect(() => {
    if (stage !== 'front' || told.current) return;
    told.current = true;
    onRevealed?.();
    if (!still && legendary) setBurst(1);
  }, [stage, onRevealed, still, legendary]);

  const backStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { translateX: shake.value }, { rotateY: `${turn.value * 180}deg` }], opacity: turn.value < 0.5 ? 1 : 0 }));
  const frontStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 900 }, { rotateY: `${turn.value * 180 - 180}deg` }], opacity: turn.value >= 0.5 ? 1 : 0 }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.9 + glow.value * 0.35 }] }));
  const news = pullNews(pull);

  return (
    <View style={[styles.column, { paddingVertical: compact ? 4 : 8 }]}>
      <View style={{ width: compact ? 240 : 272 }}>
        <Animated.View pointerEvents="none" style={[styles.burst, glowStyle]}>
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="reveal-burst" cx="50%" cy="50%" r="50%">
                <Stop offset="0.35" {...stopOf(look.glow)} />
                <Stop offset="1" stopColor={stopOf(look.glow).stopColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#reveal-burst)" />
          </Svg>
        </Animated.View>
        <Pressable accessibilityRole="button" accessibilityLabel={stage === 'back' ? 'Reveal your new card' : undefined} disabled={stage !== 'back'} onPress={reveal}>
          <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
            <GarageCard car={pull.car} shine={stage === 'front'} />
          </Animated.View>
          <Animated.View style={backStyle}>
            <GarageCardBack />
          </Animated.View>
        </Pressable>
        <Confetti run={burst} colours={GOLD_SPARKS} />
      </View>

      <View accessibilityLiveRegion="polite" style={styles.words}>
        {stage === 'front' ? (
          <>
            <T size={12} lh={16} uppercase tracking={0.14} color={colors.scheme === 'light' ? colors.textSecondary : look.pill}>
              {`${pull.car.rarityLabel} · ${cardNumber(pull.car.number, pull.car.total)}`}
            </T>
            <T size={22} weight={600} lh={28} align="center">
              {pull.car.name}
            </T>
            <IllustrationLine />
            {news ? (
              <View style={[styles.news, (pull.rowCompleted || pull.seriesCompleted) && styles.newsGold]}>
                <FigureLine size={13} lh={18} color={pull.rowCompleted || pull.seriesCompleted ? colors.textPrimary : colors.textSecondary} text={news} />
              </View>
            ) : null}
            <View style={styles.actions}>
              <ScButton variant="outline" onPress={() => router.push('/profile/rewards/garage' as Href)}>
                <IconCards size={18} color={colors.textPrimary} />
                <Label>See your Garage</Label>
                <IconArrowRight size={16} color={colors.textPrimary} />
              </ScButton>
              <GarageShare car={pull.car} firstName={firstName} />
            </View>
          </>
        ) : (
          <>
            <T size={13} lh={18} align="center" color={colors.textSecondary}>
              {pull.sourceLabel === 'Booking completed' ? 'Your booking earned a card for your Garage.' : `${pull.sourceLabel}: a card for your Garage.`}
            </T>
            <ScButton variant="outline" fullWidth={false} disabled={stage !== 'back'} onPress={reveal}>
              {stage === 'back' ? 'Reveal' : 'Revealing…'}
            </ScButton>
          </>
        )}
      </View>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  column: { alignItems: 'center', gap: 16 },
  burst: { position: 'absolute', left: -60, right: -60, top: -60, bottom: -60, opacity: 0 },
  words: { alignSelf: 'stretch', alignItems: 'center', gap: 8 },
  news: { borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 8 },
  newsGold: { borderColor: 'rgba(247,208,107,0.4)', backgroundColor: 'rgba(247,208,107,0.1)' },
  actions: { alignSelf: 'stretch', gap: 8, marginTop: 4 },
}));
