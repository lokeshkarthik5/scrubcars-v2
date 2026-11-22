import { formatWhen } from '@repo/core/format';
import { bringGarageRowLabel, referralAmountLabel } from '@repo/core/bring-garage';
import { useT, useTn } from '@repo/core/i18n';
import type { Booking, Vehicle } from '@repo/core/types';
import {
  IconArrowUpRight,
  IconCalendar,
  IconChevronRight,
  IconHeart,
  IconPlus,
  IconTicket,
  IconTrash,
  IconWallet,
  type IconProps,
} from '@repo/native-ui/icons';
import { Disc, HubCard, PressRow } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { ctaGradient } from '@repo/native-ui/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { NumberPlate } from '@/components/moments/number-plate';

/**
 * Profile in the Home look (22 Nov 2026): the parts the screen is built from, as the
 * website's apps/users/components/profile/profile-hub.tsx. Every row Profile had is still
 * there; these only change how it looks.
 */

type Icon = (props: IconProps) => ReactElement;

/** Three quiet figures under the name: bookings, garages tried, cars. */
export function ProfileStats({ items }: { items: { value: number; label: string }[] }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.stats}>
      {items.map((item, i) => (
        <View key={item.label} style={[styles.stat, i > 0 && styles.statLine]}>
          <T num size={26} weight={300} lh={30} tracking={-0.02}>
            {String(item.value)}
          </T>
          <T size={12} lh={16} color={colors.dim}>
            {item.label}
          </T>
        </View>
      ))}
    </View>
  );
}

function Tile({ label, icon: TileIcon, href, wide, children }: { label: string; icon: Icon; href: string; wide?: boolean; children: ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <PressRow onPress={() => router.push(href as Href)} style={wide ? styles.tileWide : styles.tileWrap}>
      <HubCard style={styles.tile}>
        <View style={styles.tileHead}>
          <T size={13} numberOfLines={2} color={colors.dim} style={styles.shrink}>
            {label}
          </T>
          <Disc>
            <TileIcon size={20} stroke={1.5} />
          </Disc>
        </View>
        {children}
      </HubCard>
    </PressRow>
  );
}

function TileFigure({ value, line }: { value: string; line: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.tileFoot}>
      <T num size={40} weight={300} lh={42} tracking={-0.035}>
        {value}
      </T>
      <T size={12} lh={16} numberOfLines={2} color={colors.dim} style={styles.tileLine}>
        {line}
      </T>
    </View>
  );
}

/**
 * The tiles under the car: My bookings, Saved garages, Detlio credit (while gifts are on)
 * and Coupons, two to a row. With three, the last spans the row. The website's ProfileTiles.
 */
export function ProfileTiles({
  bookings,
  saved,
  credit,
  coupons,
}: {
  bookings: { count: number | null; next: Booking | null };
  saved: { count: number | null; photos: string[] };
  credit: { label: string | null } | null;
  coupons: number;
}) {
  const t = useT();
  const tn = useTn();
  const colors = useColors();
  const styles = useStyles();
  const tiles: { key: string; href: string; label: string; icon: Icon; body: ReactNode }[] = [
    {
      key: 'bookings',
      href: '/bookings',
      label: t('My bookings'),
      icon: IconCalendar,
      body: (
        <TileFigure
          value={bookings.count === null ? '–' : String(bookings.count)}
          line={bookings.next ? t('Next: {when}', { when: formatWhen(bookings.next.scheduledAt) }) : t('None coming up')}
        />
      ),
    },
    {
      key: 'saved',
      href: '/profile/saved-garages',
      label: t('Saved garages'),
      icon: IconHeart,
      body:
        saved.photos.length > 0 ? (
          <View style={styles.tileFoot}>
            <View style={styles.faces}>
              {saved.photos.slice(0, 3).map((uri, i) => (
                <Image key={uri} source={{ uri }} style={[styles.face, i > 0 && styles.faceOverlap]} />
              ))}
            </View>
            <T size={12} lh={16} color={colors.dim} style={styles.tileLine}>
              {tn(saved.count ?? 0, '{count} saved', '{count} saved')}
            </T>
          </View>
        ) : (
          <TileFigure
            value={saved.count === null ? '–' : String(saved.count)}
            line={saved.count ? t('Tap to see them') : t('Tap ♡ on a garage to save it')}
          />
        ),
    },
  ];
  if (credit) {
    tiles.push({
      key: 'credit',
      href: '/profile/credit',
      label: t('Detlio credit'),
      icon: IconWallet,
      body: <TileFigure value={credit.label ?? '–'} line={t('Used on your next booking')} />,
    });
  }
  tiles.push({
    key: 'coupons',
    href: '/profile/coupons',
    label: t('Coupons'),
    icon: IconTicket,
    body: <TileFigure value={String(coupons)} line={t('Have a coupon? Add it here')} />,
  });
  const rows: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row[0]!.key} style={styles.gridRow}>
          {row.map((tile) => (
            <Tile key={tile.key} href={tile.href} label={tile.label} icon={tile.icon} wide={row.length === 1}>
              {tile.body}
            </Tile>
          ))}
        </View>
      ))}
    </View>
  );
}

