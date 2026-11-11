import { matchSpans } from '@repo/core/moments';
import { BOOKING_TYPE_LABELS, bookingTypeParam } from '@repo/core/booking-types';
import { distanceAndDrive } from '@repo/core/drive-time';
import { fill, useT } from '@repo/core/i18n';
import { hasStarScore, NEW_GARAGE_LABEL, newGarageReviewsLine } from '@repo/core/ratings';
import { anywhereInCityLine } from '@repo/core/reach';
import type { BookingType, Vendor } from '@repo/core/types';
import { IconStarFilled } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { RED_LIGHT } from '@repo/native-ui/tokens';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';

import { isApproximate, useLocationStore } from '@/lib/location';
import { useGarageTownTag } from '@/lib/customer-place';

import { GarageCover, GarageMonogram } from './cover';
import { SaveGarageButton } from './save-button';
import { OutsideCityChip, TierMark } from './tier';

function ModeBadge({ label, tone }: { label: string; tone: 'garage' | 'doorstep' }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.badge, { backgroundColor: tone === 'garage' ? colors.successMuted : colors.surfaceElevated }]}>
      <T size={11} weight={500} lh={15} color={tone === 'garage' ? colors.success : colors.textSecondary}>
        {label}
      </T>
    </View>
  );
}

/** VendorCard (packages/ui/src/features/vendor-card.tsx), with the approved "Known for" chip. */
/**
 * A search's words in a line of a result (moment 11, the website's Matched): the runs that
 * matched underlined with the red light (core's matchSpans).
 */
function Matched({ text, query, size, weight }: { text: string; query?: string; size: number; weight?: 400 | 500 | 600 }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {matchSpans(text, query).map((span, i) =>
        span.match ? (
          <T key={i} size={size} weight={weight} style={matchStyle}>
            {span.text}
          </T>
        ) : (
          span.text
        )
      )}
    </>
  );
}

const matchStyle = { textDecorationLine: 'underline', textDecorationColor: RED_LIGHT } as const;

