import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

import { AppShell } from './app-shell';
import { IconArrowLeft } from './icons';
import { T } from './text';

/** A screen that isn't built yet: plain, and honest about it. */
export function ComingScreen({ title, back }: { title: string; back?: boolean }) {
  return (
    <AppShell hasNav={!back} gap={0}>
      {back ? (
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home' as Href))}
            style={styles.back}
          >
            <IconArrowLeft size={22} stroke={1.5} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.body}>
        <T accessibilityRole="header" size={18} weight={700} align="center">
          {title}
        </T>
        <T size={14} color={colors.textSecondary} align="center">
          Coming in the next version.
        </T>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  top: { height: 44, justifyContent: 'center' },
  back: { width: 44, height: 44, marginLeft: -11, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
