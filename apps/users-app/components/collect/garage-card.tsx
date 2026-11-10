import type { GarageAlbumCar, GarageOwnedCar } from '@repo/core/api/garage';
import { cardNumber, copiesLabel, ILLUSTRATION_LINE, RARITY_LOOKS, type GarageRarity } from '@repo/core/garage';
import { IconDroplet, IconMapPin } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { SharePill } from '@/components/premium-card/premium-card';
import { cardPhotoSource } from '@/lib/card-photos';
import { cardPhoto, GARAGE_CARD as C, TONE_LOOKS } from '@/lib/garage-card';
import { useReducedMotion } from '@/lib/motion';

const metal = (rarity: GarageRarity): [string, string, string, string, string] => {
  const [a, b, c, d] = RARITY_LOOKS[rarity].metal;
  return [a, b, c, d, b];
};

function Sized({ aspect, fixed, children }: { aspect: number; fixed?: number; children: (u: number) => ReactNode }) {
  const [measured, setMeasured] = useState(0);
  const width = fixed ?? measured;
  const onLayout = (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width);
  return (
    <View onLayout={fixed ? undefined : onLayout} style={{ width: fixed ?? '100%', aspectRatio: 100 / aspect }}>
      {width > 0 ? children(width / 100) : null}
    </View>
  );
}

/** A photo, by its pool id or a future series' uploaded picture. */
function Photo({ car }: { car: Pick<GarageOwnedCar, 'photoId' | 'art'> }) {
  const source = car.art?.source === 'upload' && car.art.url ? { uri: car.art.url } : cardPhotoSource(cardPhoto(car.photoId).file);
  return source ? <Image source={source} accessibilityIgnoresInvertColors resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} /> : null;
}

/** The customer UI round's finish: no shine or sweep on any card (docs/ui-round-2026-11.md §1). */
const FINISH_NO_SHEEN = true;

function Sheen({ rarity, u, on }: { rarity: GarageRarity; u: number; on: boolean }) {
  const still = useReducedMotion();
  const x = useSharedValue(0);
  const moving = on && !still && (rarity === 'epic' || rarity === 'legendary');
  useEffect(() => {
    if (!moving) return;
    const cycle = rarity === 'epic' ? 7000 : 5200;
    x.value = withDelay(600, withRepeat(withTiming(1, { duration: cycle, easing: Easing.bezier(0.4, 0, 0.2, 1) }), -1, false));
  }, [moving, rarity, x]);
  const style = useAnimatedStyle(() => {
    const across = Math.min(1, x.value / 0.32);
    return { opacity: x.value > 0 && x.value < 0.32 ? 1 : 0, transform: [{ translateX: (across * 1.5 - 0.75) * 100 * u }, { rotate: '20deg' }] };
  });
  if (!moving) return null;
  const tint = rarity === 'epic' ? 'rgba(230,210,255,0.3)' : 'rgba(255,236,170,0.4)';
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: '-30%', bottom: '-30%', left: '40%', width: 26 * u }, style]}>
      <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} colors={['transparent', tint, 'transparent']} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** GarageCard (apps/users/components/garage/garage-card.tsx): the whole card, from its width alone. */
