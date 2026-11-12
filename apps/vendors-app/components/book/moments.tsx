import type { BookDay, Milestone } from '@repo/core/api/garage-book';
import { dayLabel, milestoneTitle, monthYear, rupees } from '@repo/core/garage-book';
import { useT, useTn } from '@repo/core/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Modal, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';

import { Edge, Glass, Recessed } from '@repo/native-ui/finish';
import { Rise, useReduceMotion } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { go, Overline } from './parts';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const SETTLE = Easing.bezier(0.22, 1, 0.36, 1);

/** Moment 1's ring: the share of the time to answer that is left, drained as minutes go. */
export function AnswerRing({ fraction, label, accessibilityLabel }: { fraction: number; label: string; accessibilityLabel: string }) {
  const styles = useStyles();
  const C = 2 * Math.PI * 22;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.ring}>
      <Svg width={52} height={52} viewBox="0 0 52 52" style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={26} cy={26} r={22} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={4} />
        <Circle
          cx={26}
          cy={26}
          r={22}
          fill="none"
          stroke="#FF2D4A"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${C} ${C}`}
          strokeDashoffset={C * (1 - fraction)}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.ringLabel}>
          {/* A word (New, or its Tamil) is set smaller than the minutes figure, to stay in the ring. */}
          <T num size={label.length > 4 ? 10 : 14} weight={600} numberOfLines={1}>
            {label}
          </T>
        </View>
      </View>
    </View>
  );
}

/** Moment 2: the walk-in just added drops into its place on Today, once. */
export function DropIn({ play, children }: { play: boolean; children: ReactNode }) {
  const reduce = useReduceMotion();
  const p = useRef(new Animated.Value(play && !reduce ? 0 : 1)).current;
  useEffect(() => {
    if (!play || reduce) return;
    Animated.spring(p, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 9 }).start();
  }, [play, reduce, p]);
  return (
    <Animated.View
      style={{
        opacity: p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
        transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-48, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Moment 3, job done, money in: a tick draws in a red-lit ring, the amount floats up, the
 * card fades. Once; under Reduce Motion only the words, briefly.
 */
export function DoneMoment({ name, line, amount, onEnd }: { name: string; line: string; amount: string | null; onEnd: () => void }) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const reduce = useReduceMotion();
  const ring = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const tick = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) {
      const timer = setTimeout(onEnd, 1400);
      return () => clearTimeout(timer);
    }
    const run = Animated.sequence([
      Animated.timing(ring, { toValue: 1, duration: 500, easing: Easing.bezier(0.65, 0, 0.35, 1), useNativeDriver: false }),
      Animated.parallel([
        Animated.timing(tick, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.timing(fly, { toValue: 1, duration: 1100, easing: SETTLE, useNativeDriver: true }),
      ]),
      Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);
    run.start(({ finished }) => finished && onEnd());
    return () => run.stop();
  }, [reduce, ring, tick, fly, fade, onEnd]);
  return (
    <Modal transparent visible animationType="none" onRequestClose={onEnd}>
      <View style={styles.doneWrap} accessibilityLiveRegion="polite">
        <Animated.View style={{ opacity: fade }}>
          <Glass radius={22} heavy style={styles.doneCard}>
            <View style={styles.doneInner}>
              {amount && !reduce ? (
                <Animated.View
                  style={[
                    styles.amount,
                    {
                      opacity: fly.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
                      transform: [{ translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [24, -72] }) }],
                    },
                  ]}
                >
                  <T num size={18} weight={600}>{`+${amount}`}</T>
                </Animated.View>
              ) : null}
              <Svg width={76} height={76} viewBox="0 0 76 76">
                <AnimatedCircle
                  cx={38}
                  cy={38}
                  r={32}
                  fill="none"
                  stroke="#FF2D4A"
                  strokeWidth={2.5}
                  strokeDasharray={`${2 * Math.PI * 32} ${2 * Math.PI * 32}`}
                  strokeDashoffset={ring.interpolate({ inputRange: [0, 1], outputRange: [2 * Math.PI * 32, 0] })}
                />
                <AnimatedPath
                  d="M26 39l8 8l16 -18"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="40 40"
                  strokeDashoffset={tick.interpolate({ inputRange: [0, 1], outputRange: [40, 0] })}
                />
              </Svg>
              <T variant="t3" weight={600} align="center">{t('Done · {name}', { name })}</T>
              <T variant="t4" weight={400} color={colors.textSecondary} align="center">
                {line}
              </T>
            </View>
          </Glass>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Moment 4, closing time: the day's takings, cash, UPI and Detlio filling in, and who still owes. Owner only. */
export function ClosingCard({ day }: { day: BookDay }) {
  const t = useT();
  const tn = useTn();
  const styles = useStyles();
  const colors = useColors();
  if (!day.taken || !day.closing) return null;
  const { taken, closing } = day;
  const max = Math.max(1, taken.cashPaise, taken.upiPaise, taken.detlioPaise);
  const paidBack = taken.ownPaise - taken.cashPaise - taken.upiPaise;
  return (
    <Edge radius={22} innerStyle={styles.closing}>
      <Overline>{t('Today · {date} · all jobs done', { date: dayLabel(day.date) })}</Overline>
      <T num size={36} weight={600} lh={40} tracking={-0.02}>
        {rupees(taken.totalPaise) ?? '₹0'}
      </T>
      <FillBar label={t('Cash')} paise={taken.cashPaise} share={taken.cashPaise / max} index={0} />
      <FillBar label="UPI" paise={taken.upiPaise} share={taken.upiPaise / max} index={1} />
      <FillBar label="Detlio" paise={taken.detlioPaise} share={taken.detlioPaise / max} index={2} red />
      <T size={12} color={colors.textSecondary}>
        {`${tn(closing.jobsDone, '{count} job done', '{count} jobs done')}${paidBack > 0 ? ` · ${t('{amount} paid back', { amount: rupees(paidBack) ?? '' })}` : ''}`}
      </T>
      {closing.owing.length > 0 ? (
        <View style={styles.owing}>
          <Overline>{t('Still owes')}</Overline>
          {closing.owing.map((row) => (
            <T key={row.customerId} variant="t4" weight={400} onPress={() => go(`/book/customers/${encodeURIComponent(row.customerId)}`)}>
              {`${row.name}  `}
              <T num variant="t4" weight={400} color="#FF8A95">
                {rupees(row.amountPaise) ?? ''}
              </T>
            </T>
          ))}
        </View>
      ) : null}
    </Edge>
  );
}

function FillBar({ label, paise, share, index, red = false }: { label: string; paise: number; share: number; index: number; red?: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const reduce = useReduceMotion();
  const grow = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(grow, { toValue: 1, duration: 1000, delay: 200 + index * 120, easing: SETTLE, useNativeDriver: true }).start();
  }, [reduce, grow, index]);
  return (
    <View>
      <View style={styles.barHead}>
        <T variant="t4" weight={400} color={colors.textSecondary}>
          {label}
        </T>
        <T num variant="t4" weight={600}>
          {rupees(paise) ?? '₹0'}
        </T>
      </View>
      <Recessed radius={4} style={styles.track}>
        <View style={[styles.fillBox, { width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%` }]}>
          <Animated.View
            style={[
              styles.fill,
              red ? styles.fillRed : styles.fillSilver,
              { transform: [{ translateX: grow.interpolate({ inputRange: [0, 1], outputRange: [-400, 0] }) }] },
            ]}
          />
        </View>
      </Recessed>
    </View>
  );
}

