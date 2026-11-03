import { type CardCar } from '@repo/core/card-cars';
import { T } from '@repo/native-ui/text';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useId, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinear, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { cardPhotoSource } from '@/lib/card-photos';
import { useReducedMotion } from '@/lib/motion';
import { stopOf } from '@/lib/svg-colour';
import { CARD, CHIP_ICON_PATHS, CONFETTI, INKS, LOOKS, PHOTO, RIBBON, SPARKS, TIP_LABEL, sparkPath, titleSize, type CardChip, type ChipIcon, type PremiumCardSpec } from '@/lib/premium-card';

export function ChipGlyph({ icon, size, colour }: { icon: ChipIcon; size: number; colour: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {CHIP_ICON_PATHS[icon].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}

/** A car photo with its lower part fading into the ground: the web's CSS mask, as a fade over it. */
export function CarPhoto({ car, heightUnits, u, ground, fade }: { car: CardCar; heightUnits: number; u: number; ground: string; fade: ReadonlyArray<readonly [number, number]> }) {
  const source = cardPhotoSource(car.file);
  const stops = fade.map(([, a]) => `${ground}${Math.round((1 - a) * 255).toString(16).padStart(2, '0')}`);
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: heightUnits * u, overflow: 'hidden' }}>
      {source ? <Image source={source} accessibilityIgnoresInvertColors style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" /> : null}
      <LinearGradient colors={stops as [string, string, ...string[]]} locations={fade.map(([at]) => at) as unknown as [number, number, ...number[]]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function Chip({ chip, u, ink }: { chip: CardChip; u: number; ink: (typeof INKS)['gallery'] }) {
  const c = CARD.chips;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: c.iconGap * u, height: c.height * u, paddingHorizontal: c.padX * u, borderRadius: 999, backgroundColor: ink.chipBg, borderWidth: Math.max(0.5, 0.28 * u), borderColor: ink.chipEdge, flexShrink: chip.fluid ? 1 : 0 }}>
      <ChipGlyph icon={chip.icon} size={c.icon * u} colour={ink.chipIcon} />
      <T size={c.font * u} lh={c.height * u} weight={500} numberOfLines={1} color={ink.chipText} style={{ flexShrink: 1 }}>
        {chip.text}
      </T>
    </View>
  );
}