export function GarageCard({ car, shine = true, width }: { car: GarageOwnedCar; shine?: boolean; width?: number }) {
  const photo = cardPhoto(car.photoId);
  const t = TONE_LOOKS[photo.tone];
  const look = RARITY_LOOKS[car.rarity];
  const copies = copiesLabel(car.count);
  return (
    <Sized aspect={C.height} fixed={width}>
      {(u) => (
        <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} colors={metal(car.rarity)} locations={[0, 0.28, 0.52, 0.78, 1]} style={{ flex: 1, borderRadius: C.radius * u, padding: C.frame * u, shadowColor: car.rarity === 'epic' || car.rarity === 'legendary' ? look.glow : '#000', shadowRadius: 12, shadowOpacity: 0.6, shadowOffset: { width: 0, height: 4 } }}>
          <View style={{ flex: 1, overflow: 'hidden', borderRadius: 3.6 * u, borderWidth: Math.max(0.5, 0.3 * u), borderColor: photo.tone === 'light' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)' }}>
            <LinearGradient colors={t.ground} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: C.photo.height * u, overflow: 'hidden' }}>
              <Photo car={car} />
              <LinearGradient colors={[`${t.ground[1]}00`, `${t.ground[1]}00`, t.ground[1]]} locations={[0, 0.72, 1]} style={StyleSheet.absoluteFill} />
            </View>
            <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 22 * u }} />
            <View style={{ position: 'absolute', left: C.pad * u, right: C.pad * u, top: 5.6 * u, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T size={3.4 * u} lh={4 * u} weight={600} color="#F5F6F8">
                Detlio<T size={3.4 * u} weight={600} color="#E4002B">.</T>
                <T size={3.4 * u} weight={500} color="rgba(245,246,248,0.75)">{' Garage'}</T>
              </T>
              <T num size={3.4 * u} lh={4 * u} weight={600} color="rgba(245,246,248,0.85)">
                {cardNumber(car.number, car.total)}
              </T>
            </View>
            <View style={{ position: 'absolute', left: C.pad * u, right: C.pad * u, top: C.pill.top * u, flexDirection: 'row', alignItems: 'center', gap: 1.6 * u }}>
              <View style={{ height: C.pill.height * u, paddingHorizontal: 2.4 * u, borderRadius: 999, justifyContent: 'center', backgroundColor: look.pill }}>
                <T size={C.pill.size * u} lh={C.pill.height * u} weight={700} uppercase tracking={0.12} color={look.ink}>
                  {car.rarityLabel}
                </T>
              </View>
              {copies ? (
                <T num size={3 * u} lh={4 * u} weight={600} color={t.sub}>
                  {copies}
                </T>
              ) : null}
            </View>
            <T size={C.name.size * u} lh={C.name.line * u} weight={700} tracking={-0.035} numberOfLines={1} color={t.ink} style={{ position: 'absolute', left: C.pad * u, right: C.pad * u, top: C.name.top * u }}>
              {car.name}
            </T>
            <View style={{ position: 'absolute', left: C.pad * u, right: C.pad * u, top: C.chips.top * u, flexDirection: 'row', flexWrap: 'wrap', gap: C.chips.gap * u }}>
              {[
                { Icon: IconDroplet, text: car.colour },
                { Icon: IconMapPin, text: car.setting },
              ].map(({ Icon, text }) => (
                <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: u, height: C.chips.height * u, paddingHorizontal: 2.2 * u, borderRadius: 999, backgroundColor: t.chipBg, borderWidth: Math.max(0.5, 0.28 * u), borderColor: t.chipEdge }}>
                  <Icon size={3 * u} stroke={2} color={t.sub} />
                  <T size={C.chips.size * u} lh={C.chips.height * u} weight={500} numberOfLines={1} color={t.chipText}>
                    {text}
                  </T>
                </View>
              ))}
            </View>
            <T size={C.lore.size * u} lh={C.lore.line * u} numberOfLines={C.lore.lines} color={t.sub} style={{ position: 'absolute', left: C.pad * u, right: C.pad * u, top: C.lore.top * u, fontStyle: 'italic' }}>
              {car.lore}
            </T>
            <T size={C.foot.size * u} lh={3.2 * u} uppercase tracking={0.08} color={t.muted} style={{ position: 'absolute', left: C.pad * u, right: C.pad * u, top: C.foot.top * u }}>
              {`Series ${car.series} · Detlio Garage`}
            </T>
            {/* No sweep of light on the cards (the finish: the owner rejected the shine); the brushed frame stays. */}
            <Sheen rarity={car.rarity} u={u} on={shine && !FINISH_NO_SHEEN} />
          </View>
        </LinearGradient>
      )}
    </Sized>
  );
}

export function IllustrationLine({ small = false }: { small?: boolean }) {
  const colors = useColors();
  return (
    <T size={small ? 9 : 11} lh={small ? 12 : 15} align="center" color={colors.textMuted}>
      {ILLUSTRATION_LINE}
    </T>
  );
}

/** An album tile: an owned card's photo, or one not collected yet, darkened, with its number and "?". */
export function GarageTile({ car }: { car: GarageAlbumCar }) {
  return (
    <Sized aspect={132}>
      {(u) => (
        <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} colors={metal(car.rarity)} locations={[0, 0.28, 0.52, 0.78, 1]} style={{ flex: 1, borderRadius: 9 * u, padding: 3 * u, opacity: car.owned ? 1 : 0.45 }}>
          <View style={{ flex: 1, overflow: 'hidden', borderRadius: 7 * u, backgroundColor: '#0B0C0F' }}>
            <Image blurRadius={car.owned ? 0 : 6} source={cardPhotoSource(cardPhoto(car.photoId).file)} accessibilityIgnoresInvertColors resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }, !car.owned && { opacity: 0.38 }]} />
            <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent', 'transparent', 'rgba(0,0,0,0.88)']} locations={[0, 0.3, 0.45, 1]} style={StyleSheet.absoluteFill} />
            <T num size={15 * u} lh={17 * u} weight={600} color={car.owned ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)'} style={{ position: 'absolute', left: 9 * u, top: 8 * u }}>
              {String(car.number).padStart(2, '0')}
            </T>
            {car.owned ? (
              <>
                <T size={11.5 * u} lh={13 * u} weight={600} tracking={-0.02} numberOfLines={2} color="#FFFFFF" style={{ position: 'absolute', left: 8 * u, right: 6 * u, bottom: 8 * u }}>
                  {car.name}
                </T>
                {car.count > 1 ? (
                  <T num size={12 * u} lh={14 * u} weight={600} color="rgba(255,255,255,0.85)" style={{ position: 'absolute', right: 8 * u, top: 8 * u }}>
                    {`×${car.count}`}
                  </T>
                ) : null}
              </>
            ) : (
              <T size={18 * u} lh={22 * u} weight={700} align="center" color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 0, right: 0, top: '42%' }}>
                ?
              </T>
            )}
          </View>
        </LinearGradient>
      )}
    </Sized>
  );
}

