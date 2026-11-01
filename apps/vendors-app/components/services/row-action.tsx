import { Pressable, StyleSheet } from 'react-native';

import { PRESSED_SCALE } from '@/lib/theme';

import { T } from '@repo/native-ui/text';

/**
 * apps/vendors/app/services/catalogue-row.tsx: a row's small actions (Edit, Disable,
 * Delete) as quiet outline buttons with a full 48px height. None of them is red: this
 * screen's one red is the form's Add button.
 */
export function RowAction({
  onPress,
  disabled,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, disabled && { opacity: 0.5 }, pressed && { transform: [{ scale: PRESSED_SCALE }] }]}
    >
      <T size={14} weight={500}>
        {children}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
  },
});
