import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';

export { useReducedMotion };

/** A short buzz where the phone has one; the moment is the same without it. */
export function buzz(kind: 'light' | 'legendary' = 'light') {
  const run = async () => {
    if (kind === 'light') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  run().catch(() => undefined);
}
