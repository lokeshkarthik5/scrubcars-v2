import { PULL_REFRESH_PX } from '@repo/core/moments';
import { useReduceMotion } from '@repo/native-ui/motion';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions } from 'react-native';

import { RoadCar } from './road';

/**
 * Pull to refresh (moment 6; the website's components/moments/pull-to-refresh.tsx): the
 * little car rolls in from the left as the list is pulled down, and drives off to the
 * right while it refreshes. Drawn behind the list, which shows it as it is pulled away;
 * the phone's own pull (RefreshControl) still does the asking. iPhones report the pull
 * as a scroll above the top, which is what moves the car; Android keeps its own spinner,
 * and under Reduce Motion the spinner is all there is.
 */
export function PullCar({
  scrollY,
  refreshing,
  top = 0,
}: {
  scrollY: Animated.Value;
  refreshing: boolean;
  top?: number;
}) {
  const reduce = useReduceMotion();
  const { width } = useWindowDimensions();
  const away = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!refreshing) {
      away.setValue(0);
      return;
    }
    const run = Animated.timing(away, {
      toValue: 1,
      duration: 700,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [refreshing, away]);

  if (Platform.OS !== 'ios' || reduce) return null;
  const middle = width / 2 - 12;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.car,
        {
          top: top + 22,
          opacity: scrollY.interpolate({ inputRange: [-24, -6], outputRange: [1, 0], extrapolate: 'clamp' }),
          transform: [
            {
              translateX: scrollY.interpolate({
                inputRange: [-PULL_REFRESH_PX, 0],
                outputRange: [middle, -40],
                extrapolate: 'clamp',
              }),
            },
            { translateX: away.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) },
          ],
        },
      ]}
    >
      <RoadCar size={24} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  car: { position: 'absolute', left: 0 },
});
