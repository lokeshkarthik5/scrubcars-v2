import { parseBookingType } from '@repo/core/booking-types';
import { useT } from '@repo/core/i18n';
import type { BookingType } from '@repo/core/types';
import { useUserStore } from '@repo/core/stores/user-store';
import { Raised, TopGlow } from '@repo/native-ui/finish';
import { IconChevronDown, IconMapPin } from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { BrandMark } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaPicker } from '@/components/area/area-picker';
import { ContinueBookingCard } from '@/components/checkout/continue-booking';
import { GarageList } from '@/components/garage/garage-list';
import { useAuth } from '@/lib/auth';
import { isCitywide, useLocationStore } from '@/lib/location';

/** GarageListScreen (apps/users/components/garages/garage-list-screen.tsx). */
export default function GaragesScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { fx } = useFinish();
  const insets = useSafeAreaInsets();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<BookingType>(() => parseBookingType(modeParam) ?? 'dropin');
  // A tab stays mounted: the next "Book a wash" says its mode here.
  useEffect(() => {
    const asked = parseBookingType(modeParam);
    if (asked) setMode(asked);
  }, [modeParam]);

  const user = useAuth((s) => s.user);
  const profile = useUserStore((s) => s.profile);
  const location = useLocationStore((s) => s.location);
  const permission = useLocationStore((s) => s.permission);
  const locating = useLocationStore((s) => s.locating);
  const citywide = isCitywide(location);
  const [areaOpen, setAreaOpen] = useState(false);
  const askArea = useCallback(() => setAreaOpen(true), []);

  useEffect(() => {
    if (user) void useUserStore.getState().fetchProfile().catch(() => undefined);
  }, [user]);

  // Under the place, in words: what the pill cannot say in one line.
  const status = locating
    ? t('Finding you…')
    : citywide
      ? permission === 'denied'
        ? t('Location blocked — all of Chennai')
        : t('All of Chennai')
      : location?.source === 'area'
        ? t('Change area')
        : (profile?.area ?? t('Showing garages near you'));

  const header = (
    <>
      {/* The logo with its red dot lit, and where the list is measured from as one raised pill (§3). */}
      <View style={styles.brand}>
        <View>
          <BrandMark height={28} />
          <View pointerEvents="none" style={styles.brandGlow} />
        </View>
        <View style={styles.place}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={t('Choose location')}
            accessibilityHint={status}
            disabled={locating}
            onPress={() => setAreaOpen(true)}
          >
            <Raised radius={12} style={styles.pill} innerStyle={styles.pillInner}>
              <IconMapPin size={15} />
              <T variant="t3" weight={600} numberOfLines={1} style={styles.shrink}>
                {locating ? t('Finding you…') : location && !citywide ? t(location.label) : t('Chennai')}
              </T>
              <IconChevronDown size={13} color={fx.quiet} />
            </Raised>
          </PressScale>
          {/* Said in the open only when it changes what the list can do. */}
          {permission === 'denied' && citywide ? (
            <T variant="t5" numberOfLines={1} color={colors.textSecondary} align="right">
              {status}
            </T>
          ) : null}
        </View>
      </View>
      <ContinueBookingCard />
    </>
  );

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <TopGlow />
      <GarageList mode={mode} onModeChange={setMode} onAskArea={askArea} header={header} />
      <AreaPicker open={areaOpen} onClose={() => setAreaOpen(false)} />
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // A soft red light under the wordmark's full stop, at its bottom right.
  brandGlow: {
    position: 'absolute',
    right: -2,
    bottom: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(228,0,43,0.35)',
    shadowColor: '#E4002B',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.9,
  },
  place: { flexShrink: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 },
  pill: { height: 40, maxWidth: '100%' },
  pillInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 12 },
  shrink: { flexShrink: 1 },
}));