export function VendorCard({
  vendor,
  mode,
  showSave = true,
  note,
  chips,
  footer,
  highlight,
}: {
  vendor: Vendor;
  mode?: BookingType;
  showSave?: boolean;
  note?: string | null;
  chips?: ReactNode;
  footer?: ReactNode;
  /** The search that found it: its words are underlined in the name and the service. */
  highlight?: string;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const location = useLocationStore((s) => s.location);
  // A garage in another town than the customer's city (0070); null in it.
  const townTag = useGarageTownTag(vendor);
  const cover = vendor.photos[0] ?? null;
  const km = vendor.distanceKm;
  const distanceText = km !== null ? distanceAndDrive(km, isApproximate(location)) : null;
  const modeParam = mode ? bookingTypeParam(mode) : null;
  const anywhere = anywhereInCityLine(vendor, mode);

  return (
    <View>
      <PressRow
        accessibilityLabel={vendor.name}
        onPress={() => router.push((modeParam ? `/garage/${vendor.id}?mode=${modeParam}` : `/garage/${vendor.id}`) as Href)}
        style={styles.card}
      >
        <View style={styles.photo}>
          {cover ? <Image source={{ uri: cover }} accessibilityLabel={vendor.name} resizeMode="cover" style={styles.fill} /> : <GarageCover vendor={vendor} />}
          {vendor.logoUrl ? (
            <View style={styles.logo}>
              <Image source={{ uri: vendor.logoUrl }} accessibilityLabel={t('{name} logo', { name: vendor.name })} resizeMode="cover" style={styles.fill} />
            </View>
          ) : (
            <GarageMonogram vendor={vendor} size={40} radius={10} fontSize={14} style={styles.monogram} />
          )}
        </View>
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <View style={styles.name}>
              <T size={15} weight={600} numberOfLines={1} style={styles.shrink}>
                <Matched text={vendor.name} query={highlight} size={15} weight={600} />
              </T>
              {vendor.tier ? <TierMark tier={vendor.tier} /> : null}
            </View>
            <View style={styles.badges}>
              {vendor.dropinEnabled ? <ModeBadge label={t(BOOKING_TYPE_LABELS.dropin)} tone="garage" /> : null}
              {vendor.doorstepEnabled && mode !== 'pickup' ? <ModeBadge label={t(BOOKING_TYPE_LABELS.doorstep)} tone="doorstep" /> : null}
              {mode === 'pickup' && vendor.pickupEnabled ? <ModeBadge label={t(BOOKING_TYPE_LABELS.pickup)} tone="doorstep" /> : null}
            </View>
          </View>
          <View style={styles.facts}>
            {hasStarScore(vendor) ? (
              <>
                <IconStarFilled size={12} color={colors.warningFill} />
                <T num size={12} weight={500} lh={18}>
                  {vendor.rating.toFixed(1)}
                </T>
                <T size={12} lh={18} color={colors.textSecondary}>
                  ({vendor.reviewCount})
                </T>
              </>
            ) : (
              <T size={12} weight={500} lh={18}>
                {t(NEW_GARAGE_LABEL)}
                {newGarageReviewsLine(vendor.reviewCount) ? ` · ${newGarageReviewsLine(vendor.reviewCount)}` : ''}
              </T>
            )}
            {vendor.startingPrice > 0 ? (
              <>
                <T size={12} lh={18} color={colors.textSecondary}>
                  ·
                </T>
                <T size={12} lh={18} color={colors.textSecondary}>
                  {fill(t('From {price}'), {
                    price: (
                      <T num size={12} weight={500} lh={18}>
                        ₹{vendor.startingPrice}
                      </T>
                    ),
                  })}
                </T>
              </>
            ) : null}
          </View>
          {townTag ? <OutsideCityChip text={townTag} /> : null}
          {vendor.matchedService ? (
            <T size={12} numberOfLines={1} color={colors.textSecondary}>
              {fill(t('Offers {service}'), {
                service: (
                  <T size={12} weight={500}>
                    <Matched text={vendor.matchedService} query={highlight} size={12} weight={500} />
                  </T>
                ),
              })}
            </T>
          ) : null}
          {anywhere ? (
            <T size={12} numberOfLines={1} color={colors.textSecondary}>
              {anywhere}
            </T>
          ) : null}
          {note ? (
            <T size={12} numberOfLines={1} color={colors.textMuted}>
              {note}
            </T>
          ) : null}
          {distanceText || chips || vendor.knownFor ? (
            <View style={styles.chips}>
              {distanceText ? (
                <View style={styles.distance}>
                  <T num size={12} weight={500} lh={16} numberOfLines={1}>
                    {distanceText}
                  </T>
                </View>
              ) : null}
              {vendor.knownFor ? (
                <View style={styles.known}>
                  <T size={12} lh={16} color={colors.success}>
                    {t('Known for {label}', { label: vendor.knownFor.label })}
                  </T>
                </View>
              ) : null}
              {chips}
            </View>
          ) : null}
        </View>
      </PressRow>
      {showSave ? (
        <View style={styles.action}>
          <SaveGarageButton vendor={vendor} />
        </View>
      ) : null}
      {footer}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  card: { overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  photo: { height: 150, backgroundColor: c.surfaceElevated },
  fill: { width: '100%', height: '100%' },
  logo: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 40,
    height: 40,
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: c.surface,
  },
  monogram: { position: 'absolute', left: 8, bottom: 8 },
  body: { gap: 6, paddingHorizontal: 14, paddingVertical: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  shrink: { flexShrink: 1 },
  badges: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  facts: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 2 },
  distance: { borderRadius: 6, backgroundColor: c.surfaceElevated, paddingHorizontal: 8, paddingVertical: 2 },
  known: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(34,197,94,0.5)', paddingHorizontal: 10, paddingVertical: 2 },
  action: { position: 'absolute', right: 8, top: 8 },
}));
