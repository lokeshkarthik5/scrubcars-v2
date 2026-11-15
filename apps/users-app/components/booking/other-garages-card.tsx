import { serviceLinesOf } from '@repo/core/add-ons';
import { getOtherGarages, type RescueGarage } from '@repo/core/api/bookings';
import { bookingTypeParam } from '@repo/core/booking-types';
import { useT } from '@repo/core/i18n';
import { rescueDayLabel, rescueHeading, rescueSubline, rescueTimePath, sameJobPrice, usualAnswerLabel } from '@repo/core/rescue';
import type { Booking, BookingType } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { IconBuildingStore, IconClock } from '@repo/native-ui/icons';
import { ScCard, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { View } from 'react-native';

import { NextFreeRow } from '@/components/garage/next-free-row';
import { VendorCard } from '@/components/garage/vendor-card';

/** "Usually answers in 10 min": the chip after the distance. */
function AnswerChip({ mins }: { mins: number | null }) {
  const colors = useColors();
  const styles = useStyles();
  const label = usualAnswerLabel(mins);
  if (!label) return null;
  return (
    <View style={styles.chip}>
      <IconClock size={12} color={colors.success} />
      <T size={12} weight={500} lh={16} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

/** The part joined under a garage's card: the same job's price and the times near the original slot. */
function RescueOfferPart({
  vendor,
  mode,
  addressId,
  vehicleId,
}: {
  vendor: RescueGarage;
  mode: BookingType;
  addressId: string | null;
  /** The booked car: the price is for it, so the booking opens on it. */
  vehicleId: string | null;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const offer = vendor.rescue;
  if (!offer) return null;
  return (
    <View style={styles.offer}>
      <View style={styles.priceRow}>
        <T size={13} lh={18} color={colors.textSecondary}>
          {t('Same job')}
        </T>
        <T num size={16} weight={600} lh={22}>
          {sameJobPrice(offer.price)}
        </T>
      </View>
      <NextFreeRow
        vendor={vendor}
        mode={mode}
        visible
        preset={{
          free: offer.free,
          dayLabel: rescueDayLabel(offer),
          hrefFor: (slot) => rescueTimePath({ vendorId: vendor.id, bookingType: mode, serviceIds: offer.serviceIds, addressId, vehicleId, slot }),
        }}
        style={styles.times}
      />
    </View>
  );
}

/** OtherGaragesCard (apps/users/components/other-garages-card.tsx): the rescue, looking and working the same. */
export function OtherGaragesCard({ booking, addressId }: { booking: Booking; addressId: string | null }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const others = useQuery({ queryKey: ['bookings', booking.id, 'other-garages'], queryFn: () => getOtherGarages(booking.id), staleTime: 5 * 60_000 });
  const mode = others.data?.bookingType ?? booking.bookingType;
  const modeParam = bookingTypeParam(mode);
  const listHref = modeParam ? `/garages?mode=${modeParam}` : '/garages';
  const vendors = others.data?.vendors ?? [];
  const jobName = serviceLinesOf(booking.items)
    .map((item) => item.name)
    .join(' + ');
  // Something was paid that comes back (a no-fee inspection paid nothing).
  const paid = booking.servicePrice > 0 || (booking.creditPaid ?? 0) > 0;
  return (
    <View style={styles.column}>
      <View>
        <T size={14} weight={600} lh={20} accessibilityRole="header">
          {rescueHeading()}
        </T>
        <T size={12} lh={16} color={colors.textSecondary} style={styles.sub}>
          {rescueSubline({ jobName: jobName || t('The same job'), bookingType: mode, paid })}
        </T>
      </View>
      {others.isPending ? (
        <Skeleton height={132} />
      ) : vendors.length > 0 ? (
        vendors.map((vendor) => (
          <VendorCard
            key={vendor.id}
            vendor={vendor}
            mode={mode}
            chips={<AnswerChip mins={vendor.rescue?.usualAnswerMins ?? null} />}
            attached={vendor.rescue ? <RescueOfferPart vendor={vendor} mode={mode} addressId={addressId} vehicleId={booking.vehicle?.id ?? null} /> : undefined}
          />
        ))
      ) : (
        <ScCard style={styles.none}>
          <IconBuildingStore size={20} color={colors.textMuted} />
          <T size={13} lh={18} color={colors.textSecondary} style={styles.grow}>
            {others.isError ? t("Couldn't load garages near you.") : t('No other garage nearby has a time for this job right now.')}
          </T>
        </ScCard>
      )}
      <ScButton variant="outline" onPress={() => router.push(listHref as Href)}>
        {t('See all garages')}
      </ScButton>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 12 },
  sub: { marginTop: 2 },
  none: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  grow: { flex: 1, minWidth: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, backgroundColor: c.surfaceElevated, paddingHorizontal: 8, paddingVertical: 2 },
  offer: { marginHorizontal: 14, gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, paddingBottom: 14 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  times: { paddingHorizontal: 0, paddingBottom: 0, paddingTop: 0 },
}));
