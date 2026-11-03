import { IconArrowLeft } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { Pressable, View } from 'react-native';

/** PageHeader (apps/users/components/ui/page-header.tsx): back, and the page's name. */
export function PageHeader({ title, backTo = '/home' }: { title: string; backTo?: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace(backTo as Href))}
        style={styles.back}
      >
        <IconArrowLeft size={22} stroke={1.5} color={colors.textPrimary} />
      </Pressable>
      <T accessibilityRole="header" size={20} lh={28} tracking={-0.015} numberOfLines={1} style={styles.title}>
        {title}
      </T>
    </View>
  );
}

const useStyles = createStyles(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 52 },
  back: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flexShrink: 1 },
}));
