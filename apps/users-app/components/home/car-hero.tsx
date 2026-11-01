import type { HomeCar } from '@repo/core/api/home';
import { rewardRupees } from '@repo/core/rewards';
import { ScButton } from '@repo/native-ui/button';
import { IconArrowUpRight, IconCheck, IconChevronDown, IconHistory, IconPencil, IconPlus } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

const TYPE_LABEL: Record<HomeCar['vehicleType'], string> = { hatchback: 'Hatchback', sedan: 'Sedan', suv: 'SUV' };

/** "TN 09 BX 4821 · White SUV". */
export function carLine(car: Pick<HomeCar, 'licensePlate' | 'color' | 'vehicleType'>): string {
  const kind = [car.color, TYPE_LABEL[car.vehicleType]].filter(Boolean).join(' ');
  return [car.licensePlate, kind].filter(Boolean).join(' · ');
}

/** "2 more washes = ₹349 off", or "₹349 off ready" once the card is full. */
export function shineLine(toGo: number, rewardAmount: string | number): string {
  const reward = `${rewardRupees(rewardAmount)} off`;
  return toGo <= 0 ? `${reward} ready` : `${toGo} more ${toGo === 1 ? 'wash' : 'washes'} = ${reward}`;
}

// The owner-approved body-type pictures (packages/core car-images.ts), shared canvas 1200 × 432.
const PICTURES = {
  hatchback: require('../../assets/cars/car-hatchback-1200.webp'),
  sedan: require('../../assets/cars/car-sedan-1200.webp'),
  suv: require('../../assets/cars/car-suv-1200.webp'),
};
const DEFAULT_PICTURE = require('../../assets/cars/car-default.png');

function Stage({ short, empty, width }: { short: boolean; empty?: boolean; width: number }) {
  const colors = useColors();
  const { scheme } = useTheme();
  const glowTop = short ? 84 : 92;
  const glowHeight = short ? 160 : 180;
  const light = scheme === 'light';
  return (
    <>
      <LinearGradient
        colors={[colors.stage[0], colors.stage[1], colors.stage[2]]}
        locations={light ? [0, 0.58, 1] : [0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: glowTop, height: glowHeight, opacity: empty ? 0.55 : 1 }}>
        <Svg width={width} height={glowHeight}>
          <Defs>
            <RadialGradient id={`stage-${scheme}`} cx="50%" cy={light ? '78%' : '56%'} rx="60%" ry={light ? '40%' : '48%'}>
              <Stop offset="0" stopColor={colors.stageGlow} stopOpacity={light ? 0.1 : 0.15} />
              <Stop offset={light ? '0.6' : '0.55'} stopColor={colors.stageGlow} stopOpacity={light ? 0.03 : 0.04} />
              <Stop offset={light ? '0.78' : '0.75'} stopColor={colors.stageGlow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={width / 2} cy={glowHeight * (light ? 0.78 : 0.56)} rx={width * 0.6} ry={glowHeight * 0.6} fill={`url(#stage-${scheme})`} />
        </Svg>
      </View>
    </>
  );
}

function Contact({ top, left, right }: { top: number; left: number; right: number }) {
  const colors = useColors();
  const { scheme } = useTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top, left, right, height: 16 }}>
      <Svg width="100%" height={16}>
        <Defs>
          <RadialGradient id={`contact-${scheme}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.stageContact} stopOpacity={scheme === 'light' ? 0.28 : 0.65} />
            <Stop offset="1" stopColor={colors.stageContact} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy={8} rx="50%" ry={8} fill={`url(#contact-${scheme})`} />
      </Svg>
    </View>
  );
}

/** Round 40pt disc in a 44pt target, on the car's stage. */
function StageDisc({ label, right, onPress, children }: { label: string; right: number; onPress: () => void; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={[styles.discHit, { right }]}>
      <View style={styles.disc}>{children}</View>
    </Pressable>
  );
}

interface Shine {
  onCard: number;
  goal: number;
  toGo: number;
  rewardAmount: string | number;
}

