import { Pressable, View } from 'react-native';

import { createStyles, useColors } from '@repo/native-ui/theme';

import { SectionHeader } from '../rows';
import { T } from '@repo/native-ui/text';

/** SectionHeader with its `action` slot: "Cancel edit" while editing, or the list's count. */
export function SectionTitle({
  title,
  onCancel,
  count,
  action,
}: {
  title: string;
  /** Shown as "Cancel edit" when given. */
  onCancel?: () => void;
  count?: number;
  /** Beside the heading when not editing: the Services form's "Add add-on". */
  action?: React.ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <SectionHeader title={title} />
      {onCancel ? (
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={6} style={styles.cancel}>
          <T size={13} weight={500} color={colors.textSecondary}>
            Cancel edit
          </T>
        </Pressable>
      ) : action ? (
        action
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
  const colors = useColors();
  return (
    <T size={11} weight={500} color={colors.textSecondary}>
      {children}
    </T>
  );
}

const useStyles = createStyles((colors) => ({
  row: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // -my-2 min-h-11 px-1: a 44px target that adds no height to the row.
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4, marginVertical: -10 },
}));
