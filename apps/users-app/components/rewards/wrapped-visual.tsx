import type { WrappedCardKey } from '@repo/core/wrapped';
import { IconStarFilled } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';

import { CAR_BODY, CAR_GLASS, CAR_HEADLIGHT, CAR_PILLAR, CAR_ROOFLINE, CAR_SHOULDER, CAR_TAILLIGHT, CAR_VIEWBOX, CAR_WHEELS } from '@/lib/car-silhouette';
import { levelMetal } from '@/lib/wrapped-look';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function Car({ width }: { width: number }) {
  const { width: w, height: h } = CAR_VIEWBOX;
  return (
    <Svg width={width} height={(width * h) / w} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <LinearGradient id="wv-body" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A3B44" />
          <Stop offset="1" stopColor="#0D0D10" />
        </LinearGradient>
        <RadialGradient id="wv-floor" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="rgba(255,255,255,0.22)" />
          <Stop offset="1" stopColor="rgba(255,255,255,0)" />
        </RadialGradient>
      </Defs>
      <Ellipse cx="305" cy="174" rx="290" ry="9" fill="url(#wv-floor)" />
      <Path d={CAR_BODY} fill="url(#wv-body)" />
      <Path d={CAR_GLASS} fill="#0B0C10" />
      <Path d={CAR_PILLAR} stroke="#0D0D10" strokeWidth="5" />
      <Path d={CAR_ROOFLINE} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2" strokeLinecap="round" />
      <Path d={CAR_SHOULDER} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.4" strokeLinecap="round" />
      <Path d={CAR_HEADLIGHT} fill="rgba(255,255,255,0.85)" />
      <Path d={CAR_TAILLIGHT} fill="#E4002B" />
      {CAR_WHEELS.map((c) => (
        <G key={c.cx}>
          <Circle cx={c.cx} cy={c.cy} r={c.r} fill="#070708" />
          <Circle cx={c.cx} cy={c.cy} r={c.r * 0.66} fill="none" stroke="rgba(220,225,236,0.7)" strokeWidth="3" />
          <Circle cx={c.cx} cy={c.cy} r={c.r * 0.14} fill="rgba(220,225,236,0.7)" />
        </G>
      ))}
    </Svg>
  );
}

const SPARKS: Array<[number, number, number]> = [[18, 18, 3.2], [34, 8, 2], [62, 12, 3.6], [82, 22, 2.4], [48, 28, 1.6], [90, 8, 1.8]];
const DROPS: Array<[number, number, number]> = [[24, 10, 1], [38, 4, 0.8], [52, 14, 1.15], [66, 6, 0.9], [78, 16, 1], [31, 22, 0.7], [70, 26, 0.75]];

/** WrappedVisual: the coupé in a different light per card, coins, the year's months, the medal. */
export function WrappedVisual({ cardKey, monthIndex, level, width }: { cardKey: WrappedCardKey; monthIndex?: number | null; level: { key: string; label: string }; width: number }) {
  if (cardKey === 'saved') {
    return (
      <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 8 }}>
        <Svg width={220} height={132} viewBox="0 0 200 120">
          <Defs>
            <LinearGradient id="wv-coin" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FBE7A6" />
              <Stop offset="0.5" stopColor="#E3B652" />
              <Stop offset="1" stopColor="#9C6E22" />
            </LinearGradient>
          </Defs>
          {[0, 1, 2, 3, 4].map((i) => (
            <G key={i}>
              <Ellipse cx="78" cy={104 - i * 13} rx="48" ry="12" fill="#7A541A" />
              <Ellipse cx="78" cy={100 - i * 13} rx="48" ry="12" fill="url(#wv-coin)" />
            </G>
          ))}
          <Circle cx="150" cy="58" r="34" fill="#7A541A" />
          <Circle cx="148" cy="55" r="34" fill="url(#wv-coin)" />
          <Circle cx="148" cy="55" r="26" fill="none" stroke="rgba(255,243,196,0.6)" strokeWidth="2" />
          <SvgText x="148" y="67" textAnchor="middle" fontSize="34" fontWeight="700" fill="#5A3C0C">
            ₹
          </SvgText>
        </Svg>
      </View>
    );
  }
  if (cardKey === 'month') {
    return (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4, paddingHorizontal: 4, paddingBottom: 12 }}>
        {MONTHS.map((m, i) => {
          const busiest = i === monthIndex;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <View style={{ width: '100%', height: busiest ? 96 : 18, borderRadius: 99, backgroundColor: busiest ? '#FFFFFF' : 'rgba(255,255,255,0.15)' }} />
              <T num size={10} lh={12} weight={busiest ? 600 : 400} color={busiest ? '#FFFFFF' : 'rgba(255,255,255,0.45)'}>
                {m}
              </T>
            </View>
          );
        })}
      </View>
    );
  }
  if (cardKey === 'level') {
    const metal = levelMetal(level.key);
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center', shadowColor: metal.base, shadowRadius: 30, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 } }}>
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 132 132">
            <Defs>
              <RadialGradient id="wv-medal" cx="32%" cy="26%" r="80%">
                <Stop offset="0" stopColor={metal.light} />
                <Stop offset="0.55" stopColor={metal.base} />
                <Stop offset="1" stopColor={metal.dark} />
              </RadialGradient>
            </Defs>
            <Circle cx="66" cy="66" r="66" fill="url(#wv-medal)" />
            <Circle cx="66" cy="66" r="64.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
            <Circle cx="66" cy="66" r="57" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="9" />
          </Svg>
          <IconStarFilled size={44} color={metal.ink} />
          <T size={13} weight={600} lh={18} uppercase tracking={0.16} color={metal.ink}>
            {level.label}
          </T>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'flex-start' }}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet">
        {cardKey === 'washes' ? DROPS.map(([x, y, s], i) => <Path key={i} transform={`translate(${x} ${y}) scale(${s})`} d="M0 -4C1.6 -1.6 2.6 0 2.6 1.4C2.6 3 1.4 4.2 0 4.2C-1.4 4.2 -2.6 3 -2.6 1.4C-2.6 0 -1.6 -1.6 0 -4Z" fill="rgba(186, 220, 255, 0.85)" />) : null}
        {cardKey === 'shine' ? SPARKS.map(([x, y, r], i) => <Path key={i} d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`} fill="#FFFFFF" opacity={0.85} />) : null}
        {cardKey === 'garage' ? (
          <>
            <Path d="M6 58V24L50 4L94 24V58" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" strokeLinejoin="round" />
            {[30, 36, 42, 48, 54].map((y) => (
              <Path key={y} d={`M20 ${y}H80`} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
            ))}
            <Path d="M20 58V26H80V58" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          </>
        ) : null}
      </Svg>
      <Car width={width * 1.34} />
    </View>
  );
}