const useStyles = createStyles(() => ({
  ring: { width: 52, height: 52 },
  ringLabel: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doneCard: { width: 240 },
  doneInner: { alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 24 },
  amount: { position: 'absolute', top: 0, alignSelf: 'center' },
  closing: { padding: 16, gap: 14 },
  owing: { gap: 4 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, marginTop: 6, overflow: 'hidden' },
  fillBox: { height: '100%', overflow: 'hidden', borderRadius: 4 },
  fill: { flex: 1, borderRadius: 4 },
  fillRed: { backgroundColor: '#FF2D4A', shadowColor: '#FF2D4A', shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  fillSilver: { backgroundColor: '#C9CBD2' },
}));

// ─── Stages 2 and 3 (0073) ───────────────────────────────────────────────────

/** The silver tag of a record ("Reminders earned ₹6,450"), as the mockups' `.pick`. */
export function SilverTag({ children }: { children: string }) {
  const styles = useStage2Styles();
  return (
    <LinearGradient colors={['#F6F7FA', '#B9BEC9', '#E8EAEF']} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tag}>
      <T size={10} weight={700} tracking={0.08} uppercase color="#0A0A0B">
        {children}
      </T>
    </LinearGradient>
  );
}

/**
 * Moment 5, a reminder that pays back (Reminders): who came back after a reminder this month,
 * and what those visits came to. The money is the owner's; staff see the count only.
 */
export function RemindersEarned({ cameBack, earnedPaise }: { cameBack: number; earnedPaise: number | undefined }) {
  const t = useT();
  const tn = useTn();
  const styles = useStage2Styles();
  const colors = useColors();
  if (cameBack <= 0) return null;
  return (
    <Rise>
      <Edge radius={18} innerStyle={styles.earned}>
        <Overline>{t('From your reminders')}</Overline>
        <T size={15} weight={600} style={styles.earnedLine}>
          {tn(cameBack, '{count} customer came back', '{count} customers came back')}
        </T>
        {earnedPaise !== undefined ? (
          <View style={styles.earnedTag}>
            <SilverTag>{t('Reminders earned {amount}', { amount: rupees(earnedPaise) ?? '₹0' })}</SilverTag>
            <T size={11} color={colors.textSecondary}>
              {t('this month')}
            </T>
          </View>
        ) : null}
      </Edge>
    </Rise>
  );
}

