import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AccountActions } from '@/components/account-actions';
import { AppShell, garageScreen } from '@/components/app-shell';
import { Label, ScButton } from '@/components/button';
import { IconLogout } from '@/components/icons';
import { ScCard } from '@/components/primitives';
import { SectionHeader, TopBar } from '@/components/rows';
import { SupportCard } from '@/components/support-card';
import { T } from '@/components/text';
import { APP_VERSION } from '@/lib/app-config';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

/** apps/vendors/app/account/page.tsx: who is signed in, and the ways out, for every seat. */
function AccountScreen() {
  const user = useAuth((s) => s.user);
  const vendor = useAuth((s) => s.vendor);
  const vendorCount = useAuth((s) => s.vendors.length);
  const signOut = useAuth((s) => s.signOut);
  const [busy, setBusy] = useState(false);

  return (
    <AppShell
      showBrand
      brandRight={
        vendorCount > 1 ? undefined : (
          <T size={14} weight={500} color={colors.textSecondary} numberOfLines={1}>
            {vendor?.businessName}
          </T>
        )
      }
    >
      <TopBar title="Your account" onBack={() => router.navigate('/home' as Href)} />
      {user ? (
        <ScCard style={styles.card}>
          <T size={15} weight={600}>
            {user.name}
          </T>
          <T num size={13} color={colors.textSecondary}>{`+91 ${user.phone}`}</T>
        </ScCard>
      ) : null}

      <AccountActions />

      <View style={styles.section}>
        <SectionHeader title="Support" />
        <SupportCard />
      </View>

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

      <T num size={12} color={colors.textMuted} align="center" style={styles.version}>
        {`Detlio for Garages ${APP_VERSION}`}
      </T>
    </AppShell>
  );
}

export default garageScreen(AccountScreen);

const styles = StyleSheet.create({
  card: { gap: 2 },
  section: { gap: 12 },
  version: { marginBottom: 8 },
});
