import { categoryLabel } from '@repo/core/categories';
import { fill, useT } from '@repo/core/i18n';
import { isNoFeeInspection, tierPriceFor } from '@repo/core/pricing';
import { cardThumbnail, customerMedia, formatClipLength, serviceIconFor, type ServiceIcon } from '@repo/core/service-media';
import { cardPointsLine, parseServiceDescription, sheetPoints } from '@repo/core/service-points';
import type { Service, ServicePackage, VehicleType } from '@repo/core/types';
import { formatDuration } from '@repo/core/utils';
import { VEHICLE_TIERS } from '@repo/core/vehicles';
import { ScButton } from '@repo/native-ui/button';
import { RedButton } from '@repo/native-ui/finish';
import {
  IconBrush,
  IconCheck,
  IconClock,
  IconDroplets,
  IconEngine,
  IconMotorbike,
  IconPackage,
  IconShieldCheck,
  IconSparkles,
  IconSpray,
  IconTool,
  type IconProps,
} from '@repo/native-ui/icons';

import { ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish, useTheme } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ServiceMediaArea } from '@/components/service-media/service-media-area';
import { addOnCountLabel, addOnTimeLabel, type AddOn } from '@/lib/add-ons';
import { money, pricedForCar, serviceApproxNote, servicePriceText } from '@/lib/price';

import { RedLightAdd } from './red-light-add';

export const isPackage = (item: Service | ServicePackage): item is ServicePackage => 'items' in item;

const ICONS: Record<ServiceIcon, (props: IconProps) => ReactElement> = {
  wash: IconDroplets,
  detailing: IconSparkles,
  coating: IconShieldCheck,
  scratch: IconBrush,
  general_service: IconEngine,
  repairs: IconTool,
  dent_paint: IconSpray,
  bike: IconMotorbike,
  package: IconPackage,
  others: IconTool,
};
const TINTS: Record<ServiceIcon, [string, string]> = {
  wash: ['#1B3150', '#0E1726'],
  detailing: ['#4A3518', '#1F170C'],
  coating: ['#123C30', '#0A1C17'],
  scratch: ['#4A3518', '#1F170C'],
  // The mechanical and body work (0080): steel blue, rust and plum, as the web.
  general_service: ['#20364A', '#0D161F'],
  repairs: ['#3D2A22', '#1A110D'],
  dent_paint: ['#3E1F3A', '#1A0D18'],
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

/**
 * A service or package card on the garage page (§5, the web's gp-card): the list card's
 * lit edge, brighter once picked, so what is in the booking reads at a glance.
 */
function PickCard({ picked, style, children }: { picked: boolean; style?: ViewStyle; children: ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  const light = colors.scheme === 'light';
  const rim: [string, string] = light
    ? picked
      ? [colors.outlineStrong, colors.border]
      : [colors.border, colors.line]
    : picked
      ? ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)']
      : ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.03)'];
  const fill: [string, string] = light ? [colors.surface, colors.surface] : picked ? ['#1A1A1F', '#131316'] : ['#16161A', '#111114'];
  return (
    <View style={[styles.pickCard, picked && !light && styles.pickedGlow]}>
      <LinearGradient pointerEvents="none" colors={rim} style={[StyleSheet.absoluteFill, styles.pickRadius]} />
      <LinearGradient pointerEvents="none" colors={fill} style={styles.pickFill} />
      <View style={style}>{children}</View>
    </View>
  );
}

