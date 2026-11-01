import { useScratchCard } from '@repo/core/api/hooks/use-rewards';
import type { ScratchCardView, ScratchResult } from '@repo/core/api/rewards';
import { rewardDay, rewardRupees } from '@repo/core/rewards';
import { livePendingCheckout } from '@repo/core/stores/pending-checkout-store';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconArrowUpRight, IconCircleCheckFilled } from '@repo/native-ui/icons';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinear, Mask, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { GarageCard, GarageCardBack, IllustrationLine } from '@/components/collect/garage-card';
import { Confetti, JACKPOT_CONFETTI_COLORS } from '@/components/confetti';
import { PremiumCard } from '@/components/premium-card/premium-card';
import { ShareCardImage } from '@/components/premium-card/share-card-image';
import { useAuth } from '@/lib/auth';
import { buzz, useReducedMotion } from '@/lib/motion';
import { usePendingCheckout } from '@/lib/pending-checkout';
import { prizeCardSpec } from '@/lib/premium-card';
import { isMoneyPrize, prizeTier, voucherEndsAt } from '@/lib/scratch-prize';
import { BRUSH, cellsUnder, clearedShare, CLEAR_AT, strokeBetween } from '@/lib/scratch-foil';

const STARS: Array<[number, number, number]> = [[0.1, 0.25, 7], [0.22, 0.72, 5], [0.84, 0.22, 6], [0.92, 0.68, 8], [0.7, 0.82, 4], [0.32, 0.18, 4]];

function starPath(cx: number, cy: number, r: number) {
  let d = '';
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    d += `${i === 0 ? 'M' : 'L'}${cx + Math.cos(a) * rad} ${cy + Math.sin(a) * rad}`;
  }
  return `${d}Z`;
}

/** The foil: silver with a fine grain, a few stars and the hint; scratched strokes are cut out of it. */
function Foil({ width, height, strokes }: { width: number; height: number; strokes: Array<{ x: number; y: number }> }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinear id="foil" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B9BDC7" />
          <Stop offset="0.45" stopColor="#E4E6EC" />
          <Stop offset="0.55" stopColor="#CDD0D8" />
          <Stop offset="1" stopColor="#9EA3AE" />
        </SvgLinear>
        <Mask id="left" x="0" y="0" width={width} height={height} maskUnits="userSpaceOnUse">
          <Rect x={0} y={0} width={width} height={height} fill="#FFFFFF" />
          {strokes.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={BRUSH} fill="#000000" />
          ))}
        </Mask>
      </Defs>
      <G mask="url(#left)">
        <Rect x={0} y={0} width={width} height={height} fill="url(#foil)" />
        {STARS.map(([fx, fy, r]) => (
          <Path key={`${fx}-${fy}`} d={starPath(fx * width, fy * height, r)} fill="rgba(255,255,255,0.5)" />
        ))}
        <SvgText x={width / 2} y={height / 2 - 4} fontSize={15} fontWeight="600" fill="#2A2B31" textAnchor="middle">
          Scratch here
        </SvgText>
        <SvgText x={width / 2} y={height / 2 + 16} fontSize={11} fontWeight="500" fill="rgba(42,43,49,0.7)" textAnchor="middle">
          A Detlio reward is under the foil
        </SvgText>
      </G>
    </Svg>
  );
}

