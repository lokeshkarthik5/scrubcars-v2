import { categoryLabel } from '@repo/core/categories';
import { tierPriceFor } from '@repo/core/pricing';
import { cardThumbnail, customerMedia, formatClipLength, serviceIconFor, type ServiceIcon } from '@repo/core/service-media';
import { cardPointsLine, parseServiceDescription, sheetPoints } from '@repo/core/service-points';
import type { Service, ServicePackage, VehicleType } from '@repo/core/types';
import { formatDuration } from '@repo/core/utils';
import { VEHICLE_TIERS } from '@repo/core/vehicles';
import { ScButton } from '@repo/native-ui/button';
import {
  IconBrush,
  IconCheck,
  IconClock,
  IconDroplets,
  IconMotorbike,
  IconPackage,
  IconPlus,
  IconShieldCheck,
  IconSparkles,
  IconTool,
  type IconProps,
} from '@repo/native-ui/icons';
import { PressRow, ScCard } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useTheme } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactElement } from 'react';
import { Image, Pressable, View } from 'react-native';

import { addOnCountLabel, addOnTimeLabel, type AddOn } from '@/lib/add-ons';
import { money, pricedForCar, servicePriceText } from '@/lib/price';

export const isPackage = (item: Service | ServicePackage): item is ServicePackage => 'items' in item;

const ICONS: Record<ServiceIcon, (props: IconProps) => ReactElement> = {
  wash: IconDroplets,
  detailing: IconSparkles,
  coating: IconShieldCheck,
  scratch: IconBrush,
  bike: IconMotorbike,
  package: IconPackage,
  others: IconTool,
};
const TINTS: Record<ServiceIcon, [string, string]> = {
  wash: ['#1B3150', '#0E1726'],
  detailing: ['#4A3518', '#1F170C'],
  coating: ['#123C30', '#0A1C17'],
  scratch: ['#4A3518', '#1F170C'],
  bike: ['#3A2A48', '#181220'],
  package: ['#4B1A20', '#200C0F'],
  others: ['#2C2C34', '#151519'],
};

function IconTile({ service, size = 64 }: { service: Pick<Service, 'category' | 'name'>; size?: number }) {
  const { scheme } = useTheme();
  const styles = useStyles();
  const kind = serviceIconFor(service.category, service.name);
  const Icon = ICONS[kind];
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      {scheme === 'dark' ? (
        <LinearGradient colors={TINTS[kind]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileFill}>
          <Icon size={24} stroke={1.5} color="#FAFAFA" />
        </LinearGradient>
      ) : (
        <View style={[styles.tileFill, styles.tilePale]}>
          <Icon size={24} stroke={1.5} />
        </View>
      )}
    </View>
  );
}

