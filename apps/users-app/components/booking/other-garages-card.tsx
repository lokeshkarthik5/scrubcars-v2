import { getOtherGarages } from '@repo/core/api/bookings';
import { bookingTypeParam } from '@repo/core/booking-types';
import { useT } from '@repo/core/i18n';
import type { Booking } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { IconBuildingStore } from '@repo/native-ui/icons';
import { ScCard, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { View } from 'react-native';

import { VendorCard } from '@/components/garage/vendor-card';

/** OtherGaragesCard (apps/users/components/other-garages-card.tsx). */
export function OtherGaragesCard({ booking }: { booking: Booking }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const others = useQuery({ queryKey: ['bookings', booking.id, 'other-garages'], queryFn: () => getOtherGarages(booking.id), staleTime: 5 * 60_000 });
  const mode = others.data?.bookingType ?? booking.bookingType;
  const modeParam = bookingTypeParam(mode);
  const listHref = modeParam ? `/garages?mode=${modeParam}` : '/garages';
  const vendors = others.data?.vendors ?? [];
  return (
    <View style={styles.column}>
      <View>
        <T size={14} weight={600} lh={20}>
          {t('Book another garage')}
        </T>
        <T size={12} lh={16} color={colors.textSecondary} style={styles.sub}>
          {vendors.length > 0 ? t('Nearby garages that do this kind of job, nearest first.') : t('Nearby garages that do this kind of job.')}
        </T>
      </View>
      {others.isPending ? (
        <Skeleton height={132} />
      ) : vendors.length > 0 ? (
        vendors.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} mode={mode} />)
      ) : (
        <ScCard style={styles.none}>
          <IconBuildingStore size={20} color={colors.textMuted} />
          <T size={13} lh={18} color={colors.textSecondary} style={styles.grow}>
            {others.isError ? t("Couldn't load garages near you.") : t('No other garage nearby does this job right now.')}
          </T>
        </ScCard>
      )}
      <ScButton variant="outline" onPress={() => router.push(listHref as Href)}>
        {t('See all garages')}
      </ScButton>
    </View>
  );
}

const useStyles = createStyles(() => ({
  column: { gap: 12 },
  sub: { marginTop: 2 },
  none: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  grow: { flex: 1, minWidth: 0 },
}));
