import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

import { SectionHeader } from '../rows';
import { T } from '@repo/native-ui/text';

/** SectionHeader with its `action` slot: "Cancel edit" while editing, or the list's count. */
export function SectionTitle({
  title,
  onCancel,
  count,
}: {
  title: string;
  /** Shown as "Cancel edit" when given. */
  onCancel?: () => void;
  count?: number;
}) {
  return (
    <View style={styles.row}>
      <SectionHeader title={title} />
      {onCancel ? (
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={6} style={styles.cancel}>
          <T size={13} weight={500} color={colors.textSecondary}>
            Cancel edit
          </T>
        </Pressable>
      ) : count !== undefined && count > 0 ? (
        <T num size={12} color={colors.textMuted}>
          {count}
        </T>
      ) : null}
    </View>
  );
}

/** A small caption over a block of chips: "Category", "Pricing". */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <T size={11} weight={500} color={colors.textSecondary}>
      {children}
    </T>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // -my-2 min-h-11 px-1: a 44px target that adds no height to the row.
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, marginVertical: -10 },
});