/** One card of rows, with a soft square icon and a chevron each. */
export function HubList({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <HubCard radius={22} style={styles.list}>
      {children}
    </HubCard>
  );
}

export function RowIcon({ icon: RowGlyph }: { icon: Icon }) {
  const styles = useStyles();
  return (
    <View style={styles.rowIcon}>
      <RowGlyph size={16} stroke={1.6} />
    </View>
  );
}

export function HubRow({
  icon,
  label,
  sub,
  value,
  onPress,
  first,
  accessibilityRole = 'button',
}: {
  icon: Icon;
  label: string;
  sub?: ReactNode;
  value?: ReactNode;
  onPress: () => void;
  /** The first row has no line above it. */
  first?: boolean;
  accessibilityRole?: 'button' | 'link';
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole={accessibilityRole} accessibilityLabel={label} onPress={onPress} style={[styles.row, !first && styles.rowLine]}>
      <RowIcon icon={icon} />
      <View style={styles.flex}>
        <T size={15} lh={20}>
          {label}
        </T>
        {sub ? (
          <T size={12} lh={16} color={colors.dim}>
            {sub}
          </T>
        ) : null}
      </View>
      {typeof value === 'string' ? (
        <T size={13} lh={18} color={colors.dim}>
          {value}
        </T>
      ) : (
        value
      )}
      <IconChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

/** A section's small grey heading. */
export function HubSectionHead({ title }: { title: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <T accessibilityRole="header" size={13} lh={18} color={colors.dim} style={styles.sectionHead}>
      {title}
    </T>
  );
}

/** The outline pill (Add a car, Add address, Edit car). */
export function HubPill({ children, onPress, accessibilityLabel, grow = true }: { children: ReactNode; onPress: () => void; accessibilityLabel?: string; grow?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={[styles.pill, grow && styles.flex]}>
      {children}
    </Pressable>
  );
}

/**
 * "Your garage": a card per car with its plate drawn large in place of a picture (owner,
 * 22 Nov 2026: Home already shows the car). Two or more swipe sideways, with dots. A car with
 * no plate shows a dashed "Add number plate" that opens Edit. The website's CarCards.
 */
export function CarCards({
  vehicles,
  promoting,
  deleting,
  onEdit,
  onRemove,
  onMakeDefault,
}: {
  vehicles: Vehicle[];
  promoting: string | null;
  deleting: string | null;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onMakeDefault: (id: string) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const [shown, setShown] = useState(0);
  const many = vehicles.length > 1;
  // The screen's 16pt gutters; each card is a page, with a 12pt gap the next one peeks across.
  const cardWidth = width - 32;

  const cards = vehicles.map((v) => (
    <HubCard key={v.id} style={[styles.car, many && { width: cardWidth }]}>
      <View style={styles.carHead}>
        <T size={13} lh={18} color={colors.dim}>
          {t('Your garage')}
        </T>
        {v.isDefault ? (
          <View style={styles.defaultTag}>
            <T size={12} lh={16} color="#4ADE80">
              {t('Default')}
            </T>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Make {make} {model} the default vehicle', { make: v.make, model: v.model })}
            disabled={promoting === v.id}
            onPress={() => onMakeDefault(v.id)}
            hitSlop={10}
          >
            <T size={12} lh={16} color={colors.dim}>
              {promoting === v.id ? t('Setting...') : t('Set default')}
            </T>
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('{make} {model}: history', { make: v.make, model: v.model })}
        onPress={() => router.push(`/profile/cars/${v.id}` as Href)}
        style={styles.carName}
      >
        <T size={28} weight={300} lh={34} tracking={-0.025} numberOfLines={1} style={styles.shrink}>
          {`${v.make} ${v.model}`}
        </T>
        <View style={styles.history}>
          <T size={12} lh={16} color={colors.dim}>
            {t('History')}
          </T>
          <IconChevronRight size={14} color={colors.dim} />
        </View>
      </Pressable>
      {v.plate ? (
        <View style={styles.plate}>
          <NumberPlate plate={v.plate} size="lg" />
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => onEdit(v.id)} style={styles.noPlate}>
          <IconPlus size={16} color={colors.dim} />
          <T size={13} lh={18} color={colors.dim}>
            {t('Add number plate')}
          </T>
        </Pressable>
      )}
      <View style={styles.carActions}>
        <HubPill onPress={() => onEdit(v.id)} accessibilityLabel={t('Edit {make} {model}', { make: v.make, model: v.model })}>
          <T size={13} lh={18}>
            {t('Edit car')}
          </T>
        </HubPill>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Remove {make} {model}', { make: v.make, model: v.model })}
          disabled={deleting === v.id}
          onPress={() => onRemove(v.id)}
          style={[styles.bin, deleting === v.id && styles.dimmed]}
        >
          <IconTrash size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </HubCard>
  ));

  if (!many) return <View>{cards}</View>;
  return (
    <View style={styles.cars}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        contentContainerStyle={styles.carsRail}
        style={styles.carsScroll}
        onScroll={(e) => setShown(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12)))}
        scrollEventThrottle={32}
        accessibilityLabel={t('Your cars')}
      >
        {cards}
      </ScrollView>
      <View style={styles.dots} importantForAccessibility="no-hide-descendants">
        {vehicles.map((v, i) => (
          <View key={v.id} style={[styles.dot, i === shown && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

/** The faint street lines with a red pin, over the addresses. Decoration only. */
export function AddressMapBand() {
  const styles = useStyles();
  return (
    <View style={styles.map} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width="100%" height="100%" viewBox="0 0 360 104" preserveAspectRatio="none">
        {['M0 28 C80 38 140 8 360 22', 'M0 78 C100 68 200 92 360 72', 'M60 0 C70 40 50 68 80 104', 'M200 0 C190 50 230 68 210 104', 'M300 0 L280 104', 'M120 0 L135 104'].map((d) => (
          <Path key={d} d={d} stroke="rgba(255,255,255,0.08)" strokeWidth={1.2} fill="none" />
        ))}
        <Path d="M0 52 L360 48" stroke="rgba(255,255,255,0.14)" strokeWidth={3} fill="none" />
      </Svg>
      <View style={styles.pinGlow} />
      <View style={styles.pin} />
    </View>
  );
}

/**
 * Bring your garage in the Home look: the one red card on Profile, opening the Recommend
 * sheet. Named as the old row ("Bring your garage · Get ₹500"). The website's BringGarageHubCard.
 */
export function BringGarageHubCard({ onPress }: { onPress: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const amount = referralAmountLabel();
  return (
    <PressRow onPress={onPress} accessibilityLabel={bringGarageRowLabel()}>
      <View style={styles.bring}>
        <LinearGradient
          colors={['#2A0710', '#160609', '#141416']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
          pointerEvents="none"
        />
        <View style={styles.bringText}>
          <T size={13} lh={18} color="#FDA4B4">
            {t('Bring your garage')}
          </T>
          <T size={22} lh={28} tracking={-0.01} style={styles.bringTitle}>
            {t('Get {amount} credit', { amount })}
          </T>
          <T size={13} lh={18} color={colors.dim}>
            {t('Know a good garage? Bring it to Detlio. You get it when they join and you book them.')}
          </T>
        </View>
        <View style={styles.bringGo}>
          <LinearGradient {...ctaGradient} colors={[...ctaGradient.colors]} locations={[...ctaGradient.locations]} style={styles.fill} />
          <IconArrowUpRight size={22} color="#FFFFFF" stroke={1.75} />
        </View>
      </View>
    </PressRow>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dimmed: { opacity: 0.4 },
  stats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.line },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLine: { borderLeftWidth: 1, borderLeftColor: c.line },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  tileWrap: { flex: 1, minWidth: 0 },
  tileWide: { flex: 1 },
  tile: { flex: 1, minHeight: 150, paddingTop: 14, paddingRight: 14, paddingBottom: 18, paddingLeft: 20 },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tileFoot: { marginTop: 'auto', paddingTop: 12 },
  tileLine: { marginTop: 6 },
  faces: { flexDirection: 'row' },
  face: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#17171A' },
  faceOverlap: { marginLeft: -10 },
  list: { paddingVertical: 4, overflow: 'hidden' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: c.line },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.disc },
  sectionHead: { paddingHorizontal: 4, paddingTop: 8 },
  pill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.disc, paddingHorizontal: 16 },
  cars: { gap: 12 },
  carsScroll: { marginHorizontal: -16 },
  carsRail: { gap: 12, paddingHorizontal: 16 },
  car: { padding: 20 },
  carHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  defaultTag: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', paddingHorizontal: 8, paddingVertical: 2 },
  carName: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  history: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  plate: { marginTop: 12 },
  noPlate: { marginTop: 12, height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.22)' },
  carActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  bin: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line, backgroundColor: c.disc },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#444444' },
  dotOn: { width: 18, backgroundColor: '#DDDDDD' },
  map: { height: 104, marginTop: -20, marginHorizontal: -20, marginBottom: 16, backgroundColor: '#101012', overflow: 'hidden', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  pinGlow: { position: 'absolute', top: 40, left: '50%', marginLeft: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(228,0,43,0.22)' },
  pin: { position: 'absolute', top: 44, left: '50%', marginLeft: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: '#E4002B' },
  bring: { minHeight: 132, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(228,0,43,0.35)', overflow: 'hidden', paddingVertical: 18, paddingLeft: 20, paddingRight: 84 },
  bringText: { gap: 4 },
  bringTitle: { marginTop: 2 },
  bringGo: { position: 'absolute', right: 18, bottom: 18, width: 52, height: 52, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
}));