/** Lights, confetti, sparks and the ribbon: one drawing, in card units over the whole card. */
function Lights({ spec, id, heightUnits }: { spec: PremiumCardSpec; id: string; heightUnits: number }) {
  const look = LOOKS[spec.look];
  const spark = look.spark ?? (look.tone === 'night' ? '#DCE1EC' : '#D9A441');
  const stops = RIBBON.stops.map(([at, c]) => <Stop key={at} offset={at} stopColor={c} />);
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 100 ${heightUnits}`} preserveAspectRatio="xMidYMin slice">
      <Defs>
        <RadialGradient id={`${id}-wash`} gradientUnits="userSpaceOnUse" cx={PHOTO.wash.x} cy={PHOTO.wash.y} rx={PHOTO.wash.rx} ry={PHOTO.wash.ry}>
          <Stop offset="0" {...stopOf(look.wash)} />
          <Stop offset="1" stopColor={stopOf(look.wash).stopColor} stopOpacity={0} />
        </RadialGradient>
        <SvgLinear id={`${id}-sash`} gradientUnits="userSpaceOnUse" x1={RIBBON.across.from[0]} y1={RIBBON.across.from[1]} x2={RIBBON.across.to[0]} y2={RIBBON.across.to[1]}>
          {stops}
        </SvgLinear>
        <SvgLinear id={`${id}-bow`} gradientUnits="userSpaceOnUse" x1={RIBBON.bowLight.from[0]} y1={RIBBON.bowLight.from[1]} x2={RIBBON.bowLight.to[0]} y2={RIBBON.bowLight.to[1]}>
          {stops}
        </SvgLinear>
      </Defs>
      <Rect x={0} y={0} width={100} height={heightUnits} fill={`url(#${id}-wash)`} />
      {look.accent === 'confetti'
        ? CONFETTI.map((p, i) =>
            p.w === p.h ? (
              <Circle key={i} cx={p.x} cy={p.y} r={p.w / 2} fill={p.c} />
            ) : (
              <Rect key={i} x={p.x - p.w / 2} y={p.y - p.h / 2} width={p.w} height={p.h} rx={0.4} fill={p.c} transform={`rotate(${p.r} ${p.x} ${p.y})`} />
            )
          )
        : null}
      {look.accent === 'sparks' ? SPARKS.map((s, i) => <Path key={i} d={sparkPath(s.x, s.y, s.s)} fill={spark} opacity={s.o} />) : null}
      {look.accent === 'ribbon' ? (
        <>
          <G transform="translate(0.5 0.9)" fill="rgba(20,24,30,0.16)">
            <Path d={RIBBON.band} />
            {RIBBON.bow.map((d) => (
              <Path key={d} d={d} />
            ))}
          </G>
          <Path d={RIBBON.band} fill={`url(#${id}-sash)`} />
          {RIBBON.bow.map((d) => (
            <Path key={d} d={d} fill={`url(#${id}-bow)`} />
          ))}
          <Circle cx={RIBBON.knot.x} cy={RIBBON.knot.y} r={RIBBON.knot.r} fill="#E9EDF1" stroke="#9AA4AE" strokeWidth={0.3} />
        </>
      ) : null}
    </Svg>
  );
}

const ASPECT = { card: 132, mini: 104, thumb: 76 } as const;

/** The card once its width is known; `width` skips the measuring (a shared picture). */
export function PremiumCard({ spec, size = 'card', animate = true, width: fixed }: { spec: PremiumCardSpec; size?: 'card' | 'mini' | 'thumb'; animate?: boolean; width?: number }) {
  const [measured, setMeasured] = useState(0);
  const width = fixed ?? measured;
  const heightUnits = ASPECT[size];
  const onLayout = (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width);
  return (
    <View onLayout={fixed ? undefined : onLayout} style={{ width: fixed ?? '100%', aspectRatio: 100 / heightUnits }}>
      {width > 0 ? <Face spec={spec} size={size} u={width / 100} heightUnits={heightUnits} moving={animate && size === 'card'} /> : null}
    </View>
  );
}

