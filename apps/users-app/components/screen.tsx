import { TopGlow } from '@repo/native-ui/finish';
import { SeenProvider, useReduceMotion, useSeenHost } from '@repo/native-ui/motion';
import { BrandMark } from '@repo/native-ui/primitives';
import { createStyles } from '@repo/native-ui/theme';
import { useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Animated, Platform, RefreshControl, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavClearance } from './hub-nav';
import { PullCar } from './moments/pull-car';

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  scroll: { flex: 1 },
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
  const reduce = useReduceMotion();
  // What comes into view plays its one-shot effects then (the finish's count-ups, roads).
  const seen = useSeenHost();
  // How far the list is pulled past its top, for the pull-to-refresh car (moment 6).
  const pull = useRef(new Animated.Value(0)).current;

  const onScroll = ({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
    seen.notify();
    if (onRefresh) pull.setValue(Math.min(0, e.contentOffset.y));
    if (onEnd && e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 400) onEnd();
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {/* The finish's faint red light at the top of the screen, behind everything on it. */}
      <TopGlow />
      {onRefresh ? <PullCar scrollY={pull} refreshing={Boolean(refreshing)} top={insets.top} /> : null}
      <SeenProvider value={seen.value}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        onScroll={onScroll}
        scrollEventThrottle={onRefresh ? 16 : 100}
        refreshControl={
          onRefresh ? (
            // On an iPhone the little car is the pull's feedback; Android keeps its spinner.
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={Platform.OS === 'ios' && !reduce ? 'transparent' : undefined} />
          ) : undefined
        }
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
      </SeenProvider>
    </View>
  );
}