/** CarHero (apps/users/components/home/car-hero.tsx): the car and the screen's main action. */
export function CarHero({
  cars,
  selected,
  onSelect,
  short,
  quiet,
  onBookWash,
  onAddCar,
  shine = null,
}: {
  cars: HomeCar[];
  selected: number;
  onSelect: (index: number) => void;
  short: boolean;
  quiet: boolean;
  onBookWash: (car: HomeCar) => void;
  onAddCar: () => void;
  shine?: Shine | null;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { width: screen } = useWindowDimensions();
  const width = screen - 32;
  const [choosing, setChoosing] = useState(false);

  if (cars.length === 0) {
    const pictureWidth = width * 0.92;
    return (
      <View accessibilityLabel="Your car" style={[styles.hero, { height: short ? 294 : 314 }]}>
        <Stage short={short} empty width={width} />
        <View style={styles.head}>
          <T size={13} color={colors.dim}>
            Get started
          </T>
          <T size={34} weight={300} lh={37} tracking={-0.03} style={styles.title}>
            Add your car
          </T>
          <T size={15} lh={21} color={colors.textSoft} style={styles.emptyLine}>
            So garages quote the right price, and you&apos;ll see when it&apos;s due.
          </T>
        </View>
        <Contact top={236} left={width * 0.12} right={width * 0.12} />
        <Image
          source={DEFAULT_PICTURE}
          resizeMode="contain"
          style={[styles.ghost, { left: width * 0.04, width: pictureWidth, height: (pictureWidth * 262) / 898 }]}
        />
        <View style={styles.cta}>
          {quiet ? (
            <ScButton variant="quiet" onPress={onAddCar}>
              Add car
            </ScButton>
          ) : (
            <ScButton variant="hero" onPress={onAddCar}>
              <T size={15} weight={500} lh={20} color={colors.white}>
                Add car
              </T>
              <IconPlus size={17} stroke={1.5} color={colors.white} />
            </ScButton>
          )}
        </View>
      </View>
    );
  }

  const car = cars[Math.min(selected, cars.length - 1)];
  const name = `${car.make} ${car.model}`;
  const height = shine ? (short ? 338 : 358) : short ? 294 : 314;
  const pictureWidth = Math.min(width * (short ? 0.84 : 0.94), short ? 316 : 352);
  const pictureHeight = (pictureWidth * 432) / 1200;
  const tyreLine = short ? 201 : 217;

  return (
    <View accessibilityLabel="Your car" style={[styles.hero, { height }]}>
      <Stage short={short} width={width} />
      <View style={[styles.head, cars.length === 1 && styles.headTwoDiscs]}>
        <T size={13} color={colors.dim}>
          Your car
        </T>
        {cars.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}, switch car`}
            onPress={() => setChoosing(true)}
            style={styles.switch}
          >
            <T size={34} weight={300} lh={37} tracking={-0.03} numberOfLines={1} style={styles.shrink}>
              {name}
            </T>
            <IconChevronDown size={22} stroke={1.5} color={colors.dim} />
          </Pressable>
        ) : (
          <T size={34} weight={300} lh={37} tracking={-0.03} numberOfLines={1} style={styles.title}>
            {name}
          </T>
        )}
        {carLine(car) ? (
          <T size={13} numberOfLines={1} color={colors.dim}>
            {carLine(car)}
          </T>
        ) : null}
      </View>
      <Contact top={short ? 196 : 212} left={width * (short ? 0.16 : 0.12)} right={width * (short ? 0.16 : 0.12)} />
      <Image
        source={PICTURES[car.vehicleType] ?? DEFAULT_PICTURE}
        resizeMode="contain"
        style={{
          position: 'absolute',
          top: tyreLine - pictureHeight * 0.907,
          left: (width - pictureWidth) / 2,
          width: pictureWidth,
          height: pictureHeight,
        }}
      />
      <StageDisc
        label={`History of your ${name}`}
        right={cars.length === 1 ? 60 : 12}
        onPress={() => router.push(`/profile/cars/${car.id}` as Href)}
      >
        <IconHistory size={20} stroke={1.5} />
      </StageDisc>
      {cars.length === 1 ? (
        <StageDisc label="Add or edit cars" right={12} onPress={() => router.navigate('/profile' as Href)}>
          <IconPencil size={20} stroke={1.5} />
        </StageDisc>
      ) : null}
      {shine ? (
        <PressRow
          accessibilityLabel={`Shine Card: ${shine.onCard} of ${shine.goal} stamps. ${shineLine(shine.toGo, shine.rewardAmount)}.`}
          onPress={() => router.push('/profile/rewards' as Href)}
          style={styles.shine}
        >
          <View style={styles.shineLeft}>
            <T size={13} color={colors.dim}>
              Shine Card
            </T>
            <View style={styles.stamps}>
              {Array.from({ length: shine.goal }, (_, i) => (
                <View key={i} style={[styles.stamp, { backgroundColor: i < shine.onCard ? colors.meterOn : colors.meterOff }]} />
              ))}
            </View>
          </View>
          <T size={13} lh={17} align="right" style={styles.shineRight}>
            <Figures text={shineLine(shine.toGo, shine.rewardAmount)} size={13} lh={17} />
          </T>
        </PressRow>
      ) : null}
      <View style={styles.cta}>
        {quiet ? (
          <ScButton variant="quiet" onPress={() => onBookWash(car)}>
            Book a wash
          </ScButton>
        ) : (
          <ScButton variant="hero" onPress={() => onBookWash(car)}>
            <T size={15} weight={500} lh={20} color={colors.white}>
              Book a wash
            </T>
            <IconArrowUpRight size={17} stroke={1.5} color={colors.white} />
          </ScButton>
        )}
      </View>

      <ScSheet open={choosing} onClose={() => setChoosing(false)} accessibilityLabel="Choose a car" horizontalPadding={16}>
        <T size={20} lh={28} tracking={-0.015}>
          Your cars
        </T>
        <View style={styles.cars}>
          {cars.map((each, i) => (
            <PressRow
              key={each.id}
              onPress={() => {
                onSelect(i);
                setChoosing(false);
              }}
              style={[styles.carRow, i === selected ? styles.carRowOn : styles.carRowOff]}
            >
              <View style={styles.shrink}>
                <T size={15} numberOfLines={1}>
                  {each.make} {each.model}
                </T>
                <T size={13} numberOfLines={1} color={colors.dim}>
                  {carLine(each)}
                </T>
              </View>
              {i === selected ? <IconCheck size={18} stroke={1.8} /> : null}
            </PressRow>
          ))}
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              setChoosing(false);
              router.navigate('/profile' as Href);
            }}
            style={styles.addEdit}
          >
            <T size={15}>Add or edit cars</T>
          </Pressable>
        </View>
      </ScSheet>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  hero: { overflow: 'hidden', borderRadius: 28, borderWidth: 1, borderColor: c.line },
  head: { paddingTop: 20, paddingLeft: 20, paddingRight: 64 },
  headTwoDiscs: { paddingRight: 108 },
  title: { marginTop: 6, marginBottom: 8 },
  emptyLine: { maxWidth: 268 },
  ghost: { position: 'absolute', top: 150, opacity: c.scheme === 'light' ? 0.4 : 0.35 },
  switch: { marginTop: 6, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  shrink: { flexShrink: 1, minWidth: 0 },
  discHit: { position: 'absolute', top: 18, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  shine: { position: 'absolute', left: 20, right: 20, bottom: 78, minHeight: 44, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  shineLeft: { gap: 6, minWidth: 0 },
  stamps: { flexDirection: 'row', gap: 6 },
  stamp: { width: 24, height: 4, borderRadius: 2 },
  shineRight: { maxWidth: 200, flexShrink: 1 },
  cta: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  cars: { marginTop: 16, gap: 8 },
  carRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16 },
  carRowOn: { borderColor: c.textPrimary, backgroundColor: c.disc },
  carRowOff: { borderColor: c.line },
  addEdit: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
}));
