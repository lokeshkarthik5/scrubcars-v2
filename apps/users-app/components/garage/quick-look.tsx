import { useGarage } from '@repo/core/api/hooks/use-vendors';
import { bookingTypeParam } from '@repo/core/booking-types';
import { distanceLabel, driveTimeLabel } from '@repo/core/drive-time';
import type { BookingType, Vendor } from '@repo/core/types';
import { formatDuration } from '@repo/core/utils';
import { RedButton } from '@repo/native-ui/finish';
import { PressScale, Rise } from '@repo/native-ui/motion';
import { Skeleton } from '@repo/native-ui/primitives';
import { ScModal } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useFinish } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';

import { servicePriceText } from '@/lib/price';

import { GarageCover } from './cover';

/**
 * Press and hold a garage card (§3; apps/users/components/garages/quick-look.tsx): a
 * glass quick look over the list, with the photo, area, distance and drive, the garage's
 * first three services with their time and price (from the garage page's own query,
 * which the press already started), "Open garage" and the solid red "Book".
 */
export function QuickLook({
  vendor,
  mode,
  onClose,
}: {
  vendor: Vendor | null;
  mode: BookingType;
  onClose: () => void;
}) {
  return (
    <ScModal
      open={vendor !== null}
      onClose={onClose}
      flush
      accessibilityLabel={vendor ? `Quick look: ${vendor.name}` : 'Quick look'}
    >
      {vendor ? <QuickLookBody vendor={vendor} mode={mode} onClose={onClose} /> : null}
    </ScModal>
  );
}

function QuickLookBody({ vendor, mode, onClose }: { vendor: Vendor; mode: BookingType; onClose: () => void }) {
  const styles = useStyles();
  const { fx } = useFinish();
  const garage = useGarage(vendor.id);
  const services = garage.isPlaceholderData ? null : (garage.data?.services.slice(0, 3) ?? []);
  const modeParam = bookingTypeParam(mode);
  const query = modeParam ? `?mode=${modeParam}` : '';
  const photo = vendor.photos[0] ?? null;
  const where = [
    vendor.area,
    vendor.distanceKm !== null ? distanceLabel(vendor.distanceKm) : null,
    vendor.distanceKm !== null ? driveTimeLabel(vendor.distanceKm) : null,
  ].filter(Boolean);
  const go = (href: string) => {
    onClose();
    router.push(href as Href);
  };

  return (
    <View>
      <View style={styles.photo}>
        {photo ? (
          <Image source={{ uri: photo }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <GarageCover vendor={vendor} showMeta={false} />
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(18,18,22,0)', 'rgba(18,18,22,0)', 'rgba(18,18,22,0.9)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={styles.body}>
        <T variant="t2" accessibilityRole="header">
          {vendor.name}
        </T>
        <T num variant="t4" color={fx.quiet} style={styles.where}>
          {where.join(' · ')}
        </T>
        <View style={styles.list}>
          {services === null
            ? [0, 1, 2].map((i) => (
                <View key={i} style={[styles.row, { borderTopColor: fx.hairline }]}>
                  <Skeleton height={16} radius={6} />
                </View>
              ))
            : services.map((service, i) => (
                <Rise
                  key={service.id}
                  index={i}
                  delay={120}
                  style={[styles.row, styles.service, { borderTopColor: fx.hairline }]}
                >
                  <View style={styles.flex}>
                    <T variant="t3" numberOfLines={1}>
                      {service.name}
                    </T>
                    {service.durationMins ? (
                      <T variant="t5" color={fx.quiet}>
                        {formatDuration(service.durationMins)}
                      </T>
                    ) : null}
                  </View>
                  <T num variant="t3" weight={600}>
                    {servicePriceText(service)}
                  </T>
                </Rise>
              ))}
        </View>
        <View style={styles.actions}>
          <PressScale accessibilityRole="link" onPress={() => go(`/garage/${vendor.id}${query}`)} style={styles.flex}>
            <View style={[styles.open, { borderColor: fx.glassEdge }]}>
              <T variant="t3" weight={600}>
                Open garage
              </T>
            </View>
          </PressScale>
          <RedButton height={48} radius={14} onPress={() => go(`/book/${vendor.id}${query}`)} style={styles.flex}>
            Book
          </RedButton>
        </View>
      </View>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  photo: { height: 150, overflow: 'hidden', backgroundColor: c.surfaceElevated },
  body: { paddingHorizontal: 18, paddingBottom: 18, paddingTop: 4 },
  where: { marginTop: 2 },
  list: { marginTop: 12 },
  row: { borderTopWidth: 1, paddingVertical: 11 },
  service: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  actions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  open: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.scheme === 'light' ? c.surface : 'rgba(255,255,255,0.05)',
  },
}));
