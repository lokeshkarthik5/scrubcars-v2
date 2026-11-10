import { useOneShot } from '@repo/native-ui/motion';
import { Animated, Easing, Image, type ImageStyle, type StyleProp, StyleSheet, View } from 'react-native';

const IRIS = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * The car photo shutter (moment 4; the website's .mo-shutter): a photo just added to a
 * "Your car's condition" slot blinks the tile shut and open like a camera, then the
 * photo fades in. Only for the photo just taken (`play`); the rest are simply there, and
 * so is everything under Reduce Motion.
 */
export function ShutterImage({ uri, play, style }: { uri: string; play: boolean; style: StyleProp<ImageStyle> }) {
  const blink = useOneShot({ play, duration: 500, easing: IRIS });
  const fade = useOneShot({ play, delay: 450, duration: 450, easing: Easing.ease });
  const flat = StyleSheet.flatten(style) ?? {};
  if (!play) return <Image source={{ uri }} style={style} />;
  return (
    <View style={{ width: flat.width, height: flat.height, borderRadius: flat.borderRadius, overflow: 'hidden' }}>
      <Animated.Image source={{ uri }} style={[style, { opacity: fade }]} />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.lid,
          {
            // Shut at 45%, open again by the end, as the iris does.
            opacity: blink.interpolate({ inputRange: [0, 0.45, 0.46, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ scale: blink.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.2, 1, 1.15] }) }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  lid: { backgroundColor: '#000000', borderRadius: 999 },
});