/** ScratchCardPanel (apps/users/components/rewards/scratch-card.tsx). The prize is the server's. */
export function ScratchCardPanel({ card, compact = false }: { card: ScratchCardView; compact?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const userId = useAuth((s) => s.user?.id ?? null);
  const rememberOffer = usePendingCheckout((s) => s.rememberOffer);
  const scratch = useScratchCard();
  const still = useReducedMotion();
  const asked = useRef(false);
  const celebrated = useRef(false);
  const [result, setResult] = useState<ScratchResult | null>(null);
  const [cleared, setCleared] = useState(card.state === 'scratched');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [strokes, setStrokes] = useState<Array<{ x: number; y: number }>>([]);
  const [burst, setBurst] = useState(0);
  const [fading, setFading] = useState(false);
  const cells = useRef(new Set<string>());
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const foil = useSharedValue(1);
  const prizeScale = useSharedValue(1);

  const prize = result ? { outcome: result.outcome, amount: result.amount, fellBack: result.fellBack } : card.prize ? { outcome: card.prize.outcome, amount: card.prize.amount, fellBack: card.prize.fellBack } : null;
  const voucherLastDay = result ? (result.voucher?.lastDay ?? null) : card.prize?.voucher?.state === 'available' ? card.prize.voucher.lastDay : null;
  const voucherCode = result?.voucher?.code ?? null;
  const justRevealed = cleared && result !== null;

  useEffect(() => {
    if (!justRevealed || celebrated.current || !result) return;
    celebrated.current = true;
    buzz();
    if (prizeTier(result.outcome) === 'jackpot' && !still) setBurst(1);
  }, [justRevealed, result, still]);

  const ask = () => {
    if (asked.current) return;
    asked.current = true;
    scratch.mutate(card.id, {
      onSuccess: (data) => setResult(data),
      onError: () => {
        asked.current = false;
      },
    });
  };
  const askRef = useRef(ask);
  askRef.current = ask;

  const clearFoil = () => {
    setCleared(true);
    if (!still) {
      setFading(true);
      setTimeout(() => setFading(false), 520);
      foil.value = withTiming(0, { duration: 500 });
      prizeScale.value = 0.85;
      prizeScale.value = withTiming(1, { duration: 600, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
    } else {
      foil.value = 0;
    }
  };
  const clearRef = useRef(clearFoil);
  clearRef.current = clearFoil;

  const revealAll = () => {
    ask();
    clearFoil();
  };

  // A finger moves faster than touches arrive: the gaps between them are filled, as a stroke would.
  const last = useRef<{ x: number; y: number } | null>(null);
  const add = (x: number, y: number, fresh = false) => {
    const from = fresh ? null : last.current;
    const points = from ? strokeBetween(from, { x, y }) : [{ x, y }];
    last.current = { x, y };
    setStrokes((all) => [...all, ...points]);
    points.forEach((p) => cellsUnder(p.x, p.y, sizeRef.current).forEach((c) => cells.current.add(c)));
  };
  const addRef = useRef(add);
  addRef.current = add;
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        askRef.current();
        addRef.current(e.nativeEvent.locationX, e.nativeEvent.locationY, true);
      },
      onPanResponderMove: (e) => addRef.current(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderRelease: () => {
        if (clearedShare(cells.current.size, sizeRef.current) >= CLEAR_AT) clearRef.current();
      },
    })
  ).current;

  const goToCheckout = () => {
    if (voucherCode && userId && voucherLastDay) {
      const pending = livePendingCheckout(usePendingCheckout.getState().pending, { userId, now: Date.now() });
      rememberOffer({ userId, code: voucherCode, vendorId: null, vehicleId: pending?.vehicleId ?? null, endsAt: voucherEndsAt(voucherLastDay) });
    }
    router.push('/garages' as Href);
  };

  const waiting = scratch.isPending && !result;
  const failed = scratch.isError && !result;
  const showPrize = cleared && prize !== null;
  const garage = prize?.outcome === 'garage_card';
  const spec = prize && !garage ? prizeCardSpec({ id: card.id, createdAt: card.createdAt, outcome: prize.outcome, amount: prize.amount, vendorName: card.vendorName, useBy: voucherLastDay }) : null;
  const foilStyle = useAnimatedStyle(() => ({ opacity: foil.value }));
  const prizeStyle = useAnimatedStyle(() => ({ transform: [{ scale: prizeScale.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <View style={styles.column}>
      <View>
        <View onLayout={onLayout} style={styles.card}>
          <Animated.View style={[StyleSheet.absoluteFill, prizeStyle]} accessibilityLiveRegion="polite">
            {garage ? (
              <LinearGradient colors={['#24262D', '#0B0C0F']} style={[StyleSheet.absoluteFill, styles.centre]}>
                <View style={styles.garageInner}>
                  {result?.garagePull ? <GarageCard car={result.garagePull.car} /> : <GarageCardBack />}
                  {result?.garagePull ? <IllustrationLine small /> : null}
                </View>
              </LinearGradient>
            ) : spec ? (
              <PremiumCard spec={spec} animate={showPrize} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.centre]}>
                <T size={13} lh={18} align="center" color="#A1A5AD">
                  {waiting ? 'Revealing…' : 'A prize is waiting'}
                </T>
              </View>
            )}
          </Animated.View>
          {!still && (!cleared || fading) ? (
            <Animated.View {...(cleared ? {} : responder.panHandlers)} pointerEvents={cleared ? 'none' : 'auto'} accessibilityElementsHidden style={[StyleSheet.absoluteFill, foilStyle]}>
              {size.width > 0 ? <Foil width={size.width} height={size.height} strokes={strokes} /> : null}
            </Animated.View>
          ) : null}
          {!cleared && still ? <View accessibilityElementsHidden style={[StyleSheet.absoluteFill, styles.plainFoil]} /> : null}
        </View>
        <Confetti run={burst} colours={JACKPOT_CONFETTI_COLORS} />
      </View>
      {showPrize && prize?.fellBack ? (
        <T size={11} lh={15} color={colors.textSecondary}>
          This month&apos;s prize budget is used up, so it&apos;s a bonus stamp.
        </T>
      ) : null}

      {!cleared ? (
        <View style={styles.between}>
          <FigureLine size={11} lh={15} color={colors.textMuted} text={`Scratch by ${rewardDay(card.lastDay)}${card.vendorName ? ` · ${card.vendorName}` : ''}`} />
          <Pressable accessibilityRole="button" onPress={revealAll}>
            <T size={12} weight={500} lh={16} style={styles.underline}>
              Reveal
            </T>
          </Pressable>
        </View>
      ) : prize && isMoneyPrize(prize.outcome) && voucherLastDay ? (
        <View style={styles.between}>
          <View style={styles.shrink}>
            <FigureLine size={12} lh={16} color={colors.textSecondary} text={`In your rewards. Use by ${rewardDay(voucherLastDay)}`} />
          </View>
          <ScButton variant="hero" fullWidth={false} height={40} paddingX={16} onPress={goToCheckout}>
            <Label color={colors.white}>Use at checkout</Label>
            <IconArrowUpRight size={16} color={colors.white} />
          </ScButton>
        </View>
      ) : garage ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/profile/rewards/garage' as Href)} style={styles.done}>
          <IconCircleCheckFilled size={16} color={colors.meterOn} />
          <T size={12} lh={16} style={styles.shrink}>
            {result?.garagePull ? `${result.garagePull.car.name} (${result.garagePull.car.rarityLabel}) is in your Garage. ` : 'A new car is in your Garage. '}
            <T size={12} lh={16} style={styles.underline}>
              See it
            </T>
          </T>
        </Pressable>
      ) : prize?.outcome === 'bonus_stamp' ? (
        <View style={styles.done}>
          <IconCircleCheckFilled size={16} color={colors.meterOn} />
          {result?.shineVoucher ? <FigureLine size={12} lh={16} text={`Added to your Shine Card, and it's full: ${rewardRupees(result.shineVoucher.amount)} off is ready.`} /> : <T size={12} lh={16}>Added to your Shine Card</T>}
        </View>
      ) : null}

      {failed ? (
        <View style={styles.between}>
          <T accessibilityRole="alert" size={12} lh={16} color={colors.warning} style={styles.shrink}>
            {scratch.error instanceof Error ? scratch.error.message : "Couldn't reveal it. Try again."}
          </T>
          <ScButton variant="outline" fullWidth={false} height={32} paddingX={12} onPress={revealAll}>
            Try again
          </ScButton>
        </View>
      ) : null}
      {showPrize && spec ? <ShareCardImage spec={() => spec} compact /> : null}
      {compact && cleared ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/profile/rewards' as Href)}>
          <T size={12} lh={16} color={colors.textSecondary} style={styles.underline}>
            See your rewards
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 10 },
  card: { width: '100%', aspectRatio: 100 / 132, overflow: 'hidden', borderRadius: 14, backgroundColor: '#15161A' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  garageInner: { width: '64%', gap: 6 },
  plainFoil: { backgroundColor: '#C9CCD4' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  shrink: { flexShrink: 1, minWidth: 0 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  underline: { textDecorationLine: 'underline' },
}));

