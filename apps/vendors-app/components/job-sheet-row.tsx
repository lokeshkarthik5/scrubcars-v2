import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, PRESSED_SCALE } from '@/lib/theme';

import { IconChevronRight } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';

/** JobSheetRow: opens its own sheet when there is something to do; plain text when not. */
export function JobSheetRow({
  icon,
  title,
  detail,
  onOpen,
  accessibilityLabel,
}: {
  icon: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  onOpen?: () => void;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      {icon}
      <View style={styles.flex}>
        <T size={17} weight={600}>
          {title}
        </T>
        {detail ? (
          typeof detail === 'string' ? (
            <T size={15} color={colors.textSecondary}>
              {detail}
            </T>
          ) : (
            detail
          )
        ) : null}
      </View>
      {onOpen ? <IconChevronRight size={20} color={colors.textSecondary} /> : null}
    </>
  );
  if (!onOpen) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onOpen}
      style={({ pressed }) => [styles.row, pressed && { transform: [{ scale: PRESSED_SCALE }] }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