/** ServiceThumb: the video's poster with its length, the first photo, or the category icon. */
function ServiceThumb({ service }: { service: Pick<Service, 'media' | 'category' | 'name'> }) {
  const styles = useStyles();
  const thumb = cardThumbnail(customerMedia(service.media));
  if (thumb === null) return <IconTile service={service} />;
  return (
    <View style={[styles.tile, styles.thumb]}>
      <Image source={{ uri: thumb.url }} resizeMode="cover" style={styles.tileFill} />
      {thumb.kind === 'video' && thumb.durationSecs !== null ? (
        <View style={styles.clip}>
          <T num size={11} weight={500} lh={14} color="#FFFFFF">
            {formatClipLength(thumb.durationSecs)}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** ServiceCardLine: its first points ("Foam wash · Vacuum +2"), or the description. */
function CardLine({ description, size, clamp }: { description: string | null; size: number; clamp?: number }) {
  const colors = useColors();
  const styles = useStyles();
  if (!description) return null;
  const line = cardPointsLine(parseServiceDescription(description).points);
  return (
    <T size={size} numberOfLines={clamp} color={colors.textSecondary} style={styles.desc}>
      {line ? line.text : description}
      {line && line.more > 0 ? <T size={size} color={colors.textMuted}>{` +${line.more}`}</T> : null}
    </T>
  );
}

/** AddToBookingButton: graphite, never red, with the hub on; the same width in both states. */
export function AddToBookingButton({ name, added, onToggle }: { name: string; added: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const Icon = added ? IconCheck : IconPlus;
  return (
    <PressRow
      accessibilityLabel={added ? `Remove ${name} from booking` : `Add ${name} to booking`}
      onPress={onToggle}
      style={[styles.add, added && styles.addOn]}
    >
      <Icon size={16} stroke={2.5} />
      <T size={15} weight={500} lh={20}>
        {added ? 'Added' : 'Add'}
      </T>
    </PressRow>
  );
}

export function ServiceCard({
  service,
  added,
  paused,
  carType,
  carModel,
  onOpen,
  onToggle,
}: {
  service: Service;
  added: boolean;
  paused: boolean;
  carType: VehicleType | null;
  carModel: string | null;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <ScCard style={added ? styles.cardAdded : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View details for ${service.name}`} onPress={onOpen} style={styles.cardTop}>
        <ServiceThumb service={service} />
        <View style={styles.flex}>
          <T size={17} lh={22}>
            {service.name}
          </T>
          <T size={15} style={styles.price}>
            <Figures text={servicePriceText(service, carType)} size={15} />
            {pricedForCar(service, carType) && carModel ? (
              <T size={15} color={colors.dim}>{` for your ${carModel}`}</T>
            ) : null}
          </T>
          <CardLine description={service.description} size={13} clamp={2} />
        </View>
      </Pressable>
      <View style={[styles.cardBottom, styles.indent]}>
        <View style={styles.duration}>
          {service.durationMins != null ? (
            <>
              <IconClock size={13} stroke={2} color={colors.textSecondary} />
              <T num size={12} weight={500} color={colors.textSecondary}>
                {formatDuration(service.durationMins)}
              </T>
            </>
          ) : null}
        </View>
        {!paused ? <AddToBookingButton name={service.name} added={added} onToggle={onToggle} /> : null}
      </View>
    </ScCard>
  );
}

export function PackageCard({
  pkg,
  added,
  paused,
  carType,
  onOpen,
  onToggle,
}: {
  pkg: ServicePackage;
  added: boolean;
  paused: boolean;
  carType: VehicleType | null;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <ScCard style={added ? styles.cardAdded : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View details for ${pkg.name}`} onPress={onOpen}>
        <View style={styles.pkgHead}>
          <T size={17} style={styles.flex}>
            {pkg.name}
          </T>
          <View style={styles.pkgPrice}>
            <T size={15}>
              <Figures text={servicePriceText(pkg, carType)} size={15} />
            </T>
            {pkg.tierBreakdown === null && pkg.savings !== null ? (
              <T num size={12} color={colors.textSecondary} style={styles.struck}>
                {money(pkg.itemsTotal)}
              </T>
            ) : null}
          </View>
        </View>
        {pkg.savings !== null ? (
          <View style={styles.save}>
            <T size={12} lh={16}>
              {'Save '}
              <T num size={12} lh={16}>
                {money(pkg.savings)}
                {pkg.tierBreakdown ? '+' : ''}
              </T>
            </T>
          </View>
        ) : null}
        <CardLine description={pkg.description} size={12} />
        <View style={styles.pkgItems}>
          {pkg.items.map((item) => (
            <View key={item.serviceId} style={styles.pkgItem}>
              <IconCheck size={13} stroke={2} color={colors.textSecondary} />
              <T size={12} color={colors.textSecondary} style={styles.flex}>
                {item.name}
              </T>
            </View>
          ))}
        </View>
      </Pressable>
      <View style={styles.cardBottom}>
        <View style={styles.duration}>
          {pkg.durationMins != null ? (
            <>
              <IconClock size={13} stroke={2} color={colors.textSecondary} />
              <T num size={12} weight={500} color={colors.textSecondary}>
                {formatDuration(pkg.durationMins)}
              </T>
            </>
          ) : null}
        </View>
        {!paused ? <AddToBookingButton name={pkg.name} added={added} onToggle={onToggle} /> : null}
      </View>
    </ScCard>
  );
}

function WhatsIncluded({ points, note }: { points: string[]; note: string | null }) {
  const colors = useColors();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  if (points.length === 0) return null;
  const { shown, more } = sheetPoints(points, expanded);
  const foldable = points.length > sheetPoints(points, false).shown.length;
  return (
    <View style={styles.sheetBlock}>
      <T size={11} weight={600} tracking={0.07} uppercase color={colors.textMuted}>
        What&apos;s included
      </T>
      {shown.map((point, i) => (
        <View key={`${i}-${point}`} style={styles.point}>
          <IconCheck size={15} stroke={2} color={colors.success} />
          <T size={14} lh={19} style={styles.flex}>
            {point}
          </T>
        </View>
      ))}
      {foldable ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((on) => !on)} style={styles.fold}>
          <T size={13} weight={500} color={colors.textSecondary}>
            {expanded ? 'Show less' : `+${more} more`}
          </T>
        </Pressable>
      ) : null}
      {note ? (
        <T size={14} color={colors.textSecondary} style={styles.noteLine}>
          {note}
        </T>
      ) : null}
    </View>
  );
}

/** The details sheet. The garage's photo on top; playing a video comes with the media stage. */
export function ServiceSheet({
  details,
  open,
  onClose,
  added,
  paused,
  onToggle,
}: {
  details: Service | ServicePackage | null;
  open: boolean;
  onClose: () => void;
  added: boolean;
  paused: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const media = details ? cardThumbnail(customerMedia(details.media)) : null;
  const parsed = details ? parseServiceDescription(details.description) : null;
  return (
    <ScSheet open={open} onClose={onClose} accessibilityLabel={details ? `${details.name} details` : 'Service details'} horizontalPadding={16}>
      {details ? (
        <>
          {media ? <Image source={{ uri: media.url }} resizeMode="cover" style={styles.sheetPhoto} /> : null}
          <View style={styles.sheetTitleRow}>
            {media ? null : <IconTile service={details} size={48} />}
            <View style={styles.flex}>
              <T size={20} lh={26}>
                {details.name}
              </T>
              <View style={styles.sheetMeta}>
                <View style={styles.categoryChip}>
                  <T size={11} weight={500} lh={15} color={colors.textSecondary}>
                    {categoryLabel(details.category)}
                  </T>
                </View>
                {details.durationMins != null ? (
                  <View style={styles.duration}>
                    <IconClock size={13} stroke={2} color={colors.textSecondary} />
                    <T num size={12} weight={500} color={colors.textSecondary}>
                      {formatDuration(details.durationMins)}
                    </T>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          {parsed?.points.length === 0 ? (
            <T size={13} color={colors.textSecondary} style={styles.sheetBlock}>
              {details.description || `No description available for this ${isPackage(details) ? 'package' : 'service'}.`}
            </T>
          ) : parsed?.intro ? (
            <T size={13} color={colors.textSecondary} style={styles.sheetBlock}>
              {parsed.intro}
            </T>
          ) : null}
          <WhatsIncluded points={parsed?.points ?? []} note={parsed?.note ?? null} />
          {isPackage(details) ? (
            <View style={styles.sheetBlock}>
              <T size={11} weight={500} tracking={0.025} uppercase color={colors.textSecondary}>
                Services in this package
              </T>
              {details.items.map((item) => (
                <View key={item.serviceId} style={styles.pkgItem}>
                  <IconCheck size={13} stroke={2} color={colors.textSecondary} />
                  <T size={13} color={colors.textSecondary} style={styles.flex}>
                    {item.name}
                  </T>
                </View>
              ))}
              {details.tierBreakdown === null && details.savings !== null ? (
                <T size={12} weight={600} style={styles.noteLine}>
                  {'Save '}
                  <T num size={12} weight={700}>{money(details.savings)}</T>
                  {' vs '}
                  <T num size={12} weight={700}>{money(details.itemsTotal)}</T>
                  {' separately'}
                </T>
              ) : null}
            </View>
          ) : null}
          <View style={styles.priceBlock}>
            {details.pricingType === 'per_vehicle' ? (
              <>
                <T size={11} weight={500} tracking={0.025} uppercase color={colors.textSecondary} style={styles.priceHead}>
                  Price by vehicle
                </T>
                {VEHICLE_TIERS.map(({ value: type, label }) => {
                  const price = tierPriceFor(details, type);
                  const tierSavings = isPackage(details) ? (details.tierBreakdown?.[type].savings ?? null) : null;
                  return (
                    <View key={type} style={styles.priceRow}>
                      <T size={13} color={colors.textSecondary}>
                        {label}
                      </T>
                      {price == null ? (
                        <T size={12} color={colors.textMuted}>
                          Price on request
                        </T>
                      ) : (
                        <View style={styles.priceRight}>
                          {tierSavings !== null ? (
                            <T size={11} weight={500} color={colors.textSecondary}>
                              {'save '}
                              <T num size={11} weight={500} color={colors.textSecondary}>{money(tierSavings)}</T>
                            </T>
                          ) : null}
                          <T num size={13} weight={700}>
                            {money(price)}
                          </T>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            ) : (
              <View style={styles.priceRow}>
                <T size={13} color={colors.textSecondary}>
                  {details.pricingType === 'on_inspection' ? 'Inspection fee' : 'Price'}
                </T>
                <T num size={15} weight={700}>
                  {money(details.price)}
                </T>
              </View>
            )}
            {details.pricingType === 'on_inspection' ? (
              <T size={11} color={colors.textMuted} style={styles.noteLine}>
                You pay the inspection fee when you book. If the work costs more, the garage sends the final bill in the app
                and you pay the rest there.
              </T>
            ) : null}
          </View>
          {!paused ? (
            <ScButton variant={added ? 'outline' : 'main'} onPress={onToggle} style={styles.sheetAction}>
              {added ? 'Remove from booking' : 'Add to booking'}
            </ScButton>
          ) : null}
        </>
      ) : null}
    </ScSheet>
  );
}

/** GarageAddOns (PR #107's frame C): marked, and no Add button; they're picked at checkout. */
export function GarageAddOns({ addOns, carType }: { addOns: readonly AddOn[]; carType: VehicleType | null }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.addOns}>
      <View style={styles.sectionHead}>
        <T size={17} weight={500}>
          Add-ons
        </T>
        <T size={12} color={colors.textSecondary}>
          {addOnCountLabel(addOns.length)}
        </T>
      </View>
      <T size={13} lh={20} color={colors.textSecondary}>
        Optional extras. Choose them at checkout, with any service. They can&apos;t be booked alone.
      </T>
      <View style={styles.addOnList}>
        {addOns.map((addOn, i) => (
          <View key={addOn.id} style={[styles.addOnRow, i > 0 && styles.addOnLine]}>
            <View style={styles.flex}>
              <View style={styles.addOnName}>
                <T size={15}>{addOn.name}</T>
                <View style={styles.mark}>
                  <T size={11} weight={500} lh={15} color={colors.textSecondary}>
                    Add-on
                  </T>
                </View>
              </View>
              <T size={12} color={colors.textSecondary} style={styles.addOnTime}>
                <Figures text={addOnTimeLabel(addOn.extraMins)} size={12} color={colors.textSecondary} />
              </T>
            </View>
            <T size={15}>
              <Figures
                text={servicePriceText({ ...addOn, pricingType: addOn.pricingType } as never, carType)}
                size={15}
              />
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  tile: { borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden', flexShrink: 0 },
  thumb: { width: 64, height: 64, backgroundColor: c.surfaceElevated },
  tileFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  tilePale: { backgroundColor: '#F2F2F5' },
  clip: { position: 'absolute', left: 4, bottom: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 4 },
  add: {
    height: 44,
    minWidth: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.outlineStrong,
    paddingHorizontal: 16,
  },
  addOn: { backgroundColor: c.surfaceElevated },
  cardAdded: { borderColor: c.outlineStrong },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  price: { marginTop: 2 },
  desc: { marginTop: 4 },
  cardBottom: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  indent: { paddingLeft: 76 },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pkgHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  pkgPrice: { alignItems: 'flex-end', flexShrink: 0 },
  struck: { textDecorationLine: 'line-through' },
  save: { marginTop: 6, alignSelf: 'flex-start', borderRadius: 999, backgroundColor: c.disc, paddingHorizontal: 10, paddingVertical: 2 },
  pkgItems: { marginTop: 8, gap: 4 },
  pkgItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetPhoto: { height: 180, borderRadius: 14, backgroundColor: c.surfaceElevated, marginBottom: 12 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetMeta: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryChip: { borderRadius: 6, backgroundColor: c.surfaceElevated, paddingHorizontal: 8, paddingVertical: 2 },
  sheetBlock: { marginTop: 12, gap: 4 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  fold: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  noteLine: { marginTop: 6 },
  priceBlock: { marginTop: 16, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 },
  priceHead: { marginBottom: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  priceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetAction: { marginTop: 20 },
  addOns: { marginTop: 12, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addOnList: { borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: c.cardBottom, paddingHorizontal: 16 },
  addOnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  addOnLine: { borderTopWidth: 1, borderTopColor: c.line },
  addOnName: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  mark: { borderRadius: 6, backgroundColor: c.surfaceElevated, paddingHorizontal: 6, paddingVertical: 1 },
  addOnTime: { marginTop: 2 },
}));