/** A clock and a duration, in the figures' face. */
function Duration({ mins }: { mins: number }) {
  const styles = useStyles();
  const { fx } = useFinish();
  return (
    <View style={styles.duration}>
      <IconClock size={12} color={fx.quietBright} />
      <T num variant="t5" color={fx.quietBright}>
        {formatDuration(mins)}
      </T>
    </View>
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
  const t = useT();
  const styles = useStyles();
  const { fx } = useFinish();
  return (
    <PickCard picked={added} style={styles.serviceGrid}>
      {/* Tapping anywhere on the card opens the details; Add stays a separate action. */}
      <Pressable accessibilityRole="button" accessibilityLabel={t('View details for {name}', { name: service.name })} onPress={onOpen} style={styles.cardTop}>
        <ServiceThumb service={service} />
        <View style={[styles.flex, styles.serviceText]}>
          <T variant="t3" weight={600} lh={19}>
            {service.name}
          </T>
          <CardLine description={service.description} size={11} clamp={2} />
          {service.durationMins != null ? <Duration mins={service.durationMins} /> : null}
        </View>
      </Pressable>
      <View style={styles.serviceSide}>
        {/* The price for the customer's own car (F13). */}
        {/* No fee (0073) says it in words, a size down and wrapping, as on the web. */}
        <T num variant="t3" weight={600} align="right">
          <Figures text={servicePriceText(service, carType)} size={isNoFeeInspection(service) ? 13 : 15} weight={600} />
        </T>
        {/* An inspection fee's approx price (0073). */}
        {serviceApproxNote(service) ? (
          <T size={10} weight={500} lh={12} color={fx.quiet} align="right">
            {serviceApproxNote(service)}
          </T>
        ) : null}
        {pricedForCar(service, carType) && carModel ? (
          <T size={10} weight={500} lh={12} color={fx.quiet}>
            {t('for your {carModel}', { carModel })}
          </T>
        ) : null}
        {!paused ? <RedLightAdd name={service.name} added={added} onToggle={onToggle} style={styles.sideAdd} /> : null}
      </View>
    </PickCard>
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
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { fx } = useFinish();
  return (
    <PickCard picked={added} style={styles.pkgPad}>
      {/* Same affordance as a service card: the card opens the details, Add stays separate. */}
      <Pressable accessibilityRole="button" accessibilityLabel={t('View details for {name}', { name: pkg.name })} onPress={onOpen}>
        <View style={styles.pkgHead}>
          <T size={16} weight={600} lh={21} style={styles.flex}>
            {pkg.name}
          </T>
          {/* Silver, never red: a saving is a fact, not a button. */}
          {pkg.savings !== null ? (
            <View style={styles.save}>
              <LinearGradient
                colors={['#F6F7FA', '#C4C8D1', '#EEF0F4', '#A9AEBB']}
                locations={[0, 0.4, 0.6, 1]}
                start={{ x: 0, y: 0.2 }}
                end={{ x: 1, y: 0.8 }}
                style={[StyleSheet.absoluteFill, styles.saveFace]}
              />
              <T num variant="t5" weight={600} lh={12} color="#0A0A0B">
                {t('Save {amount}', { amount: `${money(pkg.savings)}${pkg.tierBreakdown ? '+' : ''}` })}
              </T>
            </View>
          ) : null}
        </View>
        <CardLine description={pkg.description} size={13} />
        <View style={styles.pkgItems}>
          {pkg.items.map((item) => (
            <View key={item.serviceId} style={styles.pkgItem}>
              <IconCheck size={14} color={colors.success} />
              <T variant="t4" color={fx.soft} style={styles.flex}>
                {item.name}
              </T>
            </View>
          ))}
        </View>
      </Pressable>
      <View style={[styles.pkgFoot, { borderTopColor: fx.hairline }]}>
        <View style={styles.pkgPrice}>
          <T num size={20} weight={600} lh={22}>
            <Figures text={servicePriceText(pkg, carType)} size={20} weight={600} />
          </T>
          {/* The struck-through total only lines up with a single price. */}
          {pkg.tierBreakdown === null && pkg.savings !== null ? (
            <T num variant="t4" color={fx.quiet} style={styles.struck}>
              {money(pkg.itemsTotal)}
            </T>
          ) : null}
          {pkg.durationMins != null ? (
            <View style={styles.fullRow}>
              <Duration mins={pkg.durationMins} />
            </View>
          ) : null}
        </View>
        {!paused ? <RedLightAdd name={pkg.name} added={added} onToggle={onToggle} /> : null}
      </View>
    </PickCard>
  );
}

function WhatsIncluded({ points, note }: { points: string[]; note: string | null }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  if (points.length === 0) return null;
  const { shown, more } = sheetPoints(points, expanded);
  const foldable = points.length > sheetPoints(points, false).shown.length;
  return (
    <View style={styles.sheetBlock}>
      <T variant="over" color={colors.textMuted}>
        {t("What's included")}
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
            {expanded ? t('Show less') : t('+{count} more', { count: more })}
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

/** The details sheet: the garage's own video or photos on top. */
export function ServiceSheet({
  details,
  open,
  onClose,
  added,
  paused,
  onToggle,
  garageName,
}: {
  garageName: string;
  details: Service | ServicePackage | null;
  open: boolean;
  onClose: () => void;
  added: boolean;
  paused: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const media = details ? cardThumbnail(customerMedia(details.media)) : null;
  const parsed = details ? parseServiceDescription(details.description) : null;
  return (
    <ScSheet open={open} onClose={onClose} accessibilityLabel={details ? t('{name} details', { name: details.name }) : t('Service details')} horizontalPadding={16}>
      {details ? (
        <>
          <ServiceMediaArea service={details} garageName={garageName} />
          <View style={styles.sheetTitleRow}>
            {media ? null : <IconTile service={details} size={48} />}
            <View style={styles.flex}>
              <T variant="t2">{details.name}</T>
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
              {details.description || (isPackage(details) ? t('No description available for this package.') : t('No description available for this service.'))}
            </T>
          ) : parsed?.intro ? (
            <T size={13} color={colors.textSecondary} style={styles.sheetBlock}>
              {parsed.intro}
            </T>
          ) : null}
          <WhatsIncluded points={parsed?.points ?? []} note={parsed?.note ?? null} />
          {isPackage(details) ? (
            <View style={styles.sheetBlock}>
              <T variant="over" color={colors.textMuted}>
                {t('Services in this package')}
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
                  {fill(t('Save {amount} vs {total} separately'), {
                    amount: <T num size={12} weight={700}>{money(details.savings)}</T>,
                    total: <T num size={12} weight={700}>{money(details.itemsTotal)}</T>,
                  })}
                </T>
              ) : null}
            </View>
          ) : null}
          <View style={styles.priceBlock}>
            {details.pricingType === 'per_vehicle' ? (
              <>
                <T variant="over" color={colors.textMuted} style={styles.priceHead}>
                  {t('Price by vehicle')}
                </T>
                {VEHICLE_TIERS.map(({ value: type, label }) => {
                  const price = tierPriceFor(details, type);
                  const tierSavings = isPackage(details) ? (details.tierBreakdown?.[type].savings ?? null) : null;
                  return (
                    <View key={type} style={styles.priceRow}>
                      <T size={13} color={colors.textSecondary}>
                        {t(label)}
                      </T>
                      {price == null ? (
                        <T size={12} color={colors.textMuted}>
                          {t('Price on request')}
                        </T>
                      ) : (
                        <View style={styles.priceRight}>
                          {tierSavings !== null ? (
                            <T size={11} weight={500} color={colors.textSecondary}>
                              {fill(t('save {amount}'), { amount: <T num size={11} weight={500} color={colors.textSecondary}>{money(tierSavings)}</T> })}
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
                  {details.pricingType === 'on_inspection' && !isNoFeeInspection(details) ? t('Inspection fee') : t('Price')}
                </T>
                {/* No fee (0073): the approx price or "Price on inspection", never ₹0. */}
                <T num size={15} weight={700} align="right" style={styles.flexShrink}>
                  {isNoFeeInspection(details) ? servicePriceText(details) : money(details.price)}
                </T>
              </View>
            )}
            {serviceApproxNote(details) ? (
              <T size={11} weight={500} color={colors.textSecondary} style={styles.noteLine}>
                {serviceApproxNote(details)}
              </T>
            ) : null}
            {details.pricingType === 'on_inspection' ? (
              <T size={11} color={colors.textMuted} style={styles.noteLine}>
                {isNoFeeInspection(details)
                  ? t('No inspection fee. After seeing your car the garage sends the price in the app, and you pay it there.')
                  : t('You pay the inspection fee when you book. If the work costs more, the garage sends the final bill in the app and you pay the rest there.')}
              </T>
            ) : null}
          </View>
          {/* Solid red only while it adds: removing is the quieter action, as the card's Added is. */}
          {!paused ? (
            added ? (
              <ScButton variant="outline" onPress={onToggle} style={styles.sheetAction}>
                {t('Remove from booking')}
              </ScButton>
            ) : (
              <RedButton height={50} radius={16} onPress={onToggle} style={styles.sheetAction}>
                {t('Add to booking')}
              </RedButton>
            )
          ) : null}
        </>
      ) : null}
    </ScSheet>
  );
}

/** GarageAddOns (PR #107's frame C): marked, and no Add button; they're picked at checkout. */
export function GarageAddOns({ addOns, carType }: { addOns: readonly AddOn[]; carType: VehicleType | null }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.addOns}>
      <View style={styles.sectionHead}>
        <T variant="t2">{t('Add-ons')}</T>
        <T size={12} color={colors.textSecondary}>
          {addOnCountLabel(addOns.length)}
        </T>
      </View>
      <T size={13} lh={20} color={colors.textSecondary}>
        {t("Optional extras. Choose them at checkout, with any service. They can't be booked alone.")}
      </T>
      <View style={styles.addOnList}>
        {addOns.map((addOn, i) => (
          <View key={addOn.id} style={[styles.addOnRow, i > 0 && styles.addOnLine]}>
            <View style={styles.flex}>
              <View style={styles.addOnName}>
                <T size={15}>{addOn.name}</T>
                <View style={styles.mark}>
                  <T size={11} weight={500} lh={15} color={colors.textSecondary}>
                    {t('Add-on')}
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
  pickCard: { borderRadius: 18 },
  pickRadius: { borderRadius: 18 },
  pickFill: { position: 'absolute', top: 1, left: 1, right: 1, bottom: 1, borderRadius: 17 },
  pickedGlow: { shadowColor: '#FFFFFF', shadowOffset: { width: 0, height: 8 }, shadowRadius: 14, shadowOpacity: 0.12 },
  serviceGrid: { flexDirection: 'row', gap: 12, padding: 12 },
  cardTop: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  serviceText: { gap: 3 },
  serviceSide: { alignItems: 'flex-end', gap: 2, maxWidth: 160 },
  sideAdd: { marginTop: 'auto' },
  desc: { marginTop: 1 },
  duration: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pkgPad: { padding: 16 },
  pkgHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pkgFoot: { marginTop: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, paddingTop: 12 },
  pkgPrice: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, rowGap: 4 },
  fullRow: { width: '100%' },
  struck: { textDecorationLine: 'line-through' },
  save: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  saveFace: { borderRadius: 8 },
  pkgItems: { marginTop: 12, gap: 6 },
  pkgItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetPhoto: { height: 180, borderRadius: 14, backgroundColor: c.surfaceElevated, marginBottom: 12 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetMeta: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryChip: { borderRadius: 6, backgroundColor: c.surfaceElevated, paddingHorizontal: 8, paddingVertical: 2 },
  sheetBlock: { marginTop: 12, gap: 4 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  fold: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  noteLine: { marginTop: 6 },
  flexShrink: { flexShrink: 1, marginLeft: 12 },
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
