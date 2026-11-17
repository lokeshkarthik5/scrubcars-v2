import { useT } from '@repo/core/i18n';
import { TopGlow } from '@repo/native-ui/finish';
import { IconArrowLeft } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

/** PageHeader (apps/users/components/ui/page-header.tsx): back, and the page's name. */
export function PageHeader({
  title,
  backTo = '/home',
  onBack,
  right,
}: {
  title: string;
  backTo?: string;
  /** What the arrow does instead of going back (a screen's own step back). */
  onBack?: () => void;
  /** Beside the title, at the end of the row ("Step 1 of 2"). */
  right?: ReactNode;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.header}>
      {/* The finish's faint red light at the top of the screen, under what follows. */}
      <View pointerEvents="none" style={styles.glow}>
        <TopGlow />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Back')}
        onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace(backTo as Href))}
        style={styles.back}
      >
        <IconArrowLeft size={22} color={colors.textPrimary} />
      </Pressable>
      <T accessibilityRole="header" variant="t2" numberOfLines={1} style={styles.title}>
        {title}
      </T>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const useStyles = createStyles(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 52 },
  back: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flexShrink: 1, flex: 1 },
  right: { flexShrink: 0, paddingRight: 8 },
  glow: { position: 'absolute', left: 0, top: -64 },
}));
