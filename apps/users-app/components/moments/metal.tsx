import { useOneShot, useSeenOnce, type ViewRef } from '@repo/native-ui/motion';
import { T, type Weight } from '@repo/native-ui/text';
import { type ReactNode, useRef } from 'react';
import { Animated, Easing, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

import { useCountUp } from '@/lib/motion';

/**
 * A level card's figure, counting up once from nothing as the card comes into view, like
 * an odometer's wheels (moment 9; the website's CountUpFigure). Read as the settled figure;
 * the frames are drawn. `format` writes it ("₹1,200", "14").
 */
export function CountUpFigure({
  value,
  format,
  size,
  weight = 600,
  lh,
  color,
}: {
  value: number;
  format: (n: number) => string;
  size: number;
  weight?: Weight;
  lh?: number;
  color?: string;
}) {
  const ref = useRef<ViewRef>(null);
  const seen = useSeenOnce(ref);
  const frame = Number(useCountUp(value, 0, seen));
  return (
    <View ref={ref} accessible accessibilityLabel={format(value)}>
      <T num size={size} weight={weight} lh={lh} color={color}>
        {format(frame)}
      </T>
    </View>
  );
}

/** Brushed metal (moment 9): fine vertical lines over the card's own colour, drawn behind its content. */
export function BrushedLines({ opacity = 0.035 }: { opacity?: number }) {
  return (
    <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id="brushed" patternUnits="userSpaceOnUse" width={3} height={3}>
          <Rect width={1} height={3} fill="#FFFFFF" fillOpacity={opacity} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#brushed)" />
    </Svg>
  );
}

/** A level bar that fills to its place once, from the left (mo-fill-once). */
export function FillOnce({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const p = useOneShot({ delay: 200, duration: 1200, easing: Easing.bezier(0.45, 0, 0.2, 1) });
  return (
    <Animated.View style={[style, { transformOrigin: 'left center', transform: [{ scaleX: p }] }]}>
      {children}
    </Animated.View>
  );
}