/** The back of a card: the same for every rarity, so the flip gives nothing away. */
export function GarageCardBack({ width }: { width?: number }) {
  return (
    <Sized aspect={C.height} fixed={width}>
      {(u) => (
        <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} colors={['#5B606A', '#2A2D33', '#8C929C', '#23262B', '#50555E']} locations={[0, 0.3, 0.55, 0.8, 1]} style={{ flex: 1, borderRadius: C.radius * u, padding: C.frame * u }}>
          <View style={{ flex: 1, overflow: 'hidden', borderRadius: 3.6 * u, backgroundColor: '#121317' }}>
            <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 100 ${C.height}`}>
              {Array.from({ length: 40 }, (_, i) => (
                <Circle key={i} cx={50} cy={71} r={2.2 * (i + 1)} stroke="rgba(255,255,255,0.05)" strokeWidth={0.4} fill="none" />
              ))}
              <Circle cx={50} cy={71} r={28} stroke="rgba(255,255,255,0.14)" strokeWidth={0.5} fill="none" />
            </Svg>
            <T size={9 * u} lh={10 * u} weight={700} tracking={-0.04} align="center" color="#F5F6F8" style={{ position: 'absolute', left: 0, right: 0, top: 62 * u }}>
              Detlio<T size={9 * u} weight={700} color="#E4002B">.</T>
            </T>
            <T size={3.2 * u} lh={4 * u} weight={600} uppercase tracking={0.4} align="center" color="#9EA3AD" style={{ position: 'absolute', left: 0, right: 0, top: 74 * u }}>
              Garage
            </T>
          </View>
        </LinearGradient>
      )}
    </Sized>
  );
}

/** The picture a share makes: "Collected on Detlio", the card, the line, the pill. */
export function GarageSharePicture({ car, format, firstName }: { car: GarageOwnedCar; format: 'story' | 'post'; firstName: string | null }) {
  const k = 1 / 3;
  const layout = format === 'story' ? { h: 1920, card: 760, top: 400, heading: 250, pillGap: 120, pill: 96, font: 38, kicker: 30, big: 76, line: 26, lineGap: 58 } : { h: 1350, card: 620, top: 196, heading: 118, pillGap: 74, pill: 80, font: 32, kicker: 26, big: 60, line: 22, lineGap: 40 };
  const kicker = `${firstName ? `${firstName}’s Garage` : 'Detlio Garage'} · ${car.rarityLabel}`;
  const cardHeight = (layout.card * k * C.height) / 100;
  return (
    <LinearGradient colors={['#1C1D22', '#050506']} style={{ width: 1080 * k, height: layout.h * k, alignItems: 'center' }}>
      <T size={layout.kicker * k} lh={layout.kicker * k * 1.3} weight={600} uppercase color="#9EA3AD" style={{ position: 'absolute', top: (layout.heading - 90) * k }}>
        {kicker}
      </T>
      <T size={layout.big * k} lh={layout.big * k * 1.2} weight={700} color="#F5F6F8" style={{ position: 'absolute', top: (layout.heading - 50) * k }}>
        Collected on Detlio
      </T>
      <View style={{ marginTop: layout.top * k }}>
        <GarageCard car={car} shine={false} width={layout.card * k} />
      </View>
      <T size={layout.line * k} lh={layout.line * k * 1.3} weight={500} color="rgba(200,204,212,0.75)" style={{ position: 'absolute', top: layout.top * k + cardHeight + (layout.lineGap - 20) * k }}>
        {ILLUSTRATION_LINE}
      </T>
      <SharePill height={layout.pill * k} font={layout.font * k} marginTop={layout.pillGap * k} />
    </LinearGradient>
  );
}
