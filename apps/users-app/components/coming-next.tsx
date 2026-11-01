import { ScButton } from '@repo/native-ui/button';
import { IconArrowLeft } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A v1.1 screen (rewards, credit, gifts): where a button leads to a screen a later version build, so every button goes
 * somewhere and the routes are already in place. Goes away as those screens arrive.
 */
export function ComingNext({ title }: { title: string; stage?: 2 | 3 }) {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/home' as Href));
  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={styles.back}>
        <IconArrowLeft size={22} stroke={1.5} />
      </Pressable>
      <View style={styles.body}>
        <T accessibilityRole="header" size={17} weight={600} align="center">
          {title}
        </T>
        <T size={13} color={colors.textSecondary} align="center">
          This part of the app comes in the next version. It's on detlio.com today.
        </T>
        <ScButton variant="outline" fullWidth={false} onPress={back}>
          Go back
        </ScButton>
      </View>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas, paddingHorizontal: 16 },
  back: { width: 44, height: 44, marginLeft: -11, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
}));
