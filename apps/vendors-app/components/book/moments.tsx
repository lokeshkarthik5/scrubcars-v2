import type { BookDay } from '@repo/core/api/garage-book';
import { dayLabel, rupees } from '@repo/core/garage-book';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Edge, Glass, Recessed } from '@repo/native-ui/finish';
import { useReduceMotion } from '@repo/native-ui/motion';
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
          <T num size={14} weight={600}>
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
              <T variant="t3" weight={600} align="center">{`Done · ${name}`}</T>
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
  const styles = useStyles();
  const colors = useColors();
  if (!day.taken || !day.closing) return null;
  const { taken, closing } = day;
  const max = Math.max(1, taken.cashPaise, taken.upiPaise, taken.detlioPaise);
  const paidBack = taken.ownPaise - taken.cashPaise - taken.upiPaise;
  return (
    <Edge radius={22} innerStyle={styles.closing}>
      <Overline>{`Today · ${dayLabel(day.date)} · all jobs done`}</Overline>
      <T num size={36} weight={600} lh={40} tracking={-0.02}>
        {rupees(taken.totalPaise) ?? '₹0'}
      </T>
      <FillBar label="Cash" paise={taken.cashPaise} share={taken.cashPaise / max} index={0} />
      <FillBar label="UPI" paise={taken.upiPaise} share={taken.upiPaise / max} index={1} />
      <FillBar label="Detlio" paise={taken.detlioPaise} share={taken.detlioPaise / max} index={2} red />
      <T size={12} color={colors.textSecondary}>
        {`${closing.jobsDone} ${closing.jobsDone === 1 ? 'job' : 'jobs'} done${paidBack > 0 ? ` · ${rupees(paidBack)} paid back` : ''}`}
      </T>
      {closing.owing.length > 0 ? (
        <View style={styles.owing}>
          <Overline>Still owes</Overline>
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
