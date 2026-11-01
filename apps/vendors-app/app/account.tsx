import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { Label, ScButton } from '@/components/button';
import { IconArrowLeft, IconLogout } from '@/components/icons';
import { ScCard } from '@/components/primitives';
import { T } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

/**
 * Your account (apps/vendors/app/account/page.tsx): who is signed in, and Log out.
 * Leave garage, delete login and Support come with stage 2.
 */
function AccountScreen() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const [busy, setBusy] = useState(false);

  return (
    <AppShell hasNav={false}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home' as Href))}
          style={styles.back}
        >
          <IconArrowLeft size={22} stroke={1.5} />
        </Pressable>
        <T accessibilityRole="header" size={18} weight={700}>
          Your account
        </T>
      </View>
      {user ? (
        <ScCard style={styles.card}>
          <T size={15} weight={600}>
            {user.name}
          </T>
          <T num size={13} color={colors.textSecondary}>{`+91 ${user.phone}`}</T>
        </ScCard>
      ) : null}
      <ScButton
        variant="outline"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        }}
      >
        <IconLogout size={18} />
        <Label>Log out</Label>
      </ScButton>
    </AppShell>
  );
}

export default garageScreen(AccountScreen);

const styles = StyleSheet.create({
  top: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, marginLeft: -11, marginRight: -11, alignItems: 'center', justifyContent: 'center' },
  card: { gap: 2 },
});
