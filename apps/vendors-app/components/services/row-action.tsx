import { Pressable } from 'react-native';

import { createStyles } from '@repo/native-ui/theme';
import { PRESSED_SCALE } from '@repo/native-ui/tokens';

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
  const styles = useStyles();
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

const useStyles = createStyles((colors) => ({
  action: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineSoft,
    paddingHorizontal: 16,
  },
}));
