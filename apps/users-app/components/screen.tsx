import { BrandMark } from '@repo/native-ui/primitives';
import { createStyles } from '@repo/native-ui/theme';
import type { ComponentRef, ReactNode, RefObject } from 'react';
import { RefreshControl, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavClearance } from './hub-nav';

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandRight: { flexShrink: 1, minWidth: 0 },
}));

/**
 * CustomerShell: the screen's column, clear of the status bar and of the floating nav.
 * `onEnd` is InfiniteSentinel: near the end of the scroll, the next page.
 */
export function CustomerShell({
  children,
  showBrand = false,
  brandRight,
  gap = 16,
  scrollRef,
  onEnd,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  showBrand?: boolean;
  brandRight?: ReactNode;
  gap?: number;
  scrollRef?: RefObject<ComponentRef<typeof ScrollView> | null>;
  onEnd?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const clearance = useNavClearance();

  const onScroll = onEnd
    ? ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 400) onEnd();
      }
    : undefined;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.page}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        onScroll={onScroll}
        scrollEventThrottle={200}
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: clearance, gap }}
      >
        {showBrand ? (
          <View style={styles.brand}>
            <BrandMark height={32} />
            {brandRight ? <View style={styles.brandRight}>{brandRight}</View> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}