function Face({ spec, size, u, heightUnits, moving }: { spec: PremiumCardSpec; size: 'card' | 'mini' | 'thumb'; u: number; heightUnits: number; moving: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const look = LOOKS[spec.look];
  const ink = INKS[look.tone];
  const still = useReducedMotion();
  const sheen = useSharedValue(moving && !still ? 0 : 1);
  useEffect(() => {
    if (!moving || still) return;
    sheen.value = withDelay(450, withTiming(1, { duration: 1600, easing: Easing.bezier(0.4, 0, 0.2, 1) }));
  }, [moving, still, sheen]);
  const sheenStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (sheen.value * 1.6 - 0.8) * 100 * u }, { rotate: '22deg' }], opacity: sheen.value >= 1 ? 0 : 1 }));
  return (
    <View style={{ flex: 1, overflow: 'hidden', borderRadius: CARD.radius * u, borderWidth: Math.max(0.5, 0.28 * u), borderColor: look.tone === 'night' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)' }}>
      <LinearGradient colors={look.ground} locations={[0, 0.52, 1]} style={StyleSheet.absoluteFill} />
      <CarPhoto car={spec.car} heightUnits={PHOTO.height} u={u} ground={look.ground[1]} fade={PHOTO.fade} />
      {look.tint ? <LinearGradient colors={[look.tint, look.tint, 'transparent']} locations={[0, 0.6, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: PHOTO.height * u, opacity: 0.35 }} /> : null}
      {size !== 'thumb' ? <Lights spec={spec} id={id} heightUnits={heightUnits} /> : null}
      {size !== 'thumb' ? (
        <T size={CARD.mark.size * u} lh={CARD.mark.size * u * 1.1} weight={600} color={ink.mark} style={{ position: 'absolute', left: CARD.pad * u, top: 5.4 * u }}>
          Detlio<T size={CARD.mark.size * u} weight={600} color="#E4002B">.</T>
        </T>
      ) : null}
      {size === 'card' ? (
        <View style={{ position: 'absolute', left: CARD.pad * u, right: CARD.pad * u, top: CARD.chips.top * u, flexDirection: 'row', gap: CARD.chips.gap * u, overflow: 'hidden' }}>
          {spec.chips.map((chip) => (
            <Chip key={`${chip.icon}-${chip.text}`} chip={chip} u={u} ink={ink} />
          ))}
        </View>
      ) : null}
      {size !== 'thumb' ? (
        <View style={{ position: 'absolute', left: CARD.pad * u, right: CARD.pad * u, top: (size === 'mini' ? 78.5 : CARD.title.top) * u }}>
          {spec.title.map((line, i) => (
            <T key={line} size={titleSize(line) * u} lh={CARD.title.line * u} weight={700} tracking={-0.035} numberOfLines={1} color={i === 0 ? ink.title : ink.sub}>
              {line}
            </T>
          ))}
        </View>
      ) : null}
      {size === 'card' ? (
        <T size={CARD.tip.size * u} lh={CARD.tip.line * u} numberOfLines={CARD.tip.lines} color={ink.tip} style={{ position: 'absolute', left: CARD.pad * u, right: CARD.pad * u, top: CARD.tip.top * u }}>
          <T size={CARD.tip.size * u} lh={CARD.tip.line * u} weight={600} color={ink.label}>
            {`${TIP_LABEL} `}
          </T>
          {spec.tip}
        </T>
      ) : null}
      {moving && !still ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: '-30%', bottom: '-30%', left: '40%', width: 30 * u }, sheenStyle]}>
          <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} colors={['transparent', 'rgba(255,255,255,0.22)', 'transparent']} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The whole picture a share makes: the backdrop, the card, "Book on detlio.com". */
export function PremiumSharePicture({ spec, format }: { spec: PremiumCardSpec; format: 'story' | 'post' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const look = LOOKS[spec.look];
  const layout = format === 'story' ? { card: 860, top: 300, gap: 72, pill: 124, font: 46, h: 1920 } : { card: 740, top: 84, gap: 52, pill: 104, font: 40, h: 1350 };
  const k = 1 / 3;
  const width = 1080 * k;
  const height = layout.h * k;
  return (
    <View style={{ width, height, alignItems: 'center' }}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`${id}-back`} cx="50%" cy="40%" r="75%">
            <Stop offset="0" stopColor={look.backdrop[0]} />
            <Stop offset="1" stopColor={look.backdrop[1]} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id}-back)`} />
      </Svg>
      <View style={{ marginTop: layout.top * k }}>
        <PremiumCard spec={spec} animate={false} width={layout.card * k} />
      </View>
      <SharePill height={layout.pill * k} font={layout.font * k} marginTop={layout.gap * k} />
    </View>
  );
}

export function SharePill({ height, font, marginTop }: { height: number; font: number; marginTop: number }) {
  return (
    <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} colors={['#E4002B', '#CA0026', '#B80022']} locations={[0, 0.66, 1]} style={{ marginTop, height, borderRadius: height / 2, paddingHorizontal: height * 0.55, alignItems: 'center', justifyContent: 'center' }}>
      <T size={font} lh={font * 1.2} weight={600} color="#FFFFFF">
        {'Book on detlio.com  ↗'}
      </T>
    </LinearGradient>
  );
}