/** The figure that rolls up on a milestone card: the old one slides away, the new one in, once. */
function RollUp({ from, to }: { from: string; to: string }) {
  const styles = useStage2Styles();
  const reduce = useReduceMotion();
  const p = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.timing(p, { toValue: 1, duration: 1100, delay: 400, easing: SETTLE, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [reduce, p]);
  return (
    <View accessible accessibilityLabel={to} style={styles.roll}>
      <Animated.View style={{ transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -ROLL] }) }] }}>
        <T num size={52} weight={700} lh={ROLL} tracking={-0.03} color={METAL_INK}>
          {reduce ? to : from}
        </T>
        <T num size={52} weight={700} lh={ROLL} tracking={-0.03} color={METAL_INK}>
          {to}
        </T>
      </Animated.View>
    </View>
  );
}

const ROLL = 56;
const METAL_INK = '#141418';

/** Brushed metal: the light gradient, with fine vertical lines over it. */
function Metal({ gold = false, children, style }: { gold?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStage2Styles();
  return (
    <View style={[styles.metal, style]}>
      <LinearGradient
        colors={gold ? ['#FBE9B7', '#C99A3B', '#F3D98F', '#A87A25'] : ['#F4F5F8', '#C3C7D0', '#EEF0F4', '#A9AEB9']}
        locations={gold ? [0, 0.4, 0.58, 1] : [0, 0.38, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <Pattern id={gold ? 'brushGold' : 'brush'} width={3} height={4} patternUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={1} height={4} fill="rgba(255,255,255,0.07)" />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${gold ? 'brushGold' : 'brush'})`} />
      </Svg>
      {children}
    </View>
  );
}

/**
 * Moment 6, milestones in metal (Business, the owner's): the 100th customer, the first ₹1 lakh
 * month, the best month ever, on a brushed-metal card with the figure rolling up, and what is
 * next on gold. Shown once: the caller keeps the milestone it was given and tells the server it
 * was seen, so the card stays until the owner leaves the screen.
 */
export function MilestoneCard({ milestone, garage, onSeen }: { milestone: Milestone; garage: string; onSeen: (key: string) => void }) {
  const t = useT();
  const styles = useStage2Styles();
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    onSeen(milestone.key);
  }, [milestone.key, onSeen]);
  const figure =
    milestone.kind === 'customers'
      ? { from: String(Math.max(0, milestone.value - 10)), to: String(milestone.value), label: t('customers in your book') }
      : milestone.kind === 'lakh_month'
        ? {
            from: rupees(Math.max(0, milestone.value - 1) * 10_000_000) ?? '₹0',
            to: rupees(milestone.value * 10_000_000) ?? '',
            label: milestoneTitle({ kind: 'lakh_month', value: milestone.value }),
          }
        : { from: rupees(milestone.previousBestPaise) ?? '₹0', to: rupees(milestone.takenPaise) ?? '', label: milestoneTitle({ kind: 'best_month' }) };
  // The gold card says "Next" itself, so its line is the goal alone (core's milestoneNext with no "Next:").
  const next = milestone.next
    ? milestone.next.kind === 'customers'
      ? t('{count} customers', { count: milestone.next.value })
      : milestoneTitle({ kind: 'lakh_month', value: milestone.next.value })
    : null;
  return (
    <Rise>
      <View style={styles.milestones} accessibilityLiveRegion="polite">
        <Metal>
          <View style={styles.metalInner}>
            <T size={10} weight={700} tracking={0.12} uppercase color={METAL_INK} style={styles.dim} numberOfLines={1}>
              {garage}
            </T>
            <View style={styles.rollWrap}>
              <RollUp from={figure.from} to={figure.to} />
            </View>
            <T size={15} weight={700} color={METAL_INK}>
              {figure.label}
            </T>
            {milestone.since ? (
              <T size={12} color={METAL_INK} style={[styles.dim, styles.since]}>
                {t('Since {date}', { date: monthYear(milestone.since) })}
              </T>
            ) : null}
          </View>
        </Metal>
        {next ? (
          <Metal gold>
            <View style={styles.goldInner}>
              <T size={10} weight={700} tracking={0.12} uppercase color={METAL_INK} style={styles.dim}>
                {t('Next')}
              </T>
              <T size={15} weight={700} color={METAL_INK} style={styles.nextLine}>
                {next}
              </T>
            </View>
          </Metal>
        ) : null}
      </View>
    </Rise>
  );
}

const useStage2Styles = createStyles(() => ({
  tag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  earned: { padding: 14 },
  earnedLine: { marginTop: 6 },
  earnedTag: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  roll: { height: ROLL, overflow: 'hidden' },
  rollWrap: { marginTop: 14 },
  metal: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 20,
    shadowOpacity: 0.6,
  },
  metalInner: { padding: 18 },
  goldInner: { paddingHorizontal: 18, paddingVertical: 14 },
  milestones: { gap: 14 },
  dim: { opacity: 0.7 },
  since: { marginTop: 14 },
  nextLine: { marginTop: 4 },
}));
