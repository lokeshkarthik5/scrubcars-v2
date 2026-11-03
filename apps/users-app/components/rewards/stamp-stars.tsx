import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { devicePrefs } from '@/lib/device-prefs';
import { useReducedMotion } from '@/lib/motion';

const SEEN_KEY = 'detlio.shineStampsSeen';

function Star({ size, on, fresh, off }: { size: number; on: boolean; fresh: boolean; off: string }) {
  const still = useReducedMotion();
  const scale = useSharedValue(fresh && !still ? 0.4 : 1);
  const opacity = useSharedValue(fresh && !still ? 0 : 1);
  useEffect(() => {
    if (!fresh || still) return;
    const ease = Easing.bezier(0.34, 1.56, 0.64, 1);
    scale.value = withDelay(300, withSequence(withTiming(1.25, { duration: 420, easing: ease }), withTiming(1, { duration: 280 })));
    opacity.value = withDelay(300, withTiming(1, { duration: 300 }));
  }, [fresh, still, scale, opacity]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <Animated.View style={style}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path fill={on ? '#ECEDF1' : off} d="M12 2.6l2.75 5.82 6.35.8-4.67 4.38 1.2 6.3L12 16.8l-5.63 3.1 1.2-6.3L2.9 9.22l6.35-.8L12 2.6z" />
      </Svg>
    </Animated.View>
  );
}

/** StampStars: one star per stamp; one this phone hasn't shown yet lands with a small pop. */
export function StampStars({ onCard, goal, size = 14, gap = 12, remember = false }: { onCard: number; goal: number; size?: number; gap?: number; remember?: boolean }) {
  const [seen] = useState<number>(() => {
    if (!remember) return onCard;
    const stored = devicePrefs.getItem(SEEN_KEY);
    const value = stored === null ? onCard : Number(stored);
    return Number.isFinite(value) ? value : onCard;
  });
  useEffect(() => {
    if (remember) devicePrefs.setItem(SEEN_KEY, String(onCard));
  }, [onCard, remember]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      {Array.from({ length: goal }, (_, i) => (
        <Star key={i} size={size} on={i < onCard} fresh={i < onCard && i >= seen} off="#3A3A42" />
      ))}
    </View>
  );
}
