import { parseBookingType } from '@repo/core/booking-types';
import type { BookingType } from '@repo/core/types';
import { useUserStore } from '@repo/core/stores/user-store';
import { IconMapPin } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AreaPicker } from '@/components/area/area-picker';
import { ContinueBookingCard } from '@/components/checkout/continue-booking';
import { GarageList } from '@/components/garage/garage-list';
import { CustomerShell } from '@/components/screen';
import { useAuth } from '@/lib/auth';
import { isCitywide, useLocationStore } from '@/lib/location';

/** GarageListScreen (apps/users/components/garages/garage-list-screen.tsx). */
export default function GaragesScreen() {
  const colors = useColors();
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
  const loadMore = useRef<() => void>(() => undefined);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (user) void useUserStore.getState().fetchProfile().catch(() => undefined);
  }, [user]);

  return (
    <CustomerShell
      showBrand
      scrollRef={scroll}
      onEnd={() => loadMore.current()}
      brandRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose location"
          disabled={locating}
          onPress={() => setAreaOpen(true)}
          style={styles.area}
        >
          <View style={styles.areaTop}>
            <IconMapPin size={15} />
            <T size={14} weight={600} numberOfLines={1} style={styles.shrink}>
              {location && !citywide ? location.label : 'Chennai'}
            </T>
          </View>
          <T size={12} numberOfLines={1} color={colors.textSecondary} align="right">
            {locating
              ? 'Finding you…'
              : citywide
                ? permission === 'denied'
                  ? 'Location blocked — all of Chennai'
                  : 'All of Chennai'
                : location?.source === 'area'
                  ? 'Change area'
                  : (profile?.area ?? 'Showing garages near you')}
          </T>
        </Pressable>
      }
    >
      <ContinueBookingCard />
      <GarageList
        mode={mode}
        onModeChange={setMode}
        onAskArea={askArea}
        bindLoadMore={(fn) => {
          loadMore.current = fn;
        }}
        scrollToTop={() => scroll.current?.scrollTo({ y: 0, animated: true })}
      />
      <AreaPicker open={areaOpen} onClose={() => setAreaOpen(false)} />
    </CustomerShell>
  );
}

const styles = StyleSheet.create({
  area: { minWidth: 0, maxWidth: '100%', alignItems: 'flex-end' },
  areaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  shrink: { flexShrink: 1 },
});
